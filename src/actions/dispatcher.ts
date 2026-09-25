import type { ActionAdapter, ActionRequest, ActionResult } from "./types";

export class ActionDispatcher {
  constructor(private readonly adapter: ActionAdapter) {}

  async dispatch(request: ActionRequest): Promise<ActionResult> {
    if (request.name !== "open_app") {
      return {
        ok: false,
        code: "UNSUPPORTED_ACTION",
        messageKey: "actions.unsupported"
      };
    }

    return this.adapter.execute(request);
  }
}
