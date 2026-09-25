import assert from "node:assert/strict";
import test from "node:test";
import type { ActionAdapter, ActionRequest } from "../src/actions/types";
import {
  handleDesktopSidecarRequest,
  handleDesktopSidecarRequestFromEnvironment
} from "../src/desktop-sidecar-service";
import type {
  DecisionProvider,
  LlmProvider
} from "../src/providers/types";

const spotify: ActionRequest = {
  name: "open_app",
  args: {
    id: "bundle:com.spotify.client",
    displayName: "Spotify",
    platform: "macos",
    bundleIdentifier: "com.spotify.client",
    launchName: "Spotify"
  }
};

const messages: ActionRequest = {
  name: "open_app",
  args: {
    id: "bundle:com.apple.MobileSMS",
    displayName: "Messages",
    platform: "macos",
    bundleIdentifier: "com.apple.MobileSMS",
    launchName: "Messages"
  }
};

test("desktop wrapper preserves the open_app action pipeline", async () => {
  const actions: ActionRequest[] = [];
  let llmCalls = 0;

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "action", action: spotify };
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      llmCalls += 1;
      return { text: "should not run" };
    }
  };

  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute(request) {
      actions.push(request);
      return {
        ok: true,
        code: "OK",
        messageKey: "actions.openedApp",
        data: { app: "Spotify" }
      };
    }
  };

  const result = await handleDesktopSidecarRequest(
    { input: "開 Spotify", uiLanguage: "zh-HK" },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.deepEqual(result, {
    ok: true,
    kind: "action",
    message: "✓ Spotify 已經幫你開咗。"
  });
  assert.equal(llmCalls, 0);
  assert.deepEqual(actions, [spotify]);
});

test("selected-app policy blocks disabled installed app before adapter", async () => {
  let adapterCalls = 0;

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "action", action: messages };
    }
  };
  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      return { text: "unused" };
    }
  };
  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      adapterCalls += 1;
      return { ok: true, code: "OK", messageKey: "actions.openedApp" };
    }
  };

  const result = await handleDesktopSidecarRequest(
    { input: "Open Messages", uiLanguage: "en-GB" },
    {
      decisionProvider,
      llmProvider,
      actionAdapter,
      appAccessPolicy: {
        allowAllInstalledApps: false,
        allowedAppIds: []
      }
    }
  );

  assert.deepEqual(result, {
    ok: false,
    kind: "error",
    message: "This application is not allowed to open: Messages"
  });
  assert.equal(adapterCalls, 0);
});

test("selected-app policy permits explicitly enabled installed app", async () => {
  const actions: ActionRequest[] = [];

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "action", action: messages };
    }
  };
  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      return { text: "unused" };
    }
  };
  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute(request) {
      actions.push(request);
      return {
        ok: true,
        code: "OK",
        messageKey: "actions.openedApp",
        data: { app: "Messages" }
      };
    }
  };

  const result = await handleDesktopSidecarRequest(
    { input: "Open Messages", uiLanguage: "en-GB" },
    {
      decisionProvider,
      llmProvider,
      actionAdapter,
      appAccessPolicy: {
        allowAllInstalledApps: false,
        allowedAppIds: ["bundle:com.apple.MobileSMS"]
      }
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(actions, [messages]);
});

test("written response style also affects Chinese action acknowledgement", async () => {
  const safari: ActionRequest = {
    name: "open_app",
    args: {
      id: "bundle:com.apple.Safari",
      displayName: "Safari",
      platform: "macos",
      bundleIdentifier: "com.apple.Safari",
      launchName: "Safari"
    }
  };

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "action", action: safari };
    }
  };
  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      return { text: "unused" };
    }
  };
  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      return {
        ok: true,
        code: "OK",
        messageKey: "actions.openedApp",
        data: { app: "Safari" }
      };
    }
  };

  const result = await handleDesktopSidecarRequest(
    {
      input: "開 Safari",
      uiLanguage: "zh-HK",
      responseStyle: "written-zh-hk"
    },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.equal(result.message, "✓ 已開啟 Safari");
});

test("desktop wrapper preserves the existing LLM text-only route", async () => {
  let actionCalls = 0;
  let llmPrompt = "";
  let responseStyle = "";

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "llm" };
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate(request) {
      llmPrompt = request.prompt;
      responseStyle = request.responseStyle ?? "";
      return { text: "量子糾纏係一種量子力學現象。" };
    }
  };

  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      actionCalls += 1;
      return { ok: false, code: "UNSUPPORTED_ACTION", messageKey: "unexpected" };
    }
  };

  const result = await handleDesktopSidecarRequest(
    { input: "解釋量子糾纏是甚麼", uiLanguage: "zh-HK" },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.deepEqual(result, {
    ok: true,
    kind: "llm",
    message: "量子糾纏係一種量子力學現象。"
  });
  assert.equal(actionCalls, 0);
  assert.equal(llmPrompt, "解釋量子糾纏是甚麼");
  assert.equal(responseStyle, "cantonese-hk");
});

