use base64::Engine;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

use crate::classify::{classify, is_url, MediaKind};
use crate::state::AppState;

#[derive(Debug, Clone, serde::Serialize)]
pub struct MediaItem {
    pub id: String,
    /// display path (for locals) or the URL itself
    pub path: String,
    pub name: String,
    pub kind: MediaKind,
    /// true when the WebView can play it directly
    pub native: bool,
    pub remote: bool,
    /// ready-to-use playback URL (local files go through the stream server)
    pub src: String,
}

fn make_item(st: &AppState, path: &str) -> MediaItem {
    let (kind, native) = classify(path);
    let remote = is_url(path);
    let name = if remote {
        path.rsplit('/').next().unwrap_or(path).to_string()
    } else {
        Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    };
    let id = st.register(PathBuf::from(path));
    let src = if remote {
        path.to_string()
    } else {
        format!("http://127.0.0.1:{}/media/{}", st.port, id)
    };
    MediaItem {
        id,
        path: path.to_string(),
        name,
        kind,
        native,
        remote,
        src,
    }
}

fn fxhash(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

#[tauri::command]
pub fn register_path(st: State<'_, AppState>, path: String) -> MediaItem {
    make_item(&st, &path)
}

#[tauri::command]
pub fn register_paths(st: State<'_, AppState>, paths: Vec<String>) -> Vec<MediaItem> {
    paths.iter().map(|p| make_item(&st, p)).collect()
}

#[tauri::command]
pub fn scan_folder(st: State<'_, AppState>, path: String) -> Vec<MediaItem> {
    let mut found: Vec<PathBuf> = Vec::new();
    let mut stack = vec![(PathBuf::from(&path), 0u8)];
    while let Some((dir, depth)) = stack.pop() {
        if depth > 8 {
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    stack.push((p, depth + 1));
                } else if matches!(classify(&p.to_string_lossy()).0, MediaKind::Video | MediaKind::Audio) {
                    found.push(p);
                }
            }
        }
    }
    found.sort_by(|a, b| {
        a.file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .cmp(&b.file_name().map(|n| n.to_string_lossy().to_lowercase()))
    });
    found
        .iter()
        .map(|p| make_item(&st, &p.to_string_lossy()))
        .collect()
}

#[tauri::command]
pub fn stream_port(st: State<'_, AppState>) -> u16 {
    st.port
}

#[tauri::command]
pub fn stream_base(st: State<'_, AppState>) -> String {
    format!("http://127.0.0.1:{}", st.port)
}

#[tauri::command]
pub fn ffmpeg_status(st: State<'_, AppState>) -> Value {
    let t = st.tools.read().unwrap();
    json!({
        "available": t.available(),
        "ffmpeg": t.ffmpeg,
        "ffprobe": t.ffprobe,
        "version": t.version,
        "mp3Encoder": t.mp3,
        "opusEncoder": t.opus,
    })
}

#[tauri::command]
pub fn set_ffmpeg_path(st: State<'_, AppState>, path: Option<String>) -> Value {
    let app_data = st.state_file.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let tools = crate::ffmpeg::resolve(path.as_deref(), &app_data);
    *st.tools.write().unwrap() = tools;
    let t = st.tools.read().unwrap();
    json!({
        "available": t.available(),
        "ffmpeg": t.ffmpeg,
        "version": t.version,
        "mp3Encoder": t.mp3,
        "opusEncoder": t.opus,
    })
}

/// Full ffprobe JSON for a registered media id (local file or remote URL).
#[tauri::command]
pub async fn media_info(st: State<'_, AppState>, id: String) -> Result<Value, String> {
    let path = st.resolve(&id).ok_or("unknown id")?;
    let probe = {
        st.tools.read().unwrap().ffprobe.clone().ok_or("ffprobe not available")?
    };
    let args = vec![
        "-v".into(), "quiet".into(),
        "-print_format".into(), "json".into(),
        "-show_format".into(), "-show_streams".into(), "-show_chapters".into(),
        path.to_string_lossy().to_string(),
    ];
    let out = crate::ffmpeg::run_capture(&probe, &args)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::from_slice(&out).map_err(|e| e.to_string())
}

