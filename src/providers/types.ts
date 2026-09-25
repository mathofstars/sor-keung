import type { DecisionInput, DecisionResult } from "../brain/types";
import type { SpeechInput, SpeechOutput, TranscriptionResult } from "../voice/types";

export interface ProviderMetadata {
  readonly id: string;
  readonly model?: string;
}

export interface DecisionProvider extends ProviderMetadata {
  decide(input: DecisionInput): Promise<DecisionResult>;
}

export interface LlmProvider extends ProviderMetadata {
  generate(request: { prompt: string; inputLanguage?: string; outputLanguage?: string }): Promise<{ text: string; language?: string }>;
}

export interface SttProvider extends ProviderMetadata {
  transcribe(input: SpeechInput): Promise<TranscriptionResult>;
}

export interface TtsProvider extends ProviderMetadata {
  synthesize(text: string, language: string): Promise<SpeechOutput>;
}
