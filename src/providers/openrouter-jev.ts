import {
  StaticAppCatalog,
  type AppCatalog
} from "../apps/types";
import {
  extractRequestedAppName,
  resolveInstalledApp
} from "../apps/resolver";
import { validateActionCandidate } from "../brain/validation";
import type { DecisionInput, DecisionResult } from "../brain/types";
import type { DecisionProvider } from "./types";

const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const DEFAULT_MODEL = "typesafe/jev-1.13";
const DEFAULT_MIN_CONFIDENCE = 0.6;

interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<HttpResponse>;

export interface OpenRouterJevOptions {
  apiKey?: string;
  model?: string;
  appCatalog?: AppCatalog;
  minConfidence?: number;
  fetchImpl?: FetchLike;
}

interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

function isChoiceAnswer(value: unknown): value is JevChoiceAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as Partial<JevChoiceAnswer>;
  return (
    answer.type === "choice" &&
    typeof answer.choice === "string" &&
    typeof answer.confidence === "number" &&
    !!answer.probabilities &&
    typeof answer.probabilities === "object"
  );
}

export class OpenRouterJevDecisionProvider implements DecisionProvider {
  readonly id = "openrouter-jev";
  readonly model: string;

  private readonly apiKey: string;
  private readonly appCatalog: AppCatalog;
  private readonly minConfidence: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenRouterJevOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = options.model ?? process.env.DECISION_MODEL ?? DEFAULT_MODEL;
    this.appCatalog = options.appCatalog ?? new StaticAppCatalog([]);
    this.minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is missing");
    }

    let response: HttpResponse;
    try {
      response = await this.fetchImpl(OPENROUTER_DECISIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          state: input.text,
          questions: {
            intent: {
              type: "choice",
              instructions:
                "Route the request. Choose open_app only when the user clearly asks Sor-Keung to open, launch, or start a desktop application. Do not decide which application exists; local trusted code will resolve the requested name against the installed-app catalogue. Route every other request to llm. Never invent an OS action, executable path, shell command, or binary.",
              criteria: {
                open_app:
                  "The user clearly asks to open, launch, or start a desktop application.",
                llm:
                  "The request is a general question, explanation, writing or summarisation request, an unsupported computer action, or anything that is not clearly an open-application request."
              }
            }
          }
        })
      });
    } catch {
      throw new Error("OpenRouter decision request failed");
    }

    if (!response.ok) {
      throw new Error(
        `OpenRouter decision request failed with status ${response.status}`
      );
    }

    const payload = await response.json();
    if (!payload || typeof payload !== "object") {
      throw new Error("Malformed Jev response");
    }

    const answers = (payload as { answers?: unknown }).answers;
    if (!answers || typeof answers !== "object") {
      throw new Error("Malformed Jev response");
    }

    const answer = (answers as Record<string, unknown>).intent;
    if (!isChoiceAnswer(answer)) {
      throw new Error("Malformed Jev choice response");
    }

    if (answer.confidence < this.minConfidence) {
      return { route: "llm" };
    }

    if (answer.choice === "llm") {
      return { route: "llm" };
    }

    if (answer.choice !== "open_app") {
      throw new Error("Unexpected Jev choice");
    }

    const apps = await this.appCatalog.list();
    const resolution = resolveInstalledApp(input.text, apps);
    const requestedName =
      extractRequestedAppName(input.text) || input.text.trim();

    if (resolution.kind === "not-found") {
      return {
        route: "action_error",
        result: {
          ok: false,
          code: "APP_NOT_FOUND",
          messageKey: "actions.appNotFound",
          data: { app: requestedName }
        }
      };
    }

    if (resolution.kind === "ambiguous") {
      return {
        route: "action_error",
        result: {
          ok: false,
          code: "APP_AMBIGUOUS",
          messageKey: "actions.appAmbiguous",
          data: { app: requestedName }
        }
      };
    }

    const action = validateActionCandidate({
      action: "open_app",
      parameters: resolution.app
    });

    if (!action) {
      throw new Error("Resolved app failed internal validation");
    }

    return { route: "action", action };
  }
}