/// Extract an embedded text subtitle stream as SRT.
#[tauri::command]
pub async fn extract_subtitle(
    st: State<'_, AppState>,
    id: String,
    stream_index: u32,
) -> Result<String, String> {
    let path = st.resolve(&id).ok_or("unknown id")?;
    let ffmpeg = {
        st.tools.read().unwrap().ffmpeg.clone().ok_or("ffmpeg not available")?
    };
    let args = vec![
        "-nostdin".into(), "-hide_banner".into(), "-loglevel".into(), "error".into(),
        "-i".into(), path.to_string_lossy().to_string(),
        "-map".into(), format!("0:{}", stream_index),
        "-f".into(), "srt".into(),
        "-".into(),
    ];
    let out = crate::ffmpeg::run_capture(&ffmpeg, &args)
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(out).map_err(|_| "subtitle not utf-8".to_string())
}

/// Peak waveform for audio seek bars / visualization. Returns ~1024 normalized peaks.
#[tauri::command]
pub async fn waveform(st: State<'_, AppState>, id: String) -> Result<Vec<f32>, String> {
    let path = st.resolve(&id).ok_or("unknown id")?;

    // disk cache
    let dir = st.cache_dir.join("waves");
    let _ = std::fs::create_dir_all(&dir);
    let cache = dir.join(format!("{:x}.json", fxhash(&path.to_string_lossy())));
    if let Ok(text) = std::fs::read_to_string(&cache) {
        if let Ok(v) = serde_json::from_str::<Vec<f32>>(&text) {
            return Ok(v);
        }
    }

    let ffmpeg = {
        st.tools.read().unwrap().ffmpeg.clone().ok_or("ffmpeg not available")?
    };
    let args = vec![
        "-nostdin".into(), "-hide_banner".into(), "-loglevel".into(), "error".into(),
        "-i".into(), path.to_string_lossy().to_string(),
        "-t".into(), "1800".into(), // cap at 30 minutes of decode
        "-vn".into(),
        "-ac".into(), "1".into(),
        "-ar".into(), "8000".into(),
        "-f".into(), "s16le".into(),
        "-".into(),
    ];
    let pcm = crate::ffmpeg::run_capture(&ffmpeg, &args)
        .await
        .map_err(|e| e.to_string())?;
    if pcm.len() < 4 {
        return Err("no audio".into());
    }
    let samples: Vec<i16> = pcm
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect();
    const BUCKETS: usize = 1024;
    let per = (samples.len() / BUCKETS).max(1);
    let mut peaks = Vec::with_capacity(BUCKETS);
    for chunk in samples.chunks(per) {
        let max = chunk.iter().map(|s| s.unsigned_abs()).max().unwrap_or(0);
        peaks.push(max as f32 / 32768.0);
    }
    let _ = std::fs::write(&cache, serde_json::to_string(&peaks).unwrap_or_default());
    Ok(peaks)
}

/// Read a text file (subtitles etc), tolerating non-UTF8 encodings.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    // strip BOM
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        &bytes[..]
    };
    Ok(String::from_utf8_lossy(bytes).to_string())
}

/// Save a base64 payload to disk (screenshots).
#[tauri::command]
pub fn write_binary(path: String, b64: String) -> Result<(), String> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            open::that(parent).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Load persisted frontend state JSON.
#[tauri::command]
pub fn load_state(st: State<'_, AppState>) -> Option<Value> {
    std::fs::read_to_string(&st.state_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

#[tauri::command]
pub fn save_state(st: State<'_, AppState>, state: Value) -> Result<(), String> {
    if let Some(dir) = st.state_file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = st.state_file.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_string(&state).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &st.state_file).map_err(|e| e.to_string())
}

/// File stats for the info panel.
#[tauri::command]
pub fn stat_file(path: String) -> Result<Value, String> {
    let m = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(json!({
        "size": m.len(),
        "modified": m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()),
    }))
}

