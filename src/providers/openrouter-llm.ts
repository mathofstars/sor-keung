import { buildSorKeungSystemPrompt } from "../brain/system-prompt";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5.4-mini";
const DEFAULT_MAX_TOKENS = 1200;

interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type LlmFetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<HttpResponse>;

export interface OpenRouterLlmOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  fetchImpl?: LlmFetchLike;
}

interface ChatCompletionPayload {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

export class OpenRouterLlmProvider implements LlmProvider {
  readonly id = "openrouter-llm";
  readonly model: string;

  private readonly apiKey: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: LlmFetchLike;

  constructor(options: OpenRouterLlmOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = options.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch as unknown as LlmFetchLike);
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is missing");
    }

    let response: HttpResponse;
    try {
      response = await this.fetchImpl(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          max_tokens: this.maxTokens,
          messages: [
            {
              role: "system",
              content: buildSorKeungSystemPrompt(request)
            },
            {
              role: "user",
              content: request.prompt
            }
          ]
        })
      });
    } catch {
      throw new Error("OpenRouter LLM request failed");
    }

    if (!response.ok) {
      throw new Error(
        `OpenRouter LLM request failed with status ${response.status}`
      );
    }

    const payload = (await response.json()) as ChatCompletionPayload;
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("Malformed OpenRouter LLM response");
    }

    const text = content.trim();
    if (!text) {
      throw new Error("OpenRouter LLM returned an empty response");
    }

    return { text };
  }
}
