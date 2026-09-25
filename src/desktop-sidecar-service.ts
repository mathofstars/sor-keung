import { ActionDispatcher } from "./actions/dispatcher";
import { MacOsActionAdapter } from "./actions/macos";
import type { ActionAdapter } from "./actions/types";
import {
  DEFAULT_APP_ACCESS_POLICY,
  StaticAppCatalog,
  type AppAccessPolicy,
  type InstalledAppRecord
} from "./apps/types";
import { SorKeungBrain } from "./brain/service";
import type { ResponseStyle } from "./brain/types";
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
  responseStyle?: ResponseStyle;
  installedApps?: readonly InstalledAppRecord[];
  appAccessPolicy?: AppAccessPolicy;
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
  appAccessPolicy?: AppAccessPolicy;
}

function uiLocaleFor(request: DesktopSidecarRequest): SupportedUiLanguage {
  return request.uiLanguage === "en-GB" ? "en-GB" : "zh-HK";
}

function responseLocaleFor(
  request: DesktopSidecarRequest
): SupportedUiLanguage {
  if (request.responseLanguageMode === "fixed") {
    return request.outputLanguage === "en-GB" || request.outputLanguage === "en"
      ? "en-GB"
      : "zh-HK";
  }

  if (request.inputLanguage === "en-GB" || request.inputLanguage === "en") {
    return "en-GB";
  }

  if (
    request.inputLanguage === "zh-HK" ||
    request.inputLanguage === "yue-HK" ||
    request.inputLanguage === "yue"
  ) {
    return "zh-HK";
  }

  return /\p{Script=Han}/u.test(request.input) ? "zh-HK" : "en-GB";
}

function actionMessageKey(
  resultKey: string,
  locale: SupportedUiLanguage,
  responseStyle: ResponseStyle
): TranslationKey {
  if (
    resultKey === "actions.openedApp" &&
    locale === "zh-HK" &&
    responseStyle === "cantonese-hk"
  ) {
    return "actions.openedAppCantonese";
  }

  return resultKey as TranslationKey;
}

export async function handleDesktopSidecarRequest(
  request: DesktopSidecarRequest,
  dependencies: DesktopSidecarDependencies
): Promise<DesktopSidecarResponse> {
  const uiLocale = uiLocaleFor(request);
  const responseLocale = responseLocaleFor(request);
  const input = request.input?.trim();
  const responseStyle = request.responseStyle ?? "cantonese-hk";

  if (!input) {
    return {
      ok: false,
      kind: "error",
      message: t("desktop.invalidRequest", uiLocale)
    };
  }

  try {
    const brain = new SorKeungBrain(
      dependencies.decisionProvider,
      dependencies.llmProvider,
      new ActionDispatcher(
        dependencies.actionAdapter,
        dependencies.appAccessPolicy ?? DEFAULT_APP_ACCESS_POLICY
      )
    );

    const response = await brain.handle({
      text: input,
      inputLanguage: request.inputLanguage ?? "yue-HK",
      outputLanguage: request.outputLanguage ?? "yue-HK",
      responseLanguageMode: request.responseLanguageMode ?? "follow-input",
      responseStyle
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
    const message = t(
      actionMessageKey(result.messageKey, responseLocale, responseStyle),
      responseLocale,
      { app }
    );

    if (!result.ok) {
      return { ok: false, kind: "error", message };
    }

    return { ok: true, kind: "action", message };
  } catch {
    return {
      ok: false,
      kind: "error",
      message: t("desktop.aiServiceUnavailable", uiLocale)
    };
  }
}

export async function handleDesktopSidecarRequestFromEnvironment(
  request: DesktopSidecarRequest,
  environment: NodeJS.ProcessEnv = process.env
): Promise<DesktopSidecarResponse> {
  const uiLocale = uiLocaleFor(request);
  const apiKey = environment.OPENROUTER_API_KEY?.trim() ?? "";

  if (!apiKey) {
    return {
      ok: false,
      kind: "error",
      message: t("desktop.missingApiKey", uiLocale)
    };
  }

  if (process.platform !== "darwin") {
    return {
      ok: false,
      kind: "error",
      message: t("platform.unsupported", uiLocale)
    };
  }

  const appCatalog = new StaticAppCatalog(request.installedApps ?? []);
  const appAccessPolicy =
    request.appAccessPolicy ?? DEFAULT_APP_ACCESS_POLICY;

  try {
    return await handleDesktopSidecarRequest(request, {
      decisionProvider: new OpenRouterJevDecisionProvider({
        apiKey,
        model: environment.DECISION_MODEL,
        appCatalog
      }),
      llmProvider: new OpenRouterLlmProvider({
        apiKey,
        model: environment.LLM_MODEL
      }),
      actionAdapter: new MacOsActionAdapter(),
      appAccessPolicy
    });
  } catch {
    return {
      ok: false,
      kind: "error",
      message: t("desktop.aiServiceUnavailable", uiLocale)
    };
  }
}