/// Convert/transcode a media file to another container/codec.
/// Progress is emitted on "convert-progress" events.
#[tauri::command]
pub async fn convert_media(
    st: State<'_, AppState>,
    app: AppHandle,
    id: String,
    output: String,
    preset: String,
) -> Result<(), String> {
    let path = st.resolve(&id).ok_or("unknown id")?;
    let ffmpeg = {
        st.tools.read().unwrap().ffmpeg.clone().ok_or("ffmpeg not available")?
    };

    // get duration for progress reporting
    let mut duration: f64 = 0.0;
    let ffprobe = st.tools.read().unwrap().ffprobe.clone();
    if let Some(probe) = ffprobe {
        let args = vec![
            "-v".into(), "quiet".into(),
            "-print_format".into(), "json".into(),
            "-show_entries".into(), "format=duration".into(),
            path.to_string_lossy().to_string(),
        ];
        if let Ok(out) = crate::ffmpeg::run_capture(&probe, &args).await {
            if let Ok(v) = serde_json::from_slice::<Value>(&out) {
                duration = v["format"]["duration"]
                    .as_str()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0.0);
            }
        }
    }

    let mut args: Vec<String> = vec![
        "-nostdin".into(), "-hide_banner".into(), "-loglevel".into(), "error".into(),
        "-y".into(),
        "-i".into(), path.to_string_lossy().to_string(),
    ];
    match preset.as_str() {
        "mp4" | "mp4fast" => {
            let p = if preset == "mp4fast" { "veryfast" } else { "medium" };
            args.extend([
                "-c:v".into(), "libx264".into(), "-preset".into(), p.into(),
                "-crf".into(), if preset == "mp4fast" { "23".into() } else { "20".into() },
                "-pix_fmt".into(), "yuv420p".into(),
                "-c:a".into(), "aac".into(), "-b:a".into(), "192k".into(),
                "-movflags".into(), "+faststart".into(),
            ]);
        }
        "webm" => {
            args.extend([
                "-c:v".into(), "libvpx-vp9".into(), "-crf".into(), "32".into(), "-b:v".into(), "0".into(),
                "-c:a".into(), "libopus".into(), "-b:a".into(), "128k".into(),
            ]);
        }
        "mp3" => {
            args.extend(["-vn".into(), "-c:a".into(), "libmp3lame".into(), "-b:a".into(), "192k".into()]);
        }
        "m4a" => {
            args.extend(["-vn".into(), "-c:a".into(), "aac".into(), "-b:a".into(), "256k".into()]);
        }
        "wav" => {
            args.extend(["-vn".into(), "-c:a".into(), "pcm_s16le".into()]);
        }
        "ogg" => {
            args.extend(["-vn".into(), "-c:a".into(), "libopus".into(), "-b:a".into(), "160k".into()]);
        }
        "gif" => {
            args.extend([
                "-vf".into(), "fps=12,scale=480:-1:flags=lanczos".into(),
                "-loop".into(), "0".into(),
            ]);
        }
        _ => return Err("unknown preset".into()),
    }
    args.push("-progress".into());
    args.push("pipe:1".into());
    args.push("-nostats".into());
    args.push(output.clone());

    tauri::async_runtime::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut child = match tokio::process::Command::new(&ffmpeg)
            .args(&args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("convert-done", json!({"output": output, "ok": false, "error": e.to_string()}));
                return;
            }
        };
        if let Some(stdout) = child.stdout.take() {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(us) = line.strip_prefix("out_time_us=").or_else(|| line.strip_prefix("out_time_ms=")) {
                    if let Ok(v) = us.trim().parse::<f64>() {
                        let secs = if line.contains("out_time_us") { v / 1e6 } else { v / 1e6 };
                        let pct = if duration > 0.0 { (secs / duration * 100.0).min(99.0) } else { 0.0 };
                        let _ = app.emit("convert-progress", json!({"output": output, "percent": pct}));
                    }
                }
            }
        }
        let status = child.wait().await.map(|s| s.success()).unwrap_or(false);
        let _ = app.emit("convert-done", json!({"output": output, "ok": status}));
    });
    Ok(())
}
