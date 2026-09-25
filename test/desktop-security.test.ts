import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("frontend exposes only narrow Sor-Keung and credential commands", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /invoke<DesktopSidecarResponse>\("run_sor_keung"/);
  assert.match(frontend, /invoke<boolean>\("has_api_key"\)/);
  assert.match(frontend, /invoke<void>\("save_api_key"/);
  assert.match(frontend, /invoke<void>\("delete_api_key"\)/);
  assert.doesNotMatch(frontend, /read_raw_secret|get_api_key/);
  assert.doesNotMatch(frontend, /@tauri-apps\/plugin-shell/);
  assert.doesNotMatch(frontend, /Command\.sidecar/);
  assert.doesNotMatch(frontend, /localStorage|sessionStorage|indexedDB/);
});

test("normal chat invoke never supplies the API key", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  const runInvoke = frontend.match(
    /invoke<DesktopSidecarResponse>\("run_sor_keung",[\s\S]*?\);/
  )?.[0];

  assert.ok(runInvoke);
  assert.doesNotMatch(runInvoke, /apiKey|secret/);
});

test("Rust bridge retrieves keyring secret and passes it only via child environment", async () => {
  const bridge = await readFile("src-tauri/src/lib.rs", "utf8");

  assert.match(bridge, /const SIDECAR_NAME: &str = "sor-keung-sidecar"/);
  assert.match(bridge, /KEYRING_SERVICE/);
  assert.match(bridge, /Entry::new\(KEYRING_SERVICE, KEYRING_ACCOUNT\)/);
  assert.match(bridge, /fn has_api_key\(\)/);
  assert.match(bridge, /fn save_api_key\(secret: String\)/);
  assert.match(bridge, /fn delete_api_key\(\)/);
  assert.match(bridge, /\.sidecar\(SIDECAR_NAME\)/);
  assert.match(bridge, /\.env\("OPENROUTER_API_KEY", &api_key\)/);
  assert.doesNotMatch(bridge, /run_sor_keung\([\s\S]{0,250}api_key: String/);
  assert.doesNotMatch(bridge, /\.arg\(&?api_key\)/);
  assert.doesNotMatch(bridge, /println!\([^\n]*api_key/);
});

test("Tauri capability grants settings store but not shell execution", async () => {
  const capability = await readFile(
    "src-tauri/capabilities/default.json",
    "utf8"
  );

  assert.match(capability, /store:default/);
  assert.doesNotMatch(capability, /shell:allow-execute/);
  assert.doesNotMatch(capability, /shell:allow-spawn/);
});

test("desktop settings never persist the API key", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");
  const settings = await readFile("desktop/settings.ts", "utf8");
  const html = await readFile("desktop/index.html", "utf8");

  assert.doesNotMatch(settings, /api.?key|secret/i);
  assert.doesNotMatch(frontend, /localStorage|sessionStorage|indexedDB/);
  assert.match(html, /id="api-key-input"[\s\S]*type="password"/);
});
