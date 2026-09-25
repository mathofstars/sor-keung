use keyring::{Entry, Error as KeyringError};
use plist::Value as PlistValue;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
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
const SETTINGS_STORE: &str = "settings.json";
const PREFERENCES_KEY: &str = "preferences";

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

#[derive(Default)]
struct CredentialCache {
    loaded: bool,
    secret: Option<String>,
}

#[derive(Default)]
struct CredentialState {
    cache: Mutex<CredentialCache>,
}

impl CredentialState {
    fn load_or_cached(&self, store: &impl CredentialStore) -> Result<Option<String>, String> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| credential_store_error())?;

        if cache.loaded {
            return Ok(cache.secret.clone());
        }

        let secret = store.load()?;
        cache.loaded = true;
        cache.secret = secret.clone();
        Ok(secret)
    }

    fn save(&self, store: &impl CredentialStore, secret: &str) -> Result<(), String> {
        let trimmed = secret.trim();
        if trimmed.is_empty() {
            return Err("API key is required.".into());
        }

        store.save(trimmed)?;
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| credential_store_error())?;
        cache.loaded = true;
        cache.secret = Some(trimmed.to_string());
        Ok(())
    }

    fn delete(&self, store: &impl CredentialStore) -> Result<(), String> {
        store.delete()?;
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| credential_store_error())?;
        cache.loaded = true;
        cache.secret = None;
        Ok(())
    }
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
            // Safari and other system apps may be delivered from the signed
            // App Cryptex on modern macOS releases (including Tahoe).
            PathBuf::from(
                "/System/Volumes/Preboot/Cryptexes/App/System/Applications",
            ),
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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
struct PreferencesWire {
    ui_language: String,
    response_style: String,
    response_language: String,
    allow_all_installed_apps: bool,
    allowed_app_ids: Vec<String>,
}

impl Default for PreferencesWire {
    fn default() -> Self {
        Self {
            ui_language: "zh-HK".into(),
            response_style: "cantonese-hk".into(),
            response_language: "follow-input".into(),
            allow_all_installed_apps: true,
            allowed_app_ids: Vec::new(),
        }
    }
}

fn safe_app_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && !trimmed
            .chars()
            .any(|character| character.is_control() || character == '/' || character == '\\')
}

fn normalize_preferences(mut preferences: PreferencesWire) -> PreferencesWire {
    if preferences.ui_language != "zh-HK" && preferences.ui_language != "en-GB" {
        preferences.ui_language = "zh-HK".into();
    }

    if preferences.response_style != "cantonese-hk"
        && preferences.response_style != "written-zh-hk"
    {
        preferences.response_style = "cantonese-hk".into();
    }

    if preferences.response_language != "follow-input"
        && preferences.response_language != "fixed-zh-HK"
        && preferences.response_language != "fixed-en-GB"
    {
        preferences.response_language = "follow-input".into();
    }

    let unique: BTreeSet<String> = preferences
        .allowed_app_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| safe_app_id(value))
        .collect();
    preferences.allowed_app_ids = unique.into_iter().collect();
    preferences
}

fn load_preferences_from_store(app: &AppHandle) -> Result<PreferencesWire, String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|_| "Settings store is unavailable.".to_string())?;

    let Some(value) = store.get(PREFERENCES_KEY) else {
        return Ok(PreferencesWire::default());
    };

    let preferences = serde_json::from_value::<PreferencesWire>(value)
        .map_err(|_| "Saved settings are invalid.".to_string())?;
    Ok(normalize_preferences(preferences))
}

fn save_preferences_to_store(
    app: &AppHandle,
    preferences: PreferencesWire,
) -> Result<PreferencesWire, String> {
    let normalized = normalize_preferences(preferences);
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|_| "Settings store is unavailable.".to_string())?;
    let value = serde_json::to_value(&normalized)
        .map_err(|_| "Settings could not be encoded.".to_string())?;

    store.set(PREFERENCES_KEY, value);
    store
        .save()
        .map_err(|_| "Settings could not be saved.".to_string())?;
    Ok(normalized)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppAccessPolicyWire {
    allow_all_installed_apps: bool,
    allowed_app_ids: Vec<String>,
}

