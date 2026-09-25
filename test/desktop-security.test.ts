import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("frontend exposes only narrow Sor-Keung, credential, preferences and installed-app-list commands", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");
  const settings = await readFile("desktop/settings.ts", "utf8");

  assert.match(frontend, /invoke<DesktopSidecarResponse>\("run_sor_keung"/);
  assert.match(frontend, /invoke<boolean>\("has_api_key"\)/);
  assert.match(frontend, /invoke<void>\("save_api_key"/);
  assert.match(frontend, /invoke<void>\("delete_api_key"\)/);
  assert.match(frontend, /invoke<InstalledAppRecord\[]>\([\s\S]*"list_installed_apps"/);
  assert.match(settings, /"load_preferences"/);
  assert.match(settings, /"save_preferences"/);
  assert.doesNotMatch(frontend, /read_raw_secret|get_api_key/);
  assert.doesNotMatch(frontend, /@tauri-apps\/plugin-shell/);
  assert.doesNotMatch(frontend, /Command\.sidecar/);
  assert.doesNotMatch(frontend, /localStorage|sessionStorage|indexedDB/);
});

test("normal chat invoke supplies only user input and cannot override trusted settings", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  const requestBlock = frontend.match(
    /const request: DesktopRequest = \{ input \};/
  )?.[0];

  assert.ok(requestBlock);
  assert.doesNotMatch(
    requestBlock,
    /apiKey|secret|installedApps|appAccessPolicy|allowAllInstalledApps|allowedAppIds|responseStyle|responseLanguage|uiLanguage/
  );
});

test("Rust bridge caches Keychain credential and injects persisted preferences", async () => {
  const bridge = await readFile("src-tauri/src/lib.rs", "utf8");

  assert.match(bridge, /struct CredentialState/);
  assert.match(bridge, /fn load_or_cached/);
  assert.match(bridge, /if cache\.loaded/);
  assert.match(bridge, /cache\.secret = secret\.clone\(\)/);
  assert.match(bridge, /fn load_preferences/);
  assert.match(bridge, /fn save_preferences/);
  assert.match(bridge, /load_preferences_from_store\(&app\)/);
  assert.match(bridge, /apply_preferences_to_request\(&mut request, &preferences\)/);
  assert.match(bridge, /request\.installed_apps = Some\(catalog_state\.list\(\)\?\)/);
  assert.match(bridge, /\.sidecar\(SIDECAR_NAME\)/);
  assert.match(bridge, /\.env\("OPENROUTER_API_KEY", &api_key\)/);
  assert.doesNotMatch(bridge, /\.arg\(&?api_key\)/);
  assert.doesNotMatch(bridge, /println!\([^\n]*api_key/);
});

test("Replace and Delete API key update only trusted Rust cache and Keychain", async () => {
  const bridge = await readFile("src-tauri/src/lib.rs", "utf8");

  assert.match(bridge, /state\.save\(&KeyringCredentialStore, &secret\)/);
  assert.match(bridge, /state\.delete\(&KeyringCredentialStore\)/);
  assert.match(bridge, /cache\.secret = Some\(trimmed\.to_string\(\)\)/);
  assert.match(bridge, /cache\.secret = None/);
  assert.doesNotMatch(bridge, /localStorage|sessionStorage|plaintext/);
});

test("installed-app catalogue exposes metadata but not application filesystem paths", async () => {
  const bridge = await readFile("src-tauri/src/lib.rs", "utf8");

  assert.match(bridge, /struct InstalledAppRecord/);
  assert.match(bridge, /bundle_identifier: Option<String>/);
  assert.match(bridge, /launch_name: String/);
  assert.doesNotMatch(
    bridge,
    /struct InstalledAppRecord[\s\S]{0,300}(?:path:|bundle_path:)/
  );
});

test("frontend capability does not grant store or shell execution", async () => {
  const capability = await readFile(
    "src-tauri/capabilities/default.json",
    "utf8"
  );

  assert.doesNotMatch(capability, /store:default/);
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

test("macOS launcher remains fixed execFile with shell disabled", async () => {
  const adapter = await readFile("src/actions/macos/index.ts", "utf8");

  assert.match(adapter, /const MACOS_OPEN = "\/usr\/bin\/open"/);
  assert.match(adapter, /execFile\(executable, \[\.\.\.args\], \{ shell: false \}/);
  assert.doesNotMatch(adapter, /exec\(/);
});
