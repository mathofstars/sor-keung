import type { ActionRequest } from "../actions/types";

export interface RawActionCandidate {
  action?: unknown;
  parameters?: unknown;
}

export function validateActionCandidate(value: unknown): ActionRequest | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as RawActionCandidate;
  if (candidate.action !== "open_app") return null;
  if (!candidate.parameters || typeof candidate.parameters !== "object") return null;

  const app = (candidate.parameters as { app?: unknown }).app;
  if (typeof app !== "string") return null;

  const trimmed = app.trim();
  if (!trimmed) return null;

  return {
    name: "open_app",
    args: { app: trimmed }
  };
}
