import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sidecar entitlement grants only allow-jit", async () => {
  const entitlements = await readFile(
    "src-tauri/SidecarEntitlements.plist",
    "utf8"
  );

  assert.match(
    entitlements,
    /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/
  );
  assert.doesNotMatch(
    entitlements,
    /allow-unsigned-executable-memory|disable-library-validation|app-sandbox/
  );
});

test("macOS workflow re-signs only the Node sidecar with JIT entitlement", async () => {
  const workflow = await readFile(
    ".github/workflows/stage2-5-macos-build.yml",
    "utf8"
  );

  assert.match(workflow, /SIDE="\$APP\/Contents\/MacOS\/sor-keung-sidecar"/);
  assert.match(
    workflow,
    /--entitlements src-tauri\/SidecarEntitlements\.plist[\s\\]*"\$SIDE"/
  );
  assert.match(
    workflow,
    /codesign --force \\\n            --sign - \\\n            --options runtime \\\n            "\$APP"/
  );
  assert.doesNotMatch(
    workflow,
    /--entitlements src-tauri\/SidecarEntitlements\.plist[\s\\]*"\$APP"/
  );
});

test("macOS workflow smoke-tests the packaged sidecar without an API key", async () => {
  const workflow = await readFile(
    ".github/workflows/stage2-5-macos-build.yml",
    "utf8"
  );

  assert.match(workflow, /OUTPUT="\$\(printf '' \| "\$SIDE"\)"/);
  assert.match(workflow, /No sidecar request received/);
  assert.match(workflow, /com\.apple\.security\.cs\.allow-jit/);
});

test("DMG is rebuilt only after the JIT-signed app is complete", async () => {
  const workflow = await readFile(
    ".github/workflows/stage2-5-macos-build.yml",
    "utf8"
  );

  const jitIndex = workflow.indexOf("Apply Node sidecar JIT entitlement");
  const dmgIndex = workflow.indexOf("Rebuild DMG from JIT-signed app");
  const uploadIndex = workflow.indexOf("Upload Sor-Keung DMG");

  assert.ok(jitIndex >= 0);
  assert.ok(dmgIndex > jitIndex);
  assert.ok(uploadIndex > dmgIndex);
  assert.match(workflow, /hdiutil create/);
  assert.match(workflow, /codesign --force --sign - "\$DMG"/);
});
