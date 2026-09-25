import { execFile } from "node:child_process";
import type { ActionAdapter, ActionRequest, ActionResult } from "../types";

export type ProcessRunner = (executable: string, args: readonly string[]) => Promise<void>;

const defaultRunner: ProcessRunner = (executable, args) =>
  new Promise((resolve, reject) => {
    execFile(executable, [...args], { shell: false }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export class MacOsActionAdapter implements ActionAdapter {
  readonly platform = "macos" as const;

  constructor(private readonly runProcess: ProcessRunner = defaultRunner) {}

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.name !== "open_app") {
      return {
        ok: false,
        code: "UNSUPPORTED_ACTION",
        messageKey: "actions.unsupported"
      };
    }

    const app = request.args.app.trim();
    if (!app) {
      return {
        ok: false,
        code: "INVALID_ARGUMENT",
        messageKey: "actions.invalidApp"
      };
    }

    try {
      await this.runProcess("open", ["-a", app]);
      return {
        ok: true,
        code: "OK",
        messageKey: "actions.openedApp",
        data: { app }
      };
    } catch {
      return {
        ok: false,
        code: "APP_NOT_FOUND",
        messageKey: "actions.appNotFound",
        data: { app }
      };
    }
  }
}
