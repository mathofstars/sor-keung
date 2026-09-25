import assert from "node:assert/strict";
import test from "node:test";
import { MacOsActionAdapter } from "../src/actions/macos";

test("open_app invokes absolute macOS open path with an argument array", async () => {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  const adapter = new MacOsActionAdapter(async (executable, args) => {
    calls.push({ executable, args });
  });

  const result = await adapter.execute({
    name: "open_app",
    args: { app: "Spotify" }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    { executable: "/usr/bin/open", args: ["-a", "Spotify"] }
  ]);
});

test("open_app keeps shell-like characters as app-name data", async () => {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  const adapter = new MacOsActionAdapter(async (executable, args) => {
    calls.push({ executable, args });
  });

  await adapter.execute({
    name: "open_app",
    args: { app: "Spotify; echo unsafe" }
  });

  assert.deepEqual(calls, [
    {
      executable: "/usr/bin/open",
      args: ["-a", "Spotify; echo unsafe"]
    }
  ]);
});

test("process failures become APP_NOT_FOUND instead of crashing", async () => {
  const adapter = new MacOsActionAdapter(async () => {
    throw new Error("not found");
  });

  const result = await adapter.execute({
    name: "open_app",
    args: { app: "ExampleApp" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "APP_NOT_FOUND");
});
