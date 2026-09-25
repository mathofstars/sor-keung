import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences
} from "../desktop/preferences-model";

test("Stage 3 defaults include allow-all installed application access", () => {
  assert.deepEqual(DEFAULT_PREFERENCES, {
    uiLanguage: "zh-HK",
    responseStyle: "cantonese-hk",
    responseLanguage: "follow-input",
    allowAllInstalledApps: true,
    allowedAppIds: []
  });
});

test("preference normalisation preserves language and app access settings", () => {
  assert.deepEqual(
    normalizePreferences({
      uiLanguage: "en-GB",
      responseStyle: "written-zh-hk",
      responseLanguage: "fixed-zh-HK",
      allowAllInstalledApps: false,
      allowedAppIds: [
        "bundle:com.apple.MobileSMS",
        "bundle:com.apple.Safari"
      ]
    }),
    {
      uiLanguage: "en-GB",
      responseStyle: "written-zh-hk",
      responseLanguage: "fixed-zh-HK",
      allowAllInstalledApps: false,
      allowedAppIds: [
        "bundle:com.apple.MobileSMS",
        "bundle:com.apple.Safari"
      ]
    }
  );
});

test("invalid persisted preferences fall back safely and reject path-like app ids", () => {
  assert.deepEqual(
    normalizePreferences({
      uiLanguage: "xx",
      responseStyle: "unknown",
      responseLanguage: "all-languages",
      allowAllInstalledApps: "yes",
      allowedAppIds: [
        "../../bin/sh",
        "bundle:com.apple.Safari",
        "bundle:com.apple.Safari",
        123
      ]
    }),
    {
      ...DEFAULT_PREFERENCES,
      allowedAppIds: ["bundle:com.apple.Safari"]
    }
  );
});
test("frontend settings load and save through backend authoritative Tauri Store commands", async () => {
  const settings = await readFile("desktop/settings.ts", "utf8");

  assert.match(settings, /invoke<unknown>\("load_preferences"\)/);
  assert.match(settings, /invoke<unknown>\("save_preferences"/);
  assert.doesNotMatch(settings, /LazyStore|plugin-store|store\.set|store\.save/);
});

test("Settings reopen reloads persisted preferences before showing cards", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  const openSettings = frontend.match(
    /async function openSettings\(\): Promise<void> \{[\s\S]*?\n\}/
  )?.[0];

  assert.ok(openSettings);
  assert.match(openSettings, /setSettingsLoading\(true\)/);
  assert.match(openSettings, /preferences = await loadPreferences\(\)/);
  assert.match(openSettings, /syncPreferenceControls\(\)/);
  assert.match(openSettings, /setSettingsLoading\(false\)/);
});

test("app access values remain one atomic preferences object", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  const nextPreferences = frontend.match(
    /const next: AppPreferences = \{[\s\S]*?\n  \};/
  )?.[0];

  assert.ok(nextPreferences);
  assert.match(nextPreferences, /allowAllInstalledApps: allowAllInstalledApps\.checked/);
  assert.match(nextPreferences, /allowedAppIds: selectedInstalledAppIds\(\)/);
  assert.match(frontend, /preferences = await savePreferences\(next\)/);
});

test("allow-all saves preserve previously selected app IDs instead of clearing hidden controls", async () => {
  const frontend = await readFile("desktop/main.ts", "utf8");

  const selectedIds = frontend.match(
    /function selectedInstalledAppIds\(\): string\[] \{[\s\S]*?\n\}/
  )?.[0];

  assert.ok(selectedIds);
  assert.match(
    selectedIds,
    /if \(allowAllInstalledApps\.checked \|\| !installedAppsLoaded\)/
  );
  assert.match(selectedIds, /return \[\.\.\.preferences\.allowedAppIds\]/);
});
