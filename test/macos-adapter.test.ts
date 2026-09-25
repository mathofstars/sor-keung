import assert from "node:assert/strict";
import test from "node:test";
import { MacOsActionAdapter } from "../src/actions/macos";

test("open_app launches trusted bundle identifier with argument array", async () => {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  const adapter = new MacOsActionAdapter(async (executable, args) => {
    calls.push({ executable, args });
  });

  const result = await adapter.execute({
    name: "open_app",
    args: {
  id: "bundle:com.spotify.client",
  displayName: "Spotify",
  platform: "macos" as const,
  bundleIdentifier: "com.spotify.client",
  launchName: "Spotify"
}
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    { executable: "/usr/bin/open", args: ["-b", "com.spotify.client"] }
  ]);
});

test("open_app safely falls back to trusted canonical app name", async () => {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  const adapter = new MacOsActionAdapter(async (executable, args) => {
    calls.push({ executable, args });
  });

  await adapter.execute({
    name: "open_app",
    args: {
      id: "name:example app",
      displayName: "Example App",
      platform: "macos",
      launchName: "Example App"
    }
  });

  assert.deepEqual(calls, [
    { executable: "/usr/bin/open", args: ["-a", "Example App"] }
  ]);
});

test("bundle identifier is passed as data and never as a shell command", async () => {
  const calls: Array<{ executable: string; args: readonly string[] }> = [];
  const adapter = new MacOsActionAdapter(async (executable, args) => {
    calls.push({ executable, args });
  });

  await adapter.execute({
    name: "open_app",
    args: {
      id: "bundle:com.example.safe",
      displayName: "Safe App",
      platform: "macos",
      bundleIdentifier: "com.example.safe",
      launchName: "Safe App"
    }
  });

  assert.deepEqual(calls, [
    { executable: "/usr/bin/open", args: ["-b", "com.example.safe"] }
  ]);
});

test("process failures become APP_NOT_FOUND instead of crashing", async () => {
  const adapter = new MacOsActionAdapter(async () => {
    throw new Error("not found");
  });

  const result = await adapter.execute({
    name: "open_app",
    args: {
  id: "bundle:com.spotify.client",
  displayName: "Spotify",
  platform: "macos" as const,
  bundleIdentifier: "com.spotify.client",
  launchName: "Spotify"
}
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "APP_NOT_FOUND");
});
