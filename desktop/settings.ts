import { LazyStore } from "@tauri-apps/plugin-store";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type AppPreferences
} from "./preferences-model";

const store = new LazyStore("settings.json");
const PREFERENCES_KEY = "preferences";

export async function loadPreferences(): Promise<AppPreferences> {
  const stored = await store.get<unknown>(PREFERENCES_KEY);
  return normalizePreferences(stored);
}

export async function savePreferences(
  preferences: AppPreferences
): Promise<void> {
  await store.set(PREFERENCES_KEY, normalizePreferences(preferences));
  await store.save();
}

export { DEFAULT_PREFERENCES };