test("safe app-resolution failures become structured error results", async () => {
  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return {
        route: "action_error",
        result: {
          ok: false,
          code: "APP_NOT_FOUND",
          messageKey: "actions.appNotFound",
          data: { app: "ExampleApp" }
        }
      };
    }
  };

  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      return { text: "unused" };
    }
  };

  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      throw new Error("must not run");
    }
  };

  const result = await handleDesktopSidecarRequest(
    { input: "開 ExampleApp", uiLanguage: "zh-HK" },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.deepEqual(result, {
    ok: false,
    kind: "error",
    message: "找不到指定的應用程式：ExampleApp"
  });
});

test("missing API key fails clearly without network access", async () => {
  const result = await handleDesktopSidecarRequestFromEnvironment(
    { input: "開 Spotify", uiLanguage: "zh-HK" },
    {}
  );

  assert.deepEqual(result, {
    ok: false,
    kind: "error",
    message: "尚未設定 OpenRouter API Key。"
  });
});

test("invalid empty request fails safely", async () => {
  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      throw new Error("should not run");
    }
  };
  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      throw new Error("should not run");
    }
  };
  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      throw new Error("should not run");
    }
  };

  const result = await handleDesktopSidecarRequest(
    { input: "   ", uiLanguage: "zh-HK" },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.equal(result.ok, false);
  assert.equal(result.kind, "error");
});

test("English open-app request gets English action response even with zh-HK UI", async () => {
  const calculator: ActionRequest = {
    name: "open_app",
    args: {
      id: "bundle:com.apple.calculator",
      displayName: "Calculator",
      platform: "macos",
      bundleIdentifier: "com.apple.calculator",
      launchName: "Calculator"
    }
  };

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "action", action: calculator };
    }
  };
  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      return { text: "unused" };
    }
  };
  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      return {
        ok: true,
        code: "OK",
        messageKey: "actions.openedApp",
        data: { app: "Calculator" }
      };
    }
  };

  const result = await handleDesktopSidecarRequest(
    {
      input: "Open Calculator",
      uiLanguage: "zh-HK",
      responseLanguageMode: "follow-input"
    },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.deepEqual(result, {
    ok: true,
    kind: "action",
    message: "Calculator opened."
  });
});

test("Chinese open-app request gets configured Chinese action style even with English UI", async () => {
  const calculator: ActionRequest = {
    name: "open_app",
    args: {
      id: "bundle:com.apple.calculator",
      displayName: "Calculator",
      platform: "macos",
      bundleIdentifier: "com.apple.calculator",
      launchName: "Calculator"
    }
  };

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "action", action: calculator };
    }
  };
  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate() {
      return { text: "unused" };
    }
  };
  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      return {
        ok: true,
        code: "OK",
        messageKey: "actions.openedApp",
        data: { app: "Calculator" }
      };
    }
  };

  const result = await handleDesktopSidecarRequest(
    {
      input: "開 Calculator",
      uiLanguage: "en-GB",
      responseLanguageMode: "follow-input",
      responseStyle: "cantonese-hk"
    },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.deepEqual(result, {
    ok: true,
    kind: "action",
    message: "✓ Calculator 已經幫你開咗。"
  });
});

test("written-zh-hk reaches LLM provider at request time", async () => {
  let seenStyle = "";
  let seenInputLanguage = "";

  const decisionProvider: DecisionProvider = {
    id: "mock-decision",
    async decide() {
      return { route: "llm" };
    }
  };
  const llmProvider: LlmProvider = {
    id: "mock-llm",
    async generate(request) {
      seenStyle = request.responseStyle ?? "";
      seenInputLanguage = request.inputLanguage ?? "";
      return { text: "量子糾纏是一種量子力學現象。" };
    }
  };
  const actionAdapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      throw new Error("must not run");
    }
  };

  const result = await handleDesktopSidecarRequest(
    {
      input: "解釋量子糾纏是甚麼",
      uiLanguage: "zh-HK",
      responseLanguageMode: "follow-input",
      responseStyle: "written-zh-hk"
    },
    { decisionProvider, llmProvider, actionAdapter }
  );

  assert.equal(result.ok, true);
  assert.equal(seenStyle, "written-zh-hk");
  assert.equal(seenInputLanguage, "yue-HK");
});
