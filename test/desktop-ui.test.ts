import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stage 3 HTML provides chat, settings and installed-app access controls", async () => {
  const html = await readFile("desktop/index.html", "utf8");

  assert.match(html, /id="transcript"/);
  assert.match(html, /<textarea[\s\S]*id="request-input"/);
  assert.match(html, /id="settings-view"/);
  assert.match(html, /id="api-key-input"/);
  assert.match(html, /id="response-style-select"/);
  assert.match(html, /id="ui-language-select"/);
  assert.match(html, /id="allow-all-installed-apps"/);
  assert.match(html, /id="app-access-list"/);
});

test("desktop UI blocks duplicate submit and supports Enter versus Shift+Enter", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /if \(requestRunning\) return/);
  assert.match(frontend, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(frontend, /sendButton\.disabled = busy/);
});

test("installed app list is loaded through narrow Tauri command", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(
    frontend,
    /invoke<InstalledAppRecord\[]>\([\s\S]*"list_installed_apps"/
  );
  assert.match(frontend, /checkbox\.dataset\.appId = app\.id/);
  assert.match(frontend, /allowAllInstalledApps\.checked/);
});

test("visible transcript remains UI-only and current request sends one input", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /const request: DesktopRequest = \{[\s\S]*input,/);
  assert.doesNotMatch(frontend, /conversationHistory|chatHistory|messages:/);
  assert.doesNotMatch(frontend, /transcript\.textContent.*run_sor_keung/);
});

test("assistant and installed-app labels use textContent rather than HTML injection", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /body\.textContent = text/);
  assert.match(frontend, /text\.textContent = app\.displayName/);
  assert.doesNotMatch(frontend, /innerHTML/);
});
