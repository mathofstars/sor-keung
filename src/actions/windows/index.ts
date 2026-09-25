import type { ActionAdapter, ActionRequest, ActionResult } from "../types";

export class WindowsActionAdapter implements ActionAdapter {
  readonly platform = "windows" as const;

  async execute(_request: ActionRequest): Promise<ActionResult> {
    return {
      ok: false,
      code: "NOT_IMPLEMENTED",
      messageKey: "actions.notImplemented"
    };
  }
}
