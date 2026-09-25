import assert from "node:assert/strict";
import test from "node:test";
import { ActionDispatcher } from "../src/actions/dispatcher";
import type { ActionAdapter, ActionRequest } from "../src/actions/types";

const spotify: ActionRequest = {
  name: "open_app",
  args: {
  id: "bundle:com.spotify.client",
  displayName: "Spotify",
  platform: "macos" as const,
  bundleIdentifier: "com.spotify.client",
  launchName: "Spotify"
}
};

test("allow-all policy dispatches resolved open_app to the platform adapter", async () => {
  const calls: ActionRequest[] = [];
  const adapter: ActionAdapter = {
    platform: "macos",
    async execute(request) {
      calls.push(request);
      return { ok: true, code: "OK", messageKey: "actions.openedApp" };
    }
  };

  const dispatcher = new ActionDispatcher(adapter);
  const result = await dispatcher.dispatch(spotify);

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [spotify]);
});

test("selected-app-only policy blocks installed app not explicitly enabled", async () => {
  let called = false;
  const adapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      called = true;
      return { ok: true, code: "OK", messageKey: "actions.openedApp" };
    }
  };

  const dispatcher = new ActionDispatcher(adapter, {
    allowAllInstalledApps: false,
    allowedAppIds: []
  });
  const result = await dispatcher.dispatch(spotify);

  assert.equal(result.ok, false);
  assert.equal(result.code, "APP_BLOCKED");
  assert.equal(called, false);
});

test("selected-app-only policy dispatches explicitly enabled app", async () => {
  const calls: ActionRequest[] = [];
  const adapter: ActionAdapter = {
    platform: "macos",
    async execute(request) {
      calls.push(request);
      return { ok: true, code: "OK", messageKey: "actions.openedApp" };
    }
  };

  const dispatcher = new ActionDispatcher(adapter, {
    allowAllInstalledApps: false,
    allowedAppIds: ["bundle:com.spotify.client"]
  });
  const result = await dispatcher.dispatch(spotify);

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [spotify]);
});

test("does not dispatch other allowlisted actions during Stage 3", async () => {
  let called = false;
  const adapter: ActionAdapter = {
    platform: "macos",
    async execute() {
      called = true;
      return { ok: true, code: "OK", messageKey: "unexpected" };
    }
  };

  const dispatcher = new ActionDispatcher(adapter);
  const result = await dispatcher.dispatch({
    name: "set_volume",
    args: { percent: 50 }
  });

  assert.equal(result.code, "UNSUPPORTED_ACTION");
  assert.equal(called, false);
});
