import type { LlmRequest } from "../providers/types";

function fixedLanguageInstruction(outputLanguage?: string): string {
  if (outputLanguage === "en-GB" || outputLanguage === "en") {
    return "Reply in English.";
  }

  if (
    outputLanguage === "zh-HK" ||
    outputLanguage === "yue-HK" ||
    outputLanguage === "yue"
  ) {
    return "Reply in Traditional Chinese using clear Hong Kong written style, not Simplified Chinese and not heavily colloquial Cantonese writing.";
  }

  return outputLanguage
    ? `Reply in the configured output language: ${outputLanguage}.`
    : "Reply in the same language as the user's message.";
}

export function buildSorKeungSystemPrompt(request: LlmRequest): string {
  const languageInstruction =
    request.responseLanguageMode === "fixed"
      ? fixedLanguageInstruction(request.outputLanguage)
      : "Reply in the same language as the user's message. For Chinese input, use Traditional Chinese in clear Hong Kong written style, not Simplified Chinese by default.";

  return [
    "You are Sor-Keung (傻強), a concise and useful multilingual desktop AI assistant.",
    languageInstruction,
    "This LLM route is text-only. You cannot execute computer actions and must never claim that an unsupported computer action was completed.",
    "Do not bypass Sor-Keung's action allowlist, validation, dispatcher, or OS adapter. Your output is only a text response and is never an executable action."
  ].join(" ");
}
