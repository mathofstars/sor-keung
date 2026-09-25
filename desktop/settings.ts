import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type AppPreferences
} from "./preferences-model";

export async function loadPreferences(): Promise<AppPreferences> {
  const stored = await invoke<unknown>("load_preferences");
  return normalizePreferences(stored);
}

export async function savePreferences(
  preferences: AppPreferences
): Promise<AppPreferences> {
  const saved = await invoke<unknown>("save_preferences", {
    preferences: normalizePreferences(preferences)
  });
  return normalizePreferences(saved);
}

export { DEFAULT_PREFERENCES };
