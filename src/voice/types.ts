export interface SpeechInput {
  audio: Uint8Array;
  mimeType: string;
  languageHint?: string;
}

export interface TranscriptionResult {
  text: string;
  detectedLanguage?: string;
}

export interface SpeechOutput {
  audio: Uint8Array;
  mimeType: string;
}
