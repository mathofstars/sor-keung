import assert from "node:assert/strict";
import test from "node:test";
import { ActionDispatcher } from "../src/actions/dispatcher";
import type { ActionAdapter, ActionRequest } from "../src/actions/types";

test("dispatches open_app to the platform adapter", async () => {
  const calls: ActionRequest[] = [];
  const adapter: ActionAdapter = {
    platform: "macos",
    async execute(request) {
      calls.push(request);
      return { ok: true, code: "OK", messageKey: "actions.openedApp" };
    }
  };

  const dispatcher = new ActionDispatcher(adapter);
  const request: ActionRequest = { name: "open_app", args: { app: "Spotify" } };
  const result = await dispatcher.dispatch(request);

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [request]);
});

test("does not dispatch other allowlisted actions during Stage 1", async () => {
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
