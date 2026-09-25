import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  sidecarLanguageSettings
} from "../desktop/preferences-model";

test("Stage 3 defaults to zh-HK UI and Hong Kong conversational Cantonese", () => {
  assert.deepEqual(DEFAULT_PREFERENCES, {
    uiLanguage: "zh-HK",
    responseStyle: "cantonese-hk",
    responseLanguage: "follow-input"
  });
});

test("preference normalisation preserves supported zh-HK and en-GB settings", () => {
  assert.deepEqual(
    normalizePreferences({
      uiLanguage: "en-GB",
      responseStyle: "written-zh-hk",
      responseLanguage: "fixed-zh-HK"
    }),
    {
      uiLanguage: "en-GB",
      responseStyle: "written-zh-hk",
      responseLanguage: "fixed-zh-HK"
    }
  );
});

test("invalid persisted preferences fall back safely", () => {
  assert.deepEqual(
    normalizePreferences({
      uiLanguage: "xx",
      responseStyle: "unknown",
      responseLanguage: "all-languages"
    }),
    DEFAULT_PREFERENCES
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
