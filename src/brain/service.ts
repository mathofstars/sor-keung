import { ActionDispatcher } from "../actions/dispatcher";
import type { DecisionProvider, LlmProvider } from "../providers/types";
import type { BrainResponse, DecisionInput } from "./types";

export class SorKeungBrain {
  constructor(
    private readonly decisionProvider: DecisionProvider,
    private readonly llmProvider: LlmProvider,
    private readonly dispatcher: ActionDispatcher
  ) {}

  async handle(input: DecisionInput): Promise<BrainResponse> {
    const decision = await this.decisionProvider.decide(input);

    if (decision.route === "llm") {
      const response = await this.llmProvider.generate({
        prompt: input.text,
        inputLanguage: input.inputLanguage,
        outputLanguage: input.outputLanguage,
        responseLanguageMode: input.responseLanguageMode,
        responseStyle: input.responseStyle
      });

      return {
        kind: "text",
        text: response.text,
        language: response.language
      };
    }

    if (decision.route === "action_error") {
      return {
        kind: "action",
        result: decision.result
      };
    }

    return {
      kind: "action",
      result: await this.dispatcher.dispatch(decision.action)
    };
  }
}
