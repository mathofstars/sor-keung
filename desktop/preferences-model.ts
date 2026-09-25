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
  allowAllInstalledApps: boolean;
  allowedAppIds: string[];
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  uiLanguage: "zh-HK",
  responseStyle: "cantonese-hk",
  responseLanguage: "follow-input",
  allowAllInstalledApps: true,
  allowedAppIds: []
};

function normalizeAllowedAppIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(
          (item) =>
            item.length > 0 &&
            !/[\u0000\r\n\\/]/u.test(item)
        )
    )
  ];
}

export function normalizePreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PREFERENCES, allowedAppIds: [] };
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
        : DEFAULT_PREFERENCES.responseLanguage,
    allowAllInstalledApps:
      typeof candidate.allowAllInstalledApps === "boolean"
        ? candidate.allowAllInstalledApps
        : DEFAULT_PREFERENCES.allowAllInstalledApps,
    allowedAppIds: normalizeAllowedAppIds(candidate.allowedAppIds)
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
