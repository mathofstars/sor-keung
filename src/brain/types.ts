import type { ActionRequest } from "../actions/types";

export interface DecisionInput {
  text: string;
  inputLanguage?: string;
  responseLanguageMode?: "follow-input" | "fixed";
  outputLanguage?: string;
}

export type DecisionResult =
  | { route: "action"; action: ActionRequest }
  | { route: "llm"; prompt: string };