impl From<&PreferencesWire> for AppAccessPolicyWire {
    fn from(preferences: &PreferencesWire) -> Self {
        Self {
            allow_all_installed_apps: preferences.allow_all_installed_apps,
            allowed_app_ids: preferences.allowed_app_ids.clone(),
        }
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

fn apply_preferences_to_request(request: &mut SidecarRequest, preferences: &PreferencesWire) {
    request.ui_language = Some(preferences.ui_language.clone());
    request.response_style = Some(preferences.response_style.clone());

    match preferences.response_language.as_str() {
        "fixed-zh-HK" => {
            request.response_language_mode = Some("fixed".into());
            request.output_language = Some("yue-HK".into());
        }
        "fixed-en-GB" => {
            request.response_language_mode = Some("fixed".into());
            request.output_language = Some("en-GB".into());
        }
        _ => {
            request.response_language_mode = Some("follow-input".into());
            request.output_language = None;
        }
    }

    request.app_access_policy = Some(AppAccessPolicyWire::from(preferences));
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
fn has_api_key(state: State<'_, CredentialState>) -> Result<bool, String> {
    Ok(state
        .load_or_cached(&KeyringCredentialStore)?
        .map(|secret| !secret.trim().is_empty())
        .unwrap_or(false))
}

#[tauri::command]
fn save_api_key(
    state: State<'_, CredentialState>,
    secret: String,
) -> Result<(), String> {
    state.save(&KeyringCredentialStore, &secret)
}

#[tauri::command]
fn delete_api_key(state: State<'_, CredentialState>) -> Result<(), String> {
    state.delete(&KeyringCredentialStore)
}

#[tauri::command]
fn load_preferences(app: AppHandle) -> Result<PreferencesWire, String> {
    load_preferences_from_store(&app)
}

#[tauri::command]
fn save_preferences(
    app: AppHandle,
    preferences: PreferencesWire,
) -> Result<PreferencesWire, String> {
    save_preferences_to_store(&app, preferences)
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
    credential_state: State<'_, CredentialState>,
    catalog_state: State<'_, AppCatalogState>,
    mut request: SidecarRequest,
) -> Result<SidecarResponse, String> {
    let preferences = match load_preferences_from_store(&app) {
        Ok(preferences) => preferences,
        Err(_) => return Ok(bridge_error(request.ui_language.as_deref())),
    };

    apply_preferences_to_request(&mut request, &preferences);
    let ui_language = request.ui_language.as_deref();

    let api_key = match credential_state.load_or_cached(&KeyringCredentialStore) {
        Ok(Some(secret)) if !secret.trim().is_empty() => secret,
        Ok(_) => return Ok(configuration_error(ui_language)),
        Err(_) => return Ok(bridge_error(ui_language)),
    };

    request.installed_apps = Some(catalog_state.list()?);

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
        .manage(CredentialState::default())
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
            load_preferences,
            save_preferences,
            list_installed_apps,
            run_sor_keung
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sor-Keung desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryCredentialStore {
        secret: Mutex<Option<String>>,
        load_count: Mutex<usize>,
    }

    impl MemoryCredentialStore {
        fn with_secret(secret: &str) -> Self {
            Self {
                secret: Mutex::new(Some(secret.to_string())),
                load_count: Mutex::new(0),
            }
        }

        fn loads(&self) -> usize {
            *self.load_count.lock().unwrap()
        }
    }

    impl CredentialStore for MemoryCredentialStore {
        fn load(&self) -> Result<Option<String>, String> {
            *self.load_count.lock().unwrap() += 1;
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
    fn credential_is_read_from_persistent_store_only_once_per_process_cache() {
        let store = MemoryCredentialStore::with_secret("test-key");
        let state = CredentialState::default();

        assert_eq!(
            state.load_or_cached(&store).unwrap().as_deref(),
            Some("test-key")
        );
        assert_eq!(
            state.load_or_cached(&store).unwrap().as_deref(),
            Some("test-key")
        );
        assert_eq!(store.loads(), 1);
    }

    #[test]
    fn replacing_and_deleting_api_key_updates_session_cache() {
        let store = MemoryCredentialStore::with_secret("old-key");
        let state = CredentialState::default();

        assert_eq!(
            state.load_or_cached(&store).unwrap().as_deref(),
            Some("old-key")
        );
        state.save(&store, "new-key").unwrap();
        assert_eq!(
            state.load_or_cached(&store).unwrap().as_deref(),
            Some("new-key")
        );
        assert_eq!(store.loads(), 1);

        state.delete(&store).unwrap();
        assert_eq!(state.load_or_cached(&store).unwrap(), None);
        assert_eq!(store.loads(), 1);
    }

    #[test]
    fn empty_api_key_is_rejected_without_changing_cache() {
        let store = MemoryCredentialStore::default();
        let state = CredentialState::default();

        assert!(state.save(&store, "   ").is_err());
        assert_eq!(state.load_or_cached(&store).unwrap(), None);
    }

    #[test]
    fn app_access_policy_defaults_to_allow_all() {
        let preferences = PreferencesWire::default();
        let policy = AppAccessPolicyWire::from(&preferences);

        assert!(policy.allow_all_installed_apps);
        assert!(policy.allowed_app_ids.is_empty());
    }

    #[test]
    fn written_response_preferences_are_injected_into_sidecar_request() {
        let preferences = PreferencesWire {
            response_style: "written-zh-hk".into(),
            response_language: "fixed-zh-HK".into(),
            allow_all_installed_apps: false,
            allowed_app_ids: vec!["bundle:com.apple.MobileSMS".into()],
            ..PreferencesWire::default()
        };

        let mut request = SidecarRequest {
            input: "解釋量子糾纏".into(),
            ui_language: None,
            input_language: None,
            output_language: None,
            response_language_mode: None,
            response_style: None,
            installed_apps: None,
            app_access_policy: None,
        };

        apply_preferences_to_request(&mut request, &preferences);

        assert_eq!(request.response_style.as_deref(), Some("written-zh-hk"));
        assert_eq!(request.response_language_mode.as_deref(), Some("fixed"));
        assert_eq!(request.output_language.as_deref(), Some("yue-HK"));
        let policy = request.app_access_policy.unwrap();
        assert!(!policy.allow_all_installed_apps);
        assert_eq!(
            policy.allowed_app_ids,
            vec!["bundle:com.apple.MobileSMS".to_string()]
        );
    }

    #[test]
    fn preferences_json_round_trip_preserves_app_access_and_response_style() {
        let original = PreferencesWire {
            ui_language: "zh-HK".into(),
            response_style: "written-zh-hk".into(),
            response_language: "follow-input".into(),
            allow_all_installed_apps: false,
            allowed_app_ids: vec![
                "bundle:com.apple.MobileSMS".into(),
                "bundle:com.apple.calculator".into(),
            ],
        };

        let encoded = serde_json::to_value(&original).unwrap();
        let decoded = serde_json::from_value::<PreferencesWire>(encoded).unwrap();

        assert_eq!(decoded, original);
    }

    #[test]
    fn switching_allow_all_on_preserves_selected_app_ids_for_future_reuse() {
        let normalized = normalize_preferences(PreferencesWire {
            allow_all_installed_apps: true,
            allowed_app_ids: vec![
                "bundle:com.apple.MobileSMS".into(),
                "bundle:com.apple.calculator".into(),
            ],
            ..PreferencesWire::default()
        });

        assert!(normalized.allow_all_installed_apps);
        assert_eq!(
            normalized.allowed_app_ids,
            vec![
                "bundle:com.apple.MobileSMS".to_string(),
                "bundle:com.apple.calculator".to_string(),
            ]
        );
    }

    #[test]
    fn preference_normalization_keeps_atomic_app_policy_and_stable_ids() {
        let normalized = normalize_preferences(PreferencesWire {
            ui_language: "invalid".into(),
            response_style: "invalid".into(),
            response_language: "invalid".into(),
            allow_all_installed_apps: false,
            allowed_app_ids: vec![
                "bundle:com.apple.MobileSMS".into(),
                "../../bin/sh".into(),
                "bundle:com.apple.MobileSMS".into(),
            ],
        });

        assert_eq!(normalized.ui_language, "zh-HK");
        assert_eq!(normalized.response_style, "cantonese-hk");
        assert_eq!(normalized.response_language, "follow-input");
        assert!(!normalized.allow_all_installed_apps);
        assert_eq!(
            normalized.allowed_app_ids,
            vec!["bundle:com.apple.MobileSMS".to_string()]
        );
    }
}
