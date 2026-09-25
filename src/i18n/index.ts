import enGB from "./locales/en-GB.json";
import zhHK from "./locales/zh-HK.json";

const dictionaries = {
  "zh-HK": zhHK,
  "en-GB": enGB
} as const;

export type SupportedUiLanguage = keyof typeof dictionaries;
export type TranslationKey = keyof typeof enGB;

export const DEFAULT_UI_LANGUAGE: SupportedUiLanguage = "zh-HK";

export function t(
  key: TranslationKey,
  locale: SupportedUiLanguage = DEFAULT_UI_LANGUAGE
): string {
  return dictionaries[locale][key] ?? dictionaries["en-GB"][key];
}
