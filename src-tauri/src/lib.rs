use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{
    process::CommandEvent,
    ShellExt,
};

const SIDECAR_NAME: &str = "sor-keung-sidecar";
const KEYRING_SERVICE: &str = "com.mathofstars.sor-keung";
const KEYRING_ACCOUNT: &str = "openrouter-api-key";

trait CredentialStore {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, secret: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

#[derive(Default)]
struct KeyringCredentialStore;

fn credential_store_error() -> String {
    "Secure credential storage is unavailable.".into()
}

impl KeyringCredentialStore {
    fn entry(&self) -> Result<Entry, String> {
        Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|_| credential_store_error())
    }
}

impl CredentialStore for KeyringCredentialStore {
    fn load(&self) -> Result<Option<String>, String> {
        let entry = self.entry()?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(_) => Err(credential_store_error()),
        }
    }

    fn save(&self, secret: &str) -> Result<(), String> {
        self.entry()?
            .set_password(secret)
            .map_err(|_| credential_store_error())
    }

    fn delete(&self) -> Result<(), String> {
        let entry = self.entry()?;
        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(_) => Err(credential_store_error()),
        }
    }
}

fn has_api_key_with(store: &impl CredentialStore) -> Result<bool, String> {
    Ok(store
        .load()?
        .map(|secret| !secret.trim().is_empty())
        .unwrap_or(false))
}

fn save_api_key_with(store: &impl CredentialStore, secret: &str) -> Result<(), String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Err("API key is required.".into());
    }
    store.save(trimmed)
}

fn delete_api_key_with(store: &impl CredentialStore) -> Result<(), String> {
    store.delete()
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarRequest {
    input: String,
    ui_language: Option<String>,
    input_language: Option<String>,
    output_language: Option<String>,
    response_language_mode: Option<String>,
    response_style: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct SidecarResponse {
    ok: bool,
    kind: String,
    message: String,
}

fn is_english(ui_language: Option<&str>) -> bool {
    ui_language == Some("en-GB")
}

fn configuration_error(ui_language: Option<&str>) -> SidecarResponse {
    SidecarResponse {
        ok: false,
        kind: "error".into(),
        message: if is_english(ui_language) {
            "No OpenRouter API key is configured.".into()
        } else {
            "尚未設定 OpenRouter API Key。".into()
        },
    }
}

fn bridge_error(ui_language: Option<&str>) -> SidecarResponse {
    SidecarResponse {
        ok: false,
        kind: "error".into(),
        message: if is_english(ui_language) {
            "Sor-Keung could not process the request.".into()
        } else {
            "Sor-Keung 無法處理這項要求。".into()
        },
    }
}

#[tauri::command]
fn has_api_key() -> Result<bool, String> {
    has_api_key_with(&KeyringCredentialStore)
}

#[tauri::command]
fn save_api_key(secret: String) -> Result<(), String> {
    save_api_key_with(&KeyringCredentialStore, &secret)
}

#[tauri::command]
fn delete_api_key() -> Result<(), String> {
    delete_api_key_with(&KeyringCredentialStore)
}

#[tauri::command]
async fn run_sor_keung(
    app: AppHandle,
    request: SidecarRequest,
) -> Result<SidecarResponse, String> {
    let ui_language = request.ui_language.as_deref();
    let api_key = match KeyringCredentialStore.load() {
        Ok(Some(secret)) if !secret.trim().is_empty() => secret,
        Ok(_) => return Ok(configuration_error(ui_language)),
        Err(_) => return Ok(bridge_error(ui_language)),
    };

    let mut stdin_payload =
        serde_json::to_vec(&request).map_err(|_| "Invalid Sor-Keung request.".to_string())?;
    stdin_payload.push(b'\n');

    let command = app
        .shell()
        .sidecar(SIDECAR_NAME)
        .map_err(|_| "Sor-Keung sidecar is unavailable.".to_string())?
        .env("OPENROUTER_API_KEY", &api_key)
        .env("DECISION_MODEL", "typesafe/jev-1.13")
        .env("LLM_MODEL", "openai/gpt-5.4-mini");

    let (mut events, mut child) = command
        .spawn()
        .map_err(|_| "Sor-Keung sidecar could not start.".to_string())?;

    child
        .write(&stdin_payload)
        .map_err(|_| "Sor-Keung sidecar input failed.".to_string())?;

    let mut stdout = Vec::new();
    let mut exited_successfully = false;

    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => stdout.extend(bytes),
            CommandEvent::Stderr(_) => {
                // Intentionally ignored: never forward sidecar diagnostics or secrets to the UI.
            }
            CommandEvent::Error(_) => return Ok(bridge_error(ui_language)),
            CommandEvent::Terminated(payload) => {
                exited_successfully = payload.code == Some(0);
            }
            _ => {}
        }
    }

    if !exited_successfully {
        return Ok(bridge_error(ui_language));
    }

    serde_json::from_slice::<SidecarResponse>(&stdout).or_else(|_| Ok(bridge_error(ui_language)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Sor-Keung 傻強")
            .inner_size(760.0, 720.0)
            .min_inner_size(520.0, 520.0)
            .resizable(true)
            .visible(true)
            .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            has_api_key,
            save_api_key,
            delete_api_key,
            run_sor_keung
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sor-Keung desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MemoryCredentialStore {
        secret: Mutex<Option<String>>,
    }

    impl CredentialStore for MemoryCredentialStore {
        fn load(&self) -> Result<Option<String>, String> {
            Ok(self.secret.lock().unwrap().clone())
        }

        fn save(&self, secret: &str) -> Result<(), String> {
            *self.secret.lock().unwrap() = Some(secret.to_string());
            Ok(())
        }

        fn delete(&self) -> Result<(), String> {
            *self.secret.lock().unwrap() = None;
            Ok(())
        }
    }

    #[test]
    fn secure_store_supports_save_replace_status_and_delete() {
        let store = MemoryCredentialStore::default();

        assert!(!has_api_key_with(&store).unwrap());
        save_api_key_with(&store, "test-key-one").unwrap();
        assert!(has_api_key_with(&store).unwrap());

        save_api_key_with(&store, "test-key-two").unwrap();
        assert_eq!(store.load().unwrap().as_deref(), Some("test-key-two"));

        delete_api_key_with(&store).unwrap();
        assert!(!has_api_key_with(&store).unwrap());
    }

    #[test]
    fn empty_api_key_is_rejected() {
        let store = MemoryCredentialStore::default();
        assert!(save_api_key_with(&store, "   ").is_err());
        assert!(!has_api_key_with(&store).unwrap());
    }
}
