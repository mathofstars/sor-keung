import { ActionDispatcher } from "../actions/dispatcher";
import type { DecisionProvider } from "../providers/types";
import type { DecisionInput } from "./types";

export class SorKeungBrain {
  constructor(
    private readonly decisionProvider: DecisionProvider,
    private readonly dispatcher: ActionDispatcher
  ) {}

  async handle(input: DecisionInput) {
    const decision = await this.decisionProvider.decide(input);

    if (decision.route === "unsupported") {
      return {
        ok: false,
        messageKey: "request.unsupported"
      };
    }

    return this.dispatcher.dispatch(decision.action);
  }
}
