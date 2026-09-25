import type { ResponseStyle } from "./types";
import type { LlmRequest } from "../providers/types";

const DEFAULT_RESPONSE_STYLE: ResponseStyle = "cantonese-hk";

function fixedLanguageInstruction(outputLanguage?: string): string {
  if (outputLanguage === "en-GB" || outputLanguage === "en") {
    return "Reply in English.";
  }

  if (
    outputLanguage === "zh-HK" ||
    outputLanguage === "yue-HK" ||
    outputLanguage === "yue"
  ) {
    return "Reply in Traditional Chinese used in Hong Kong.";
  }

  return outputLanguage
    ? `Reply in the configured output language: ${outputLanguage}.`
    : "Reply in the same language as the user's message.";
}

function responseStyleInstruction(
  responseStyle: ResponseStyle = DEFAULT_RESPONSE_STYLE
): string {
  if (responseStyle === "written-zh-hk") {
    return [
      "When replying in Chinese, use normal Hong Kong Traditional Chinese written style.",
      "Avoid Simplified Chinese and avoid heavily colloquial Cantonese wording."
    ].join(" ");
  }

  return [
    "When replying in Chinese, use natural written conversational Hong Kong Cantonese.",
    "Use Traditional Chinese characters and natural Hong Kong wording such as 係、唔、咗 or 佢 when appropriate.",
    "Do not force slang or sentence-final particles into every sentence, and do not default to Simplified Chinese."
  ].join(" ");
}

export function buildSorKeungSystemPrompt(request: LlmRequest): string {
  const languageInstruction =
    request.responseLanguageMode === "fixed"
      ? fixedLanguageInstruction(request.outputLanguage)
      : "Reply in the same language as the user's message.";

  return [
    "You are Sor-Keung (傻強), a concise and useful multilingual desktop AI assistant.",
    languageInstruction,
    responseStyleInstruction(request.responseStyle),
    "This LLM route is text-only. You cannot execute computer actions and must never claim that an unsupported computer action was completed.",
    "Do not bypass Sor-Keung's action allowlist, validation, dispatcher, or OS adapter. Your output is only a text response and is never an executable action."
  ].join(" ");
}
