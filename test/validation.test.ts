import assert from "node:assert/strict";
import test from "node:test";
import { validateActionCandidate } from "../src/brain/validation";

test("accepts a trusted installed-app open_app action", () => {
  assert.deepEqual(
    validateActionCandidate({
      action: "open_app",
      parameters: {
        id: "bundle:com.spotify.client",
        displayName: "Spotify",
        platform: "macos",
        bundleIdentifier: "com.spotify.client",
        launchName: "Spotify"
      }
    }),
    {
      name: "open_app",
      args: {
        id: "bundle:com.spotify.client",
        displayName: "Spotify",
        platform: "macos",
        bundleIdentifier: "com.spotify.client",
        launchName: "Spotify"
      }
    }
  );
});

test("rejects arbitrary shell actions", () => {
  assert.equal(
    validateActionCandidate({
      action: "run_shell",
      parameters: { command: "rm -rf /" }
    }),
    null
  );
});

test("rejects legacy app-name-only action parameters", () => {
  assert.equal(
    validateActionCandidate({
      action: "open_app",
      parameters: { app: "Spotify" }
    }),
    null
  );
});

test("rejects executable paths and path-like launch metadata", () => {
  assert.equal(
    validateActionCandidate({
      action: "open_app",
      parameters: {
        id: "bundle:evil",
        displayName: "Example",
        platform: "macos",
        bundleIdentifier: "/bin/sh",
        launchName: "Example"
      }
    }),
    null
  );

  assert.equal(
    validateActionCandidate({
      action: "open_app",
      parameters: {
        id: "name:evil",
        displayName: "Example",
        platform: "macos",
        launchName: "../../bin/sh"
      }
    }),
    null
  );
});

test("rejects missing or malformed trusted app parameters", () => {
  assert.equal(validateActionCandidate({ action: "open_app", parameters: {} }), null);
  assert.equal(
    validateActionCandidate({
      action: "open_app",
      parameters: {
        id: "",
        displayName: "Spotify",
        platform: "macos",
        launchName: "Spotify"
      }
    }),
    null
  );
});
