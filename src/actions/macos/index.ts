import type { ActionAdapter, ActionRequest, ActionResult } from "../types";

export class MacOsActionAdapter implements ActionAdapter {
  readonly platform = "macos" as const;

  async execute(_request: ActionRequest): Promise<ActionResult> {
    return {
      ok: false,
      code: "NOT_IMPLEMENTED",
      messageKey: "actions.notImplemented"
    };
  }
}
