import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenRouterJevDecisionProvider,
  type FetchLike
} from "../src/providers/openrouter-jev";

function mockFetch(payload: unknown, options?: { ok?: boolean; status?: number }) {
  const calls: Array<{ input: string; init: Parameters<FetchLike>[1] }> = [];

  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    return {
      ok: options?.ok ?? true,
      status: options?.status ?? 200,
      async json() {
        return payload;
      }
    };
  };

  return { fetchImpl, calls };
}

test("translates a Jev Spotify choice into Sor-Keung open_app", async () => {
  const { fetchImpl, calls } = mockFetch({
    model: "typesafe/jev-1.13-20260917",
    answers: {
      intent: {
        type: "choice",
        choice: "open_app_0",
        probabilities: { open_app_0: 0.99, llm: 0.01 },
        confidence: 0.98
      }
    }
  });

  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl
  });

  const result = await provider.decide({ text: "開 Spotify" });

  assert.deepEqual(result, {
    route: "action",
    action: { name: "open_app", args: { app: "Spotify" } }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://openrouter.ai/api/alpha/decisions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "typesafe/jev-1.13");
  assert.equal(body.state, "開 Spotify");
  assert.equal(body.questions.intent.type, "choice");
  assert.ok(body.questions.intent.criteria.llm);
});

test("English and Cantonese app commands use the same decision request shape", async () => {
  const { fetchImpl, calls } = mockFetch({
    answers: {
      intent: {
        type: "choice",
        choice: "open_app_0",
        probabilities: { open_app_0: 1, llm: 0 },
        confidence: 1
      }
    }
  });

  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl
  });

  await provider.decide({ text: "開 Spotify" });
  await provider.decide({ text: "Open Spotify" });

  assert.equal(JSON.parse(calls[0].init.body).state, "開 Spotify");
  assert.equal(JSON.parse(calls[1].init.body).state, "Open Spotify");
});

test("general requests route to the LLM", async () => {
  const { fetchImpl } = mockFetch({
    answers: {
      intent: {
        type: "choice",
        choice: "llm",
        probabilities: { llm: 0.95, open_app_0: 0.05 },
        confidence: 0.9
      }
    }
  });

  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl
  });

  assert.deepEqual(await provider.decide({ text: "解釋量子糾纏" }), {
    route: "llm"
  });
});

test("uncertain decisions fall back to text-only LLM route", async () => {
  const { fetchImpl } = mockFetch({
    answers: {
      intent: {
        type: "choice",
        choice: "open_app_0",
        probabilities: { open_app_0: 0.55, llm: 0.45 },
        confidence: 0.55
      }
    }
  });

  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl,
    minConfidence: 0.6
  });

  assert.deepEqual(await provider.decide({ text: "Maybe Spotify?" }), {
    route: "llm"
  });
});

test("malformed provider responses are rejected", async () => {
  const { fetchImpl } = mockFetch({ answers: { intent: { type: "choice" } } });
  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(
    () => provider.decide({ text: "開 Spotify" }),
    /Malformed Jev choice response/
  );
});

test("unexpected Jev choices fail rather than silently invoking LLM", async () => {
  const { fetchImpl } = mockFetch({
    answers: {
      intent: {
        type: "choice",
        choice: "run_shell",
        probabilities: { run_shell: 1 },
        confidence: 1
      }
    }
  });
  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(
    () => provider.decide({ text: "Run something" }),
    /Unexpected Jev choice/
  );
});

test("missing API key fails before any request", async () => {
  const { fetchImpl, calls } = mockFetch({});
  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "",
    fetchImpl
  });

  await assert.rejects(
    () => provider.decide({ text: "開 Spotify" }),
    /OPENROUTER_API_KEY is missing/
  );
  assert.equal(calls.length, 0);
});

test("decision API errors are reported without exposing credentials", async () => {
  const { fetchImpl } = mockFetch({}, { ok: false, status: 401 });
  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "super-secret",
    fetchImpl
  });

  await assert.rejects(
    () => provider.decide({ text: "開 Spotify" }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "OpenRouter decision request failed with status 401" &&
      !error.message.includes("super-secret")
  );
});
