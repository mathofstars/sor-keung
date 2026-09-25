import assert from "node:assert/strict";
import test from "node:test";
import { ActionDispatcher } from "../src/actions/dispatcher";
import type { ActionAdapter, ActionRequest } from "../src/actions/types";
import { SorKeungBrain } from "../src/brain/service";
import type { DecisionProvider, LlmProvider, LlmRequest } from "../src/providers/types";

function makeAdapter(calls: ActionRequest[]): ActionAdapter {
  return {
    platform: "macos",
    async execute(request) {
      calls.push(request);
      return {
        ok: true,
        code: "OK",
        messageKey: "actions.openedApp",
        data: request.name === "open_app" ? { app: request.args.app } : undefined
      };
    }
  };
}

test("OS action route dispatches action and does not call LLM", async () => {
  const actionCalls: ActionRequest[] = [];
  let llmCalls = 0;

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return {
        route: "action",
        action: { name: "open_app", args: { app: "Spotify" } }
      };
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      llmCalls += 1;
      return { text: "should not run" };
    }
  };

  const brain = new SorKeungBrain(
    decisionProvider,
    llmProvider,
    new ActionDispatcher(makeAdapter(actionCalls))
  );

  const result = await brain.handle({ text: "開 Spotify" });

  assert.equal(result.kind, "action");
  assert.equal(llmCalls, 0);
  assert.deepEqual(actionCalls, [
    { name: "open_app", args: { app: "Spotify" } }
  ]);
});

test("general request invokes LLM and does not call action adapter", async () => {
  const actionCalls: ActionRequest[] = [];
  const llmCalls: LlmRequest[] = [];

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "llm" };
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate(request) {
      llmCalls.push(request);
      return { text: "量子糾纏是一種量子力學現象。" };
    }
  };

  const brain = new SorKeungBrain(
    decisionProvider,
    llmProvider,
    new ActionDispatcher(makeAdapter(actionCalls))
  );

  const result = await brain.handle({
    text: "解釋量子糾纏",
    responseLanguageMode: "follow-input"
  });

  assert.deepEqual(result, {
    kind: "text",
    text: "量子糾纏是一種量子力學現象。",
    language: undefined
  });
  assert.equal(actionCalls.length, 0);
  assert.equal(llmCalls.length, 1);
  assert.equal(llmCalls[0].prompt, "解釋量子糾纏");
});

test("English general request follows the same LLM route", async () => {
  let actionCalled = false;
  let seenPrompt = "";

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "llm" };
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate(request) {
      seenPrompt = request.prompt;
      return { text: "Quantum entanglement is..." };
    }
  };

  const adapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      actionCalled = true;
      return { ok: false, code: "UNSUPPORTED_ACTION", messageKey: "unexpected" };
    }
  };

  const brain = new SorKeungBrain(
    decisionProvider,
    llmProvider,
    new ActionDispatcher(adapter)
  );

  const result = await brain.handle({
    text: "Explain quantum entanglement.",
    responseLanguageMode: "follow-input"
  });

  assert.equal(result.kind, "text");
  assert.equal(seenPrompt, "Explain quantum entanglement.");
  assert.equal(actionCalled, false);
});

test("unsupported dangerous computer request remains text-only", async () => {
  let actionCalled = false;

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "llm" };
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      return {
        text: "I cannot execute that computer action."
      };
    }
  };

  const adapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      actionCalled = true;
      return { ok: true, code: "OK", messageKey: "unexpected" };
    }
  };

  const brain = new SorKeungBrain(
    decisionProvider,
    llmProvider,
    new ActionDispatcher(adapter)
  );

  const result = await brain.handle({ text: "Run rm -rf /" });

  assert.deepEqual(result, {
    kind: "text",
    text: "I cannot execute that computer action.",
    language: undefined
  });
  assert.equal(actionCalled, false);
});

test("Jev failure does not automatically fall through to LLM", async () => {
  let llmCalled = false;

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      throw new Error("decision provider unavailable");
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      llmCalled = true;
      return { text: "fallback" };
    }
  };

  const brain = new SorKeungBrain(
    decisionProvider,
    llmProvider,
    new ActionDispatcher(makeAdapter([]))
  );

  await assert.rejects(
    () => brain.handle({ text: "開 Spotify" }),
    /decision provider unavailable/
  );
  assert.equal(llmCalled, false);
});
