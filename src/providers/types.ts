import type { DecisionInput, DecisionResult, ResponseStyle } from "../brain/types";
import type { SpeechInput, SpeechOutput, TranscriptionResult } from "../voice/types";

export interface ProviderMetadata {
  readonly id: string;
  readonly model?: string;
}

export interface DecisionProvider extends ProviderMetadata {
  decide(input: DecisionInput): Promise<DecisionResult>;
}

export interface LlmRequest {
  prompt: string;
  inputLanguage?: string;
  outputLanguage?: string;
  responseLanguageMode?: "follow-input" | "fixed";
  responseStyle?: ResponseStyle;
}

export interface LlmResponse {
  text: string;
  language?: string;
}

export interface LlmProvider extends ProviderMetadata {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export interface SttProvider extends ProviderMetadata {
  transcribe(input: SpeechInput): Promise<TranscriptionResult>;
}

export interface TtsProvider extends ProviderMetadata {
  synthesize(text: string, language: string): Promise<SpeechOutput>;
}
