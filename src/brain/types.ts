import type { ActionRequest, ActionResult } from "../actions/types";

export interface DecisionInput {
  text: string;
  inputLanguage?: string;
  responseLanguageMode?: "follow-input" | "fixed";
  outputLanguage?: string;
}

export type DecisionResult =
  | { route: "action"; action: ActionRequest }
  | { route: "llm" };

export type BrainResponse =
  | { kind: "action"; result: ActionResult }
  | { kind: "text"; text: string; language?: string };
