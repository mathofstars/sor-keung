use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{
    process::CommandEvent,
    ShellExt,
};

const SIDECAR_NAME: &str = "sor-keung-sidecar";
const STARTUP_LOG: &str = "/tmp/sor-keung-startup.log";

fn startup_log(message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(STARTUP_LOG) {
        let _ = writeln!(file, "{message}");
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
}

#[derive(Debug, Deserialize, Serialize)]
struct SidecarResponse {
    ok: bool,
    kind: String,
    message: String,
}

fn configuration_error() -> SidecarResponse {
    SidecarResponse {
        ok: false,
        kind: "error".into(),
        message: "請輸入 OpenRouter API Key。".into(),
    }
}

fn bridge_error() -> SidecarResponse {
    SidecarResponse {
        ok: false,
        kind: "error".into(),
        message: "Sor-Keung 無法處理這項要求。".into(),
    }
}

#[tauri::command]
async fn run_sor_keung(
    app: AppHandle,
    request: SidecarRequest,
    api_key: String,
) -> Result<SidecarResponse, String> {
    if api_key.trim().is_empty() {
        return Ok(configuration_error());
    }

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
            CommandEvent::Error(_) => return Ok(bridge_error()),
            CommandEvent::Terminated(payload) => {
                exited_successfully = payload.code == Some(0);
            }
            _ => {}
        }
    }

    if !exited_successfully {
        return Ok(bridge_error());
    }

    serde_json::from_slice::<SidecarResponse>(&stdout).or_else(|_| Ok(bridge_error()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = std::fs::remove_file(STARTUP_LOG);
    startup_log("1: entered Rust run()");

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            startup_log("2: entered Tauri setup()");

            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Sor-Keung 傻強")
            .inner_size(720.0, 620.0)
            .resizable(true)
            .visible(true)
            .build()?;

            startup_log("3: main webview window built");
            window.show()?;
            startup_log("4: window.show() succeeded");
            window.set_focus()?;
            startup_log("5: window.set_focus() succeeded");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![run_sor_keung])
        .run(tauri::generate_context!());

    match result {
        Ok(_) => startup_log("6: Tauri event loop exited normally"),
        Err(_) => startup_log("6: Tauri event loop returned an error"),
    }
}
