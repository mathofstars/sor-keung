import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("frontend exposes only narrow Sor-Keung, credential and installed-app-list commands", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /invoke<DesktopSidecarResponse>\("run_sor_keung"/);
  assert.match(frontend, /invoke<boolean>\("has_api_key"\)/);
  assert.match(frontend, /invoke<void>\("save_api_key"/);
  assert.match(frontend, /invoke<void>\("delete_api_key"\)/);
  assert.match(frontend, /invoke<InstalledAppRecord\[]>\([\s\S]*"list_installed_apps"/);
  assert.doesNotMatch(frontend, /read_raw_secret|get_api_key/);
  assert.doesNotMatch(frontend, /@tauri-apps\/plugin-shell/);
  assert.doesNotMatch(frontend, /Command\.sidecar/);
  assert.doesNotMatch(frontend, /localStorage|sessionStorage|indexedDB/);
});

test("normal chat invoke never supplies API key, app catalogue or app policy", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  const requestBlock = frontend.match(
    /const request: DesktopRequest = \{[\s\S]*?\n  \};/
  )?.[0];

  assert.ok(requestBlock);
  assert.doesNotMatch(
    requestBlock,
    /apiKey|secret|installedApps|appAccessPolicy|allowAllInstalledApps|allowedAppIds/
  );
});

test("Rust bridge retrieves keyring secret and injects trusted catalogue and persisted policy", async () => {
  const bridge = await readFile("src-tauri/src/lib.rs", "utf8");

  assert.match(bridge, /const SIDECAR_NAME: &str = "sor-keung-sidecar"/);
  assert.match(bridge, /KEYRING_SERVICE/);
  assert.match(bridge, /Entry::new\(KEYRING_SERVICE, KEYRING_ACCOUNT\)/);
  assert.match(bridge, /fn has_api_key\(\)/);
  assert.match(bridge, /fn save_api_key\(secret: String\)/);
  assert.match(bridge, /fn delete_api_key\(\)/);
  assert.match(bridge, /fn list_installed_apps/);
  assert.match(bridge, /request\.installed_apps = Some\(state\.list\(\)\?\)/);
  assert.match(
    bridge,
    /request\.app_access_policy = Some\(load_app_access_policy\(&app\)\)/
  );
  assert.match(bridge, /app\.store\("settings\.json"\)/);
  assert.match(bridge, /\.sidecar\(SIDECAR_NAME\)/);
  assert.match(bridge, /\.env\("OPENROUTER_API_KEY", &api_key\)/);
  assert.doesNotMatch(bridge, /run_sor_keung\([\s\S]{0,250}api_key: String/);
  assert.doesNotMatch(bridge, /\.arg\(&?api_key\)/);
  assert.doesNotMatch(bridge, /println!\([^\n]*api_key/);
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

test("macOS launcher remains fixed execFile with shell disabled", async () => {
  const adapter = await readFile("src/actions/macos/index.ts", "utf8");

  assert.match(adapter, /const MACOS_OPEN = "\/usr\/bin\/open"/);
  assert.match(adapter, /execFile\(executable, \[\.\.\.args\], \{ shell: false \}/);
  assert.doesNotMatch(adapter, /exec\(/);
});
