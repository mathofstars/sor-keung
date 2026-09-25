import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  sidecarLanguageSettings
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

test("response language preference maps to existing single-turn language controls", () => {
  assert.deepEqual(sidecarLanguageSettings(DEFAULT_PREFERENCES), {
    responseLanguageMode: "follow-input"
  });

  assert.deepEqual(
    sidecarLanguageSettings({
      ...DEFAULT_PREFERENCES,
      responseLanguage: "fixed-zh-HK"
    }),
    {
      responseLanguageMode: "fixed",
      outputLanguage: "yue-HK"
    }
  );

  assert.deepEqual(
    sidecarLanguageSettings({
      ...DEFAULT_PREFERENCES,
      responseLanguage: "fixed-en-GB"
    }),
    {
      responseLanguageMode: "fixed",
      outputLanguage: "en-GB"
    }
  );
});

test("app access policy is persisted with the existing non-secret preferences store", async () => {
  const settings = await readFile("desktop/settings.ts", "utf8");

  assert.match(
    settings,
    /store\.set\(PREFERENCES_KEY, normalizePreferences\(preferences\)\)/
  );
  assert.match(settings, /store\.save\(\)/);
});
