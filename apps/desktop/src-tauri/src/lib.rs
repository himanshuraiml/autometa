use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;

/// Handle to the running backend sidecar so it can be killed on exit.
struct BackendProcess(Mutex<Option<CommandChild>>);

/// Per-launch bearer token shared between the sidecar and the frontend.
/// The backend rejects any /api request without it, so a stray local process
/// or web page cannot drive the sidecar.
struct BackendToken(String);

#[tauri::command]
fn get_backend_token(token: tauri::State<'_, BackendToken>) -> String {
    token.0.clone()
}

/// OS-keychain storage for LLM API keys, so they never sit in localStorage.
/// Only the fixed set of names the frontend owns is allowed, keeping the
/// webview from reading arbitrary keychain entries through this command.
const KEYCHAIN_SERVICE: &str = "com.autometa.studio";
const ALLOWED_SECRET_NAMES: [&str; 5] = [
    "autometa_gemini_key",
    "autometa_openai_key",
    "autometa_groq_key",
    "autometa_custom_key",
    "autometa_github_token",
];

fn keychain_entry(name: &str) -> Result<keyring::Entry, String> {
    if !ALLOWED_SECRET_NAMES.contains(&name) {
        return Err(format!("unknown secret name: {name}"));
    }
    keyring::Entry::new(KEYCHAIN_SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(name: String) -> Result<Option<String>, String> {
    let entry = keychain_entry(&name)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_set(name: String, value: String) -> Result<(), String> {
    let entry = keychain_entry(&name)?;
    if value.is_empty() {
        // Clearing a key removes the keychain entry entirely.
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&value).map_err(|e| e.to_string())
    }
}

fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(desktop)]
fn spawn_backend(app_handle: tauri::AppHandle, token: String) {
    use tauri_plugin_shell::process::CommandEvent;
    use tauri_plugin_shell::ShellExt;

    tauri::async_runtime::spawn(async move {
        let sidecar = match app_handle.shell().sidecar("autometa-backend") {
            Ok(cmd) => cmd.env("AUTOMETA_AUTH_TOKEN", &token),
            Err(e) => {
                log::error!("backend sidecar unavailable: {e}");
                return;
            }
        };

        match sidecar.spawn() {
            Ok((mut rx, child)) => {
                log::info!("backend sidecar started (pid {})", child.pid());
                app_handle
                    .state::<BackendProcess>()
                    .0
                    .lock()
                    .unwrap()
                    .replace(child);

                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            log::info!("[backend] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            log::warn!("[backend] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Terminated(payload) => {
                            log::error!("backend sidecar terminated (code {:?})", payload.code);
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => log::error!("failed to spawn backend sidecar: {e}"),
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = generate_token();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .manage(BackendToken(token.clone()))
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_backend_token, secret_get, secret_set])
        .setup(move |app| {
            #[cfg(desktop)]
            spawn_backend(app.handle().clone(), token.clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let child = app_handle
                .state::<BackendProcess>()
                .0
                .lock()
                .unwrap()
                .take();
            if let Some(child) = child {
                match child.kill() {
                    Ok(()) => log::info!("backend sidecar stopped"),
                    Err(e) => log::error!("failed to stop backend sidecar: {e}"),
                }
            }
        }
    });
}
