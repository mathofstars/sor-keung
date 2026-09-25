import type { ActionRequest } from "../actions/types";

export interface RawActionCandidate {
  action?: unknown;
  parameters?: unknown;
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000\r\n]/u.test(trimmed)) return null;
  return trimmed;
}

function safeIdentifier(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  const text = safeText(value);
  if (!text) return null;
  if (/[\\/]/u.test(text)) return null;
  return text;
}

export function validateActionCandidate(value: unknown): ActionRequest | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as RawActionCandidate;
  if (candidate.action !== "open_app") return null;
  if (!candidate.parameters || typeof candidate.parameters !== "object") {
    return null;
  }

  const parameters = candidate.parameters as Record<string, unknown>;
  const id = safeIdentifier(parameters.id);
  const displayName = safeText(parameters.displayName);
  const platform = parameters.platform;
  const launchName = safeIdentifier(parameters.launchName);
  const bundleIdentifier = safeIdentifier(parameters.bundleIdentifier);

  if (!id || !displayName || !launchName) return null;
  if (platform !== "macos" && platform !== "windows") return null;
  if (bundleIdentifier === null) return null;

  return {
    name: "open_app",
    args: {
      id,
      displayName,
      platform,
      launchName,
      ...(bundleIdentifier ? { bundleIdentifier } : {})
    }
  };
}
