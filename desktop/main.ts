import { invoke } from "@tauri-apps/api/core";
import {
  t,
  type SupportedUiLanguage,
  type TranslationKey
} from "../src/i18n";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences
} from "./settings";
import {
  sidecarLanguageSettings,
  type AppPreferences,
  type ResponseLanguagePreference
} from "./preferences-model";
import "./style.css";

interface DesktopSidecarResponse {
  ok: boolean;
  kind: "action" | "llm" | "error";
  message: string;
}

interface DesktopRequest {
  input: string;
  uiLanguage: SupportedUiLanguage;
  responseStyle: AppPreferences["responseStyle"];
  responseLanguageMode: "follow-input" | "fixed";
  outputLanguage?: "yue-HK" | "en-GB";
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Desktop UI element missing: ${selector}`);
  }
  return element;
}

const chatView = requireElement<HTMLElement>("#chat-view");
const settingsView = requireElement<HTMLElement>("#settings-view");
const transcript = requireElement<HTMLElement>("#transcript");
const emptyChat = requireElement<HTMLElement>("#empty-chat");
const missingKeyNotice = requireElement<HTMLElement>("#missing-key-notice");
const missingKeyMessage = requireElement<HTMLElement>("#missing-key-message");
const form = requireElement<HTMLFormElement>("#request-form");
const requestInput = requireElement<HTMLTextAreaElement>("#request-input");
const sendButton = requireElement<HTMLButtonElement>("#send-button");
const processingStatus = requireElement<HTMLElement>("#processing-status");
const settingsButton = requireElement<HTMLButtonElement>("#settings-button");
const missingKeySettingsButton = requireElement<HTMLButtonElement>(
  "#missing-key-settings-button"
);
const settingsBackButton = requireElement<HTMLButtonElement>(
  "#settings-back-button"
);
const apiKeyInput = requireElement<HTMLInputElement>("#api-key-input");
const apiKeyStatus = requireElement<HTMLElement>("#api-key-status");
const apiKeyOperationStatus = requireElement<HTMLElement>(
  "#api-key-operation-status"
);
const apiKeySaveButton = requireElement<HTMLButtonElement>(
  "#api-key-save-button"
);
const apiKeyRemoveButton = requireElement<HTMLButtonElement>(
  "#api-key-remove-button"
);
const uiLanguageSelect = requireElement<HTMLSelectElement>(
  "#ui-language-select"
);
const responseStyleSelect = requireElement<HTMLSelectElement>(
  "#response-style-select"
);
const responseLanguageSelect = requireElement<HTMLSelectElement>(
  "#response-language-select"
);
const preferencesSaveButton = requireElement<HTMLButtonElement>(
  "#preferences-save-button"
);
const preferencesStatus = requireElement<HTMLElement>("#preferences-status");

let preferences: AppPreferences = { ...DEFAULT_PREFERENCES };
let apiKeyConfigured = false;
let requestRunning = false;

function tr(key: TranslationKey): string {
  return t(key, preferences.uiLanguage);
}

function setText(id: string, key: TranslationKey): void {
  requireElement<HTMLElement>(`#${id}`).textContent = tr(key);
}

function applyTranslations(): void {
  document.documentElement.lang = preferences.uiLanguage;

  setText("app-brand", "app.brand");
  setText("app-tagline", "app.tagline");
  setText("settings-button-label", "settings.open");
  setText("missing-key-message", "chat.missingApiKey");
  missingKeySettingsButton.textContent = tr("settings.open");
  setText("empty-chat", "chat.empty");
  requestInput.placeholder = tr("input.placeholder");
  sendButton.textContent = tr("chat.send");
  setText("settings-back-button", "settings.back");
  setText("settings-title", "settings.title");
  setText("api-settings-title", "settings.api");
  setText("api-key-label", "settings.apiKey");
  setText("api-key-input-label", "settings.apiKey");
  apiKeyInput.placeholder = tr("settings.apiKeyPlaceholder");
  apiKeySaveButton.textContent = tr("settings.apiSave");
  apiKeyRemoveButton.textContent = tr("settings.apiRemove");
  setText("ui-language-label", "settings.interfaceLanguage");
  setText("response-style-label", "settings.responseStyle");
  setText("response-language-label", "settings.responseLanguage");
  setText("ui-language-zh", "language.zhHK");
  setText("ui-language-en", "language.enGB");
  setText("response-style-cantonese", "settings.responseStyleCantonese");
  setText("response-style-written", "settings.responseStyleWritten");
  setText("response-language-follow", "settings.followInput");
  setText("response-language-zh", "settings.fixedChinese");
  setText("response-language-en", "settings.fixedEnglish");
  preferencesSaveButton.textContent = tr("settings.savePreferences");

  document.querySelectorAll<HTMLElement>(".message").forEach((message) => {
    const label = message.querySelector<HTMLElement>(".message-label");
    if (!label) return;
    label.textContent =
      message.dataset.role === "user" ? tr("chat.you") : tr("chat.assistant");
  });

  renderApiKeyStatus();
}

function renderApiKeyStatus(): void {
  apiKeyStatus.textContent = apiKeyConfigured
    ? tr("settings.apiConfigured")
    : tr("settings.apiNotConfigured");
  apiKeyStatus.dataset.configured = String(apiKeyConfigured);
  missingKeyNotice.hidden = apiKeyConfigured;
  apiKeyRemoveButton.disabled = !apiKeyConfigured;
}

