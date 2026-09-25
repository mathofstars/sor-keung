import type { ResponseStyle } from "../src/brain/types";
import type { SupportedUiLanguage } from "../src/i18n";

export type ResponseLanguagePreference =
  | "follow-input"
  | "fixed-zh-HK"
  | "fixed-en-GB";

export interface AppPreferences {
  uiLanguage: SupportedUiLanguage;
  responseStyle: ResponseStyle;
  responseLanguage: ResponseLanguagePreference;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  uiLanguage: "zh-HK",
  responseStyle: "cantonese-hk",
  responseLanguage: "follow-input"
};

export function normalizePreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }

  const candidate = value as Partial<AppPreferences>;

  return {
    uiLanguage:
      candidate.uiLanguage === "en-GB" || candidate.uiLanguage === "zh-HK"
        ? candidate.uiLanguage
        : DEFAULT_PREFERENCES.uiLanguage,
    responseStyle:
      candidate.responseStyle === "written-zh-hk" ||
      candidate.responseStyle === "cantonese-hk"
        ? candidate.responseStyle
        : DEFAULT_PREFERENCES.responseStyle,
    responseLanguage:
      candidate.responseLanguage === "fixed-zh-HK" ||
      candidate.responseLanguage === "fixed-en-GB" ||
      candidate.responseLanguage === "follow-input"
        ? candidate.responseLanguage
        : DEFAULT_PREFERENCES.responseLanguage
  };
}

export function sidecarLanguageSettings(preferences: AppPreferences): {
  responseLanguageMode: "follow-input" | "fixed";
  outputLanguage?: "yue-HK" | "en-GB";
} {
  switch (preferences.responseLanguage) {
    case "fixed-zh-HK":
      return { responseLanguageMode: "fixed", outputLanguage: "yue-HK" };
    case "fixed-en-GB":
      return { responseLanguageMode: "fixed", outputLanguage: "en-GB" };
    default:
      return { responseLanguageMode: "follow-input" };
  }
}
