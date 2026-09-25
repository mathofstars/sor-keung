use keyring::{Entry, Error as KeyringError};
use plist::Value as PlistValue;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{
    process::CommandEvent,
    ShellExt,
};
use tauri_plugin_store::StoreExt;

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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct InstalledAppRecord {
    id: String,
    display_name: String,
    platform: String,
    bundle_identifier: Option<String>,
    launch_name: String,
}

trait AppCatalog {
    fn list(&self) -> Result<Vec<InstalledAppRecord>, String>;
}

#[derive(Default)]
struct MacOsAppCatalog;

fn plist_string<'a>(
    dictionary: &'a plist::Dictionary,
    key: &str,
) -> Option<&'a str> {
    dictionary.get(key).and_then(PlistValue::as_string)
}

fn record_from_app_bundle(path: &Path) -> Option<InstalledAppRecord> {
    let launch_name = path.file_stem()?.to_string_lossy().trim().to_string();
    if launch_name.is_empty() {
        return None;
    }

    let info_path = path.join("Contents").join("Info.plist");
    let value = PlistValue::from_file(info_path).ok()?;
    let dictionary = value.as_dictionary()?;

    let bundle_identifier = plist_string(dictionary, "CFBundleIdentifier")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let display_name = plist_string(dictionary, "CFBundleDisplayName")
        .or_else(|| plist_string(dictionary, "CFBundleName"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&launch_name)
        .to_string();

    let id = bundle_identifier
        .as_ref()
        .map(|bundle| format!("bundle:{bundle}"))
        .unwrap_or_else(|| format!("name:{}", launch_name.to_lowercase()));

    Some(InstalledAppRecord {
        id,
        display_name,
        platform: "macos".into(),
        bundle_identifier,
        launch_name,
    })
}

fn scan_app_root(
    root: &Path,
    depth: usize,
    records: &mut BTreeMap<String, InstalledAppRecord>,
) {
    if depth == 0 || !root.is_dir() {
        return;
    }

    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let is_app = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("app"))
            .unwrap_or(false);

        if is_app {
            if let Some(record) = record_from_app_bundle(&path) {
                records.entry(record.id.clone()).or_insert(record);
            }
            continue;
        }

        scan_app_root(&path, depth - 1, records);
    }
}

impl AppCatalog for MacOsAppCatalog {
    fn list(&self) -> Result<Vec<InstalledAppRecord>, String> {
        let mut records = BTreeMap::new();
        let mut roots = Vec::<PathBuf>::new();

        if let Some(home) = std::env::var_os("HOME") {
            roots.push(PathBuf::from(home).join("Applications"));
        }

        roots.extend([
            PathBuf::from("/Applications"),
            PathBuf::from("/System/Applications"),
            PathBuf::from("/System/Library/CoreServices/Applications"),
        ]);

        for root in roots {
            scan_app_root(&root, 4, &mut records);
        }

        let mut apps: Vec<_> = records.into_values().collect();
        apps.sort_by(|left, right| {
            left.display_name
                .to_lowercase()
                .cmp(&right.display_name.to_lowercase())
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(apps)
    }
}

#[derive(Default)]
struct AppCatalogState {
    cached: Mutex<Option<Vec<InstalledAppRecord>>>,
}

impl AppCatalogState {
    fn list(&self) -> Result<Vec<InstalledAppRecord>, String> {
        let mut cached = self
            .cached
            .lock()
            .map_err(|_| "Installed application catalogue is unavailable.".to_string())?;

        if let Some(apps) = cached.as_ref() {
            return Ok(apps.clone());
        }

        let apps = MacOsAppCatalog.list()?;
        *cached = Some(apps.clone());
        Ok(apps)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppAccessPolicyWire {
    allow_all_installed_apps: bool,
    allowed_app_ids: Vec<String>,
}

impl Default for AppAccessPolicyWire {
    fn default() -> Self {
        Self {
            allow_all_installed_apps: true,
            allowed_app_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPreferences {
    allow_all_installed_apps: Option<bool>,
    allowed_app_ids: Option<Vec<String>>,
}

fn load_app_access_policy(app: &AppHandle) -> AppAccessPolicyWire {
    let Ok(store) = app.store("settings.json") else {
        return AppAccessPolicyWire::default();
    };

    let Some(value) = store.get("preferences") else {
        return AppAccessPolicyWire::default();
    };

    let Ok(preferences) = serde_json::from_value::<StoredPreferences>(value) else {
        return AppAccessPolicyWire::default();
    };

    AppAccessPolicyWire {
        allow_all_installed_apps: preferences.allow_all_installed_apps.unwrap_or(true),
        allowed_app_ids: preferences.allowed_app_ids.unwrap_or_default(),
    }
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
    installed_apps: Option<Vec<InstalledAppRecord>>,
    app_access_policy: Option<AppAccessPolicyWire>,
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
fn list_installed_apps(
    state: State<'_, AppCatalogState>,
) -> Result<Vec<InstalledAppRecord>, String> {
    state.list()
}

#[tauri::command]
async fn run_sor_keung(
    app: AppHandle,
    state: State<'_, AppCatalogState>,
    mut request: SidecarRequest,
) -> Result<SidecarResponse, String> {
    let ui_language = request.ui_language.as_deref();
    let api_key = match KeyringCredentialStore.load() {
        Ok(Some(secret)) if !secret.trim().is_empty() => secret,
        Ok(_) => return Ok(configuration_error(ui_language)),
        Err(_) => return Ok(bridge_error(ui_language)),
    };

    request.installed_apps = Some(state.list()?);
    request.app_access_policy = Some(load_app_access_policy(&app));

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
        .manage(AppCatalogState::default())
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
            list_installed_apps,
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

    #[test]
    fn app_access_policy_defaults_to_allow_all() {
        assert!(AppAccessPolicyWire::default().allow_all_installed_apps);
        assert!(AppAccessPolicyWire::default().allowed_app_ids.is_empty());
    }
}