function syncPreferenceControls(): void {
  uiLanguageSelect.value = preferences.uiLanguage;
  responseStyleSelect.value = preferences.responseStyle;
  responseLanguageSelect.value = preferences.responseLanguage;
}

function setSettingsStatus(message: string, isError = false): void {
  apiKeyOperationStatus.textContent = message;
  apiKeyOperationStatus.classList.toggle("error-text", isError);
}

function openSettings(): void {
  chatView.hidden = true;
  settingsView.hidden = false;
  syncPreferenceControls();
  if (!apiKeyConfigured) {
    apiKeyInput.focus();
  } else {
    settingsBackButton.focus();
  }
}

function closeSettings(): void {
  settingsView.hidden = true;
  chatView.hidden = false;
  requestInput.focus();
}

function appendMessage(
  role: "user" | "assistant",
  text: string,
  isError = false
): HTMLElement {
  emptyChat.hidden = true;

  const article = document.createElement("article");
  article.className = `message ${role}${isError ? " error" : ""}`;
  article.dataset.role = role;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? tr("chat.you") : tr("chat.assistant");

  const body = document.createElement("p");
  body.className = "message-body";
  body.textContent = text;

  article.append(label, body);
  transcript.append(article);
  transcript.scrollTop = transcript.scrollHeight;
  return body;
}

function setComposerBusy(busy: boolean): void {
  requestRunning = busy;
  sendButton.disabled = busy;
  requestInput.disabled = busy;
  processingStatus.textContent = busy ? tr("chat.processing") : "";
}

async function refreshApiKeyStatus(): Promise<void> {
  try {
    apiKeyConfigured = await invoke<boolean>("has_api_key");
    setSettingsStatus("");
  } catch {
    apiKeyConfigured = false;
    setSettingsStatus(tr("settings.apiError"), true);
  }
  renderApiKeyStatus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (requestRunning) return;

  const input = requestInput.value.trim();
  if (!input) {
    requestInput.focus();
    return;
  }

  if (!apiKeyConfigured) {
    missingKeyNotice.hidden = false;
    openSettings();
    return;
  }

  appendMessage("user", input);
  requestInput.value = "";
  setComposerBusy(true);
  const pendingBody = appendMessage("assistant", tr("chat.processing"));

  const languageSettings = sidecarLanguageSettings(preferences);
  const request: DesktopRequest = {
    input,
    uiLanguage: preferences.uiLanguage,
    responseStyle: preferences.responseStyle,
    ...languageSettings
  };

  try {
    const response = await invoke<DesktopSidecarResponse>("run_sor_keung", {
      request
    });
    pendingBody.textContent = response.message;
    pendingBody.parentElement?.classList.toggle(
      "error",
      !response.ok || response.kind === "error"
    );
  } catch {
    pendingBody.textContent = tr("desktop.aiServiceUnavailable");
    pendingBody.parentElement?.classList.add("error");
  } finally {
    setComposerBusy(false);
    transcript.scrollTop = transcript.scrollHeight;
    requestInput.focus();
  }
});

requestInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

settingsButton.addEventListener("click", openSettings);
missingKeySettingsButton.addEventListener("click", openSettings);
settingsBackButton.addEventListener("click", closeSettings);

apiKeySaveButton.addEventListener("click", async () => {
  const secret = apiKeyInput.value.trim();
  if (!secret) {
    setSettingsStatus(tr("desktop.missingApiKey"), true);
    apiKeyInput.focus();
    return;
  }

  apiKeySaveButton.disabled = true;
  try {
    await invoke<void>("save_api_key", { secret });
    apiKeyInput.value = "";
    apiKeyConfigured = true;
    renderApiKeyStatus();
    setSettingsStatus(tr("settings.apiSaved"));
  } catch {
    setSettingsStatus(tr("settings.apiError"), true);
  } finally {
    apiKeySaveButton.disabled = false;
  }
});

apiKeyRemoveButton.addEventListener("click", async () => {
  apiKeyRemoveButton.disabled = true;
  try {
    await invoke<void>("delete_api_key");
    apiKeyInput.value = "";
    apiKeyConfigured = false;
    renderApiKeyStatus();
    setSettingsStatus(tr("settings.apiRemoved"));
  } catch {
    setSettingsStatus(tr("settings.apiError"), true);
  } finally {
    apiKeyRemoveButton.disabled = !apiKeyConfigured;
  }
});

preferencesSaveButton.addEventListener("click", async () => {
  const next: AppPreferences = {
    uiLanguage:
      uiLanguageSelect.value === "en-GB" ? "en-GB" : "zh-HK",
    responseStyle:
      responseStyleSelect.value === "written-zh-hk"
        ? "written-zh-hk"
        : "cantonese-hk",
    responseLanguage:
      responseLanguageSelect.value as ResponseLanguagePreference
  };

  try {
    await savePreferences(next);
    preferences = next;
    applyTranslations();
    syncPreferenceControls();
    preferencesStatus.textContent = tr("settings.preferencesSaved");
  } catch {
    preferencesStatus.textContent = tr("desktop.sidecarFailure");
  }
});

async function initialise(): Promise<void> {
  try {
    preferences = await loadPreferences();
  } catch {
    preferences = { ...DEFAULT_PREFERENCES };
  }

  syncPreferenceControls();
  applyTranslations();
  await refreshApiKeyStatus();
  requestInput.focus();
}

void initialise();
