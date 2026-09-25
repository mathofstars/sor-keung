import type { InstalledAppRecord } from "../apps/types";

export const ALLOWED_ACTION_NAMES = [
  "open_app",
  "close_app",
  "set_volume",
  "lock_screen",
  "get_time",
  "open_url",
  "play_pause_media"
] as const;

export type AllowedActionName = (typeof ALLOWED_ACTION_NAMES)[number];

export type OpenAppActionRequest = {
  name: "open_app";
  args: InstalledAppRecord;
};

export type ActionRequest =
  | OpenAppActionRequest
  | { name: "close_app"; args: { app: string } }
  | { name: "set_volume"; args: { percent: number } }
  | { name: "lock_screen"; args: Record<string, never> }
  | { name: "get_time"; args: Record<string, never> }
  | { name: "open_url"; args: { url: string } }
  | { name: "play_pause_media"; args: Record<string, never> };

export interface ActionResult {
  ok: boolean;
  code:
    | "OK"
    | "NOT_IMPLEMENTED"
    | "UNSUPPORTED_ACTION"
    | "INVALID_ARGUMENT"
    | "APP_NOT_FOUND"
    | "APP_AMBIGUOUS"
    | "APP_BLOCKED";
  messageKey: string;
  data?: Record<string, unknown>;
}

export interface ActionAdapter {
  readonly platform: "macos" | "windows";
  execute(request: ActionRequest): Promise<ActionResult>;
}
