import assert from "node:assert/strict";
import test from "node:test";
import { StaticAppCatalog, type InstalledAppRecord } from "../src/apps/types";
import {
  OpenRouterJevDecisionProvider,
  type FetchLike
} from "../src/providers/openrouter-jev";

const messages: InstalledAppRecord = {
  id: "bundle:com.apple.MobileSMS",
  displayName: "Messages",
  platform: "macos",
  bundleIdentifier: "com.apple.MobileSMS",
  launchName: "Messages"
};

const spotify: InstalledAppRecord = {
  id: "bundle:com.spotify.client",
  displayName: "Spotify",
  platform: "macos",
  bundleIdentifier: "com.spotify.client",
  launchName: "Spotify"
};

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

function openAppAnswer(confidence = 0.98) {
  return {
    answers: {
      intent: {
        type: "choice",
        choice: "open_app",
        probabilities: { open_app: 0.99, llm: 0.01 },
        confidence
      }
    }
  };
}

test("Jev routes generic open-app intent then resolves Messages from trusted catalogue", async () => {
  const { fetchImpl, calls } = mockFetch(openAppAnswer());

  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl,
    appCatalog: new StaticAppCatalog([messages, spotify])
  });

  const result = await provider.decide({ text: "Open Messages" });

  assert.deepEqual(result, {
    route: "action",
    action: { name: "open_app", args: messages }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://openrouter.ai/api/alpha/decisions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "typesafe/jev-1.13");
  assert.equal(body.state, "Open Messages");
  assert.deepEqual(Object.keys(body.questions.intent.criteria).sort(), [
    "llm",
    "open_app"
  ]);
  assert.doesNotMatch(calls[0].init.body, /Spotify|Messages|Calculator/);
});

test("English and Cantonese app commands use the same generic intent request shape", async () => {
  const { fetchImpl, calls } = mockFetch(openAppAnswer());
  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl,
    appCatalog: new StaticAppCatalog([spotify])
  });

  await provider.decide({ text: "開 Spotify" });
  await provider.decide({ text: "Open Spotify" });

  const first = JSON.parse(calls[0].init.body);
  const second = JSON.parse(calls[1].init.body);

  assert.equal(first.state, "開 Spotify");
  assert.equal(second.state, "Open Spotify");
  assert.deepEqual(first.questions.intent.criteria, second.questions.intent.criteria);
});

test("nonexistent app produces safe APP_NOT_FOUND without launching another app", async () => {
  const { fetchImpl } = mockFetch(openAppAnswer());
  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl,
    appCatalog: new StaticAppCatalog([messages, spotify])
  });

  assert.deepEqual(await provider.decide({ text: "Open NotARealApp" }), {
    route: "action_error",
    result: {
      ok: false,
      code: "APP_NOT_FOUND",
      messageKey: "actions.appNotFound",
      data: { app: "NotARealApp" }
    }
  });
});

test("ambiguous installed app match fails safely", async () => {
  const { fetchImpl } = mockFetch(openAppAnswer());
  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl,
    appCatalog: new StaticAppCatalog([
      {
        id: "bundle:com.example.one",
        displayName: "Example",
        platform: "macos",
        bundleIdentifier: "com.example.one",
        launchName: "Example"
      },
      {
        id: "bundle:com.example.two",
        displayName: "Example",
        platform: "macos",
        bundleIdentifier: "com.example.two",
        launchName: "Example"
      }
    ])
  });

  const result = await provider.decide({ text: "Open Example" });
  assert.equal(result.route, "action_error");
  if (result.route === "action_error") {
    assert.equal(result.result.code, "APP_AMBIGUOUS");
  }
});

test("general requests route to the LLM", async () => {
  const { fetchImpl } = mockFetch({
    answers: {
      intent: {
        type: "choice",
        choice: "llm",
        probabilities: { llm: 0.95, open_app: 0.05 },
        confidence: 0.9
      }
    }
  });

  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl,
    appCatalog: new StaticAppCatalog([spotify])
  });

  assert.deepEqual(await provider.decide({ text: "解釋量子糾纏" }), {
    route: "llm"
  });
});

test("uncertain decisions fall back to text-only LLM route", async () => {
  const { fetchImpl } = mockFetch(openAppAnswer(0.55));

  const provider = new OpenRouterJevDecisionProvider({
    apiKey: "test-key",
    fetchImpl,
    appCatalog: new StaticAppCatalog([spotify]),
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
