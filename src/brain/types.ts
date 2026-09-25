import type { ActionRequest, ActionResult } from "../actions/types";

export type ResponseStyle = "cantonese-hk" | "written-zh-hk";

export interface DecisionInput {
  text: string;
  inputLanguage?: string;
  responseLanguageMode?: "follow-input" | "fixed";
  outputLanguage?: string;
  responseStyle?: ResponseStyle;
}

export type DecisionResult =
  | { route: "action"; action: ActionRequest }
  | { route: "llm" };

export type BrainResponse =
  | { kind: "action"; result: ActionResult }
  | { kind: "text"; text: string; language?: string };
