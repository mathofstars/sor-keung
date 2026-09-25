import { ALLOWED_ACTION_NAMES, type AllowedActionName } from "../types";

export function isAllowedActionName(value: string): value is AllowedActionName {
  return (ALLOWED_ACTION_NAMES as readonly string[]).includes(value);
}
