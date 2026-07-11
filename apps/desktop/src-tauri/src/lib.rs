#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(desktop)]
      {
        use tauri_plugin_shell::ShellExt;
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          if let Ok(sidecar) = app_handle.shell().sidecar("autometa-backend") {
            let _ = sidecar.spawn();
          }
        });
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
