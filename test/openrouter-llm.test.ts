import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenRouterLlmProvider,
  type LlmFetchLike
} from "../src/providers/openrouter-llm";

function mockFetch(payload: unknown, options?: { ok?: boolean; status?: number }) {
  const calls: Array<{ input: string; init: Parameters<LlmFetchLike>[1] }> = [];

  const fetchImpl: LlmFetchLike = async (input, init) => {
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

test("sends a non-streaming OpenRouter chat completion request", async () => {
  const { fetchImpl, calls } = mockFetch({
    choices: [{ message: { content: "  A concise answer.  " } }]
  });

  const provider = new OpenRouterLlmProvider({
    apiKey: "test-key",
    fetchImpl
  });

  const result = await provider.generate({
    prompt: "Explain quantum entanglement.",
    responseLanguageMode: "follow-input"
  });

  assert.deepEqual(result, { text: "A concise answer." });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].input,
    "https://openrouter.ai/api/v1/chat/completions"
  );
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "openai/gpt-5.4-mini");
  assert.equal(body.stream, false);
  assert.equal(body.messages[1].role, "user");
  assert.equal(body.messages[1].content, "Explain quantum entanglement.");
  assert.match(body.messages[0].content, /same language as the user's message/i);
  assert.match(body.messages[0].content, /text-only/i);
});

for (const status of [401, 429, 500]) {
  test(`HTTP ${status} fails safely without exposing the API key`, async () => {
    const { fetchImpl } = mockFetch({}, { ok: false, status });
    const provider = new OpenRouterLlmProvider({
      apiKey: "super-secret-key",
      fetchImpl
    });

    await assert.rejects(
      () => provider.generate({ prompt: "Hello" }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === `OpenRouter LLM request failed with status ${status}` &&
        !error.message.includes("super-secret-key")
    );
  });
}

test("malformed response body is rejected", async () => {
  const { fetchImpl } = mockFetch({ choices: [{}] });
  const provider = new OpenRouterLlmProvider({
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(
    () => provider.generate({ prompt: "Hello" }),
    /Malformed OpenRouter LLM response/
  );
});

test("empty model answer is rejected", async () => {
  const { fetchImpl } = mockFetch({
    choices: [{ message: { content: "   " } }]
  });
  const provider = new OpenRouterLlmProvider({
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(
    () => provider.generate({ prompt: "Hello" }),
    /empty response/
  );
});

test("missing API key fails before network access", async () => {
  const { fetchImpl, calls } = mockFetch({});
  const provider = new OpenRouterLlmProvider({
    apiKey: "",
    fetchImpl
  });

  await assert.rejects(
    () => provider.generate({ prompt: "Hello" }),
    /OPENROUTER_API_KEY is missing/
  );
  assert.equal(calls.length, 0);
});

test("network failure is converted to a safe provider error", async () => {
  const fetchImpl: LlmFetchLike = async () => {
    throw new Error("socket details");
  };

  const provider = new OpenRouterLlmProvider({
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(
    () => provider.generate({ prompt: "Hello" }),
    (error: unknown) =>
      error instanceof Error && error.message === "OpenRouter LLM request failed"
  );
});
