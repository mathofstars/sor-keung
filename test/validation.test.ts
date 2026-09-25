import assert from "node:assert/strict";
import test from "node:test";
import { validateActionCandidate } from "../src/brain/validation";

test("accepts a valid open_app action", () => {
  assert.deepEqual(
    validateActionCandidate({
      action: "open_app",
      parameters: { app: "Spotify" }
    }),
    { name: "open_app", args: { app: "Spotify" } }
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

test("rejects missing or malformed app parameters", () => {
  assert.equal(validateActionCandidate({ action: "open_app", parameters: {} }), null);
  assert.equal(
    validateActionCandidate({ action: "open_app", parameters: { app: 123 } }),
    null
  );
  assert.equal(
    validateActionCandidate({ action: "open_app", parameters: { app: "   " } }),
    null
  );
});
