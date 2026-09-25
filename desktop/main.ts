import { invoke } from "@tauri-apps/api/core";
import "./style.css";

interface DesktopSidecarResponse {
  ok: boolean;
  kind: "action" | "llm" | "error";
  message: string;
}

interface DesktopRequest {
  input: string;
  uiLanguage: "zh-HK";
  inputLanguage: "yue-HK";
  outputLanguage: "yue-HK";
  responseLanguageMode: "follow-input";
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Desktop UI element missing: ${selector}`);
  }
  return element;
}

const form = requireElement<HTMLFormElement>("#request-form");
const apiKeyInput = requireElement<HTMLInputElement>("#api-key");
const requestInput = requireElement<HTMLInputElement>("#request-input");
const sendButton = requireElement<HTMLButtonElement>("#send-button");
const status = requireElement<HTMLParagraphElement>("#status");

function setStatus(
  message: string,
  state: "idle" | "loading" | "success" | "error"
): void {
  status.textContent = message;
  status.className = `status ${state}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const input = requestInput.value.trim();

  if (!apiKey) {
    setStatus("請輸入 OpenRouter API Key。", "error");
    apiKeyInput.focus();
    return;
  }

  if (!input) {
    setStatus("請輸入指令或問題。", "error");
    requestInput.focus();
    return;
  }

  sendButton.disabled = true;
  apiKeyInput.disabled = true;
  requestInput.disabled = true;
  setStatus("處理中…", "loading");

  const request: DesktopRequest = {
    input,
    uiLanguage: "zh-HK",
    inputLanguage: "yue-HK",
    outputLanguage: "yue-HK",
    responseLanguageMode: "follow-input"
  };

  try {
    const response = await invoke<DesktopSidecarResponse>("run_sor_keung", {
      request,
      apiKey
    });

    setStatus(
      response.message,
      response.ok && response.kind !== "error" ? "success" : "error"
    );
  } catch {
    setStatus("Sor-Keung 無法處理這項要求。", "error");
  } finally {
    sendButton.disabled = false;
    apiKeyInput.disabled = false;
    requestInput.disabled = false;
    requestInput.focus();
  }
});
