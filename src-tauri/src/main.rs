#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod classify;
mod commands;
mod ffmpeg;
mod state;
mod stream;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, RwLock};
use tauri::Manager;

use state::{AppState, Shared};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let _ = std::fs::create_dir_all(&app_dir);
            let cache_dir = app_dir.join("cache");
            let _ = std::fs::create_dir_all(&cache_dir);
            let state_file = app_dir.join("state.json");

            // Load persisted settings first (may contain ffmpeg path override).
            let saved: Option<serde_json::Value> = std::fs::read_to_string(&state_file)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok());
            let ffmpeg_override = saved
                .as_ref()
                .and_then(|v| v["settings"]["ffmpegPath"].as_str())
                .map(|s| s.to_string());

            let tools = ffmpeg::resolve(ffmpeg_override.as_deref(), &app_dir);

            // Bind the streaming server before constructing state.
            let listener = std::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
                .expect("failed to bind stream server");
            listener.set_nonblocking(true).ok();
            let port = listener.local_addr().unwrap().port();

            let shared: AppState = Arc::new(Shared {
                media: RwLock::new(HashMap::new()),
                counter: AtomicU64::new(1),
                port,
                tools: RwLock::new(tools),
                state_file,
                cache_dir,
            });

            let router = stream::router(shared.clone());
            tauri::async_runtime::spawn(async move {
                let listener = tokio::net::TcpListener::from_std(listener).unwrap();
                axum::serve(listener, router).await.ok();
            });

            app.manage(shared);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::register_path,
            commands::register_paths,
            commands::scan_folder,
            commands::stream_port,
            commands::stream_base,
            commands::ffmpeg_status,
            commands::set_ffmpeg_path,
            commands::media_info,
            commands::extract_subtitle,
            commands::waveform,
            commands::read_text_file,
            commands::write_binary,
            commands::reveal_in_explorer,
            commands::load_state,
            commands::save_state,
            commands::stat_file,
            commands::convert_media,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WAM");
}
