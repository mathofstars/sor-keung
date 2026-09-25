import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stage 3 HTML provides chat transcript, multiline composer and settings view", async () => {
  const html = await readFile("desktop/index.html", "utf8");

  assert.match(html, /id="transcript"/);
  assert.match(html, /<textarea[\s\S]*id="request-input"/);
  assert.match(html, /id="settings-view"/);
  assert.match(html, /id="api-key-input"/);
  assert.match(html, /id="response-style-select"/);
  assert.match(html, /id="ui-language-select"/);
});

test("desktop UI blocks duplicate submit and supports Enter versus Shift+Enter", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /if \(requestRunning\) return/);
  assert.match(frontend, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(frontend, /sendButton\.disabled = busy/);
});

test("visible transcript remains UI-only and current request sends one input", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /const request: DesktopRequest = \{[\s\S]*input,/);
  assert.doesNotMatch(frontend, /conversationHistory|chatHistory|messages:/);
  assert.doesNotMatch(frontend, /transcript\.textContent.*run_sor_keung/);
});

test("assistant message rendering uses textContent rather than HTML injection", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /body\.textContent = text/);
  assert.doesNotMatch(frontend, /innerHTML/);
});
