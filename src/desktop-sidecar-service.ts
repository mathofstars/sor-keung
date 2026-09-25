import { ActionDispatcher } from "./actions/dispatcher";
import { MacOsActionAdapter } from "./actions/macos";
import type { ActionAdapter } from "./actions/types";
import { SorKeungBrain } from "./brain/service";
import { t, type SupportedUiLanguage, type TranslationKey } from "./i18n";
import { OpenRouterJevDecisionProvider } from "./providers/openrouter-jev";
import { OpenRouterLlmProvider } from "./providers/openrouter-llm";
import type { DecisionProvider, LlmProvider } from "./providers/types";

export interface DesktopSidecarRequest {
  input: string;
  uiLanguage?: SupportedUiLanguage;
  inputLanguage?: string;
  outputLanguage?: string;
  responseLanguageMode?: "follow-input" | "fixed";
}

export interface DesktopSidecarResponse {
  ok: boolean;
  kind: "action" | "llm" | "error";
  message: string;
}

export interface DesktopSidecarDependencies {
  decisionProvider: DecisionProvider;
  llmProvider: LlmProvider;
  actionAdapter: ActionAdapter;
}

function localeFor(request: DesktopSidecarRequest): SupportedUiLanguage {
  return request.uiLanguage === "en-GB" ? "en-GB" : "zh-HK";
}

function safeMessage(
  error: unknown,
  locale: SupportedUiLanguage,
  secrets: readonly string[] = []
): string {
  const message = error instanceof Error ? error.message : "";
  const containsSecret = secrets.some(
    (secret) => secret.length > 0 && message.includes(secret)
  );

  if (!message || containsSecret) {
    return t("desktop.sidecarFailure", locale);
  }

  return message;
}

export async function handleDesktopSidecarRequest(
  request: DesktopSidecarRequest,
  dependencies: DesktopSidecarDependencies
): Promise<DesktopSidecarResponse> {
  const locale = localeFor(request);
  const input = request.input?.trim();

  if (!input) {
    return {
      ok: false,
      kind: "error",
      message: t("desktop.invalidRequest", locale)
    };
  }

  try {
    const brain = new SorKeungBrain(
      dependencies.decisionProvider,
      dependencies.llmProvider,
      new ActionDispatcher(dependencies.actionAdapter)
    );

    const response = await brain.handle({
      text: input,
      inputLanguage: request.inputLanguage ?? "yue-HK",
      outputLanguage: request.outputLanguage ?? "yue-HK",
      responseLanguageMode: request.responseLanguageMode ?? "follow-input"
    });

    if (response.kind === "text") {
      return {
        ok: true,
        kind: "llm",
        message: response.text
      };
    }

    const result = response.result;
    const app =
      result.data && typeof result.data.app === "string" ? result.data.app : "";
    const message = t(result.messageKey as TranslationKey, locale, { app });

    if (!result.ok) {
      return { ok: false, kind: "error", message };
    }

    return { ok: true, kind: "action", message };
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      message: safeMessage(error, locale)
    };
  }
}

export async function handleDesktopSidecarRequestFromEnvironment(
  request: DesktopSidecarRequest,
  environment: NodeJS.ProcessEnv = process.env
): Promise<DesktopSidecarResponse> {
  const locale = localeFor(request);
  const apiKey = environment.OPENROUTER_API_KEY?.trim() ?? "";

  if (!apiKey) {
    return {
      ok: false,
      kind: "error",
      message: t("desktop.missingApiKey", locale)
    };
  }

  if (process.platform !== "darwin") {
    return {
      ok: false,
      kind: "error",
      message: t("platform.unsupported", locale)
    };
  }

  try {
    return await handleDesktopSidecarRequest(request, {
      decisionProvider: new OpenRouterJevDecisionProvider({
        apiKey,
        model: environment.DECISION_MODEL
      }),
      llmProvider: new OpenRouterLlmProvider({
        apiKey,
        model: environment.LLM_MODEL
      }),
      actionAdapter: new MacOsActionAdapter()
    });
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      message: safeMessage(error, locale, [apiKey])
    };
  }
}
