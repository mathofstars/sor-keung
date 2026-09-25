import {
  DEFAULT_APP_ACCESS_POLICY,
  isAppAllowed,
  type AppAccessPolicy
} from "../apps/types";
import type { ActionAdapter, ActionRequest, ActionResult } from "./types";

export class ActionDispatcher {
  constructor(
    private readonly adapter: ActionAdapter,
    private readonly appAccessPolicy: AppAccessPolicy = DEFAULT_APP_ACCESS_POLICY
  ) {}

  async dispatch(request: ActionRequest): Promise<ActionResult> {
    if (request.name !== "open_app") {
      return {
        ok: false,
        code: "UNSUPPORTED_ACTION",
        messageKey: "actions.unsupported"
      };
    }

    if (!isAppAllowed(request.args, this.appAccessPolicy)) {
      return {
        ok: false,
        code: "APP_BLOCKED",
        messageKey: "actions.appBlocked",
        data: {
          app: request.args.displayName,
          appId: request.args.id
        }
      };
    }

    return this.adapter.execute(request);
  }
}
