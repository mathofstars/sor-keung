import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("frontend exposes only the fixed run_sor_keung invoke command", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  assert.match(frontend, /invoke<DesktopSidecarResponse>\("run_sor_keung"/);
  assert.doesNotMatch(frontend, /@tauri-apps\/plugin-shell/);
  assert.doesNotMatch(frontend, /Command\.sidecar/);
  assert.doesNotMatch(frontend, /localStorage/);
  assert.doesNotMatch(frontend, /sessionStorage/);
});

test("Rust bridge starts one fixed sidecar and transports key via environment", async () => {
  const bridge = await readFile("src-tauri/src/lib.rs", "utf8");

  assert.match(bridge, /const SIDECAR_NAME: &str = "sor-keung-sidecar"/);
  assert.match(bridge, /\.sidecar\(SIDECAR_NAME\)/);
  assert.match(bridge, /\.env\("OPENROUTER_API_KEY", &api_key\)/);
  assert.doesNotMatch(bridge, /\.arg\(&?api_key\)/);
  assert.doesNotMatch(bridge, /command\(api_key\)/);
});

test("Tauri capability does not grant frontend shell execution", async () => {
  const capability = await readFile(
    "src-tauri/capabilities/default.json",
    "utf8"
  );

  assert.doesNotMatch(capability, /shell:allow-execute/);
  assert.doesNotMatch(capability, /shell:allow-spawn/);
});

test("desktop frontend does not persist the API key", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");
  const html = await readFile("desktop/index.html", "utf8");

  assert.doesNotMatch(frontend, /writeFile|localStorage|sessionStorage|indexedDB/);
  assert.match(html, /type="password"/);
});
