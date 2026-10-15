use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

use crate::state::Tools;

/// Locate ffmpeg/ffprobe: settings override -> PATH -> next to exe -> app data dir.
pub fn resolve(override_path: Option<&str>, app_data: &Path) -> Tools {
    let mut tools = Tools::default();

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(p) = override_path.filter(|s| !s.is_empty()) {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            candidates.push(pb.join(exe("ffmpeg")));
        } else {
            candidates.push(pb);
        }
    }
    if let Ok(paths) = std::env::var("PATH") {
        for dir in paths.split(if cfg!(windows) { ';' } else { ':' }) {
            if !dir.is_empty() {
                candidates.push(PathBuf::from(dir).join(exe("ffmpeg")));
            }
        }
    }
    if let Ok(cur) = std::env::current_exe() {
        if let Some(dir) = cur.parent() {
            candidates.push(dir.join(exe("ffmpeg")));
            candidates.push(dir.join("ffmpeg").join(exe("ffmpeg")));
            candidates.push(dir.join("bin").join(exe("ffmpeg")));
        }
    }
    candidates.push(app_data.join("bin").join(exe("ffmpeg")));

    tools.ffmpeg = candidates.into_iter().find(|p| p.is_file());
    tools.ffprobe = tools
        .ffmpeg
        .as_ref()
        .and_then(|f| f.parent().map(|d| d.join(exe("ffprobe"))))
        .filter(|p| p.is_file())
        .or_else(|| {
            std::env::var("PATH").ok().and_then(|paths| {
                paths
                    .split(if cfg!(windows) { ';' } else { ':' })
                    .map(|d| PathBuf::from(d).join(exe("ffprobe")))
                    .find(|p| p.is_file())
            })
        });

    if let Some(ff) = &tools.ffmpeg {
        if let Ok(out) = std::process::Command::new(ff)
            .args(["-hide_banner", "-version"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            tools.version = text.lines().next().map(|s| s.to_string());
        }
        if let Ok(out) = std::process::Command::new(ff)
            .args(["-hide_banner", "-encoders"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            tools.mp3 = text.contains("libmp3lame");
            tools.opus = text.contains("libopus");
        }
    }
    tools
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{}.exe", name)
    } else {
        name.to_string()
    }
}

/// Spawn a command and stream its stdout. Child is killed when the stream drops.
pub fn spawn_pipe(
    prog: PathBuf,
    args: Vec<String>,
) -> impl futures_lite::Stream<Item = Result<bytes::Bytes, io::Error>> + Send + 'static {
    async_stream::try_stream! {
        let mut child = Command::new(&prog)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        let mut stdout = child.stdout.take().expect("piped stdout");
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => yield bytes::Bytes::copy_from_slice(&buf[..n]),
            }
        }
        let _ = child.wait().await;
    }
}

pub async fn run_capture(prog: &Path, args: &[String]) -> io::Result<Vec<u8>> {
    let out = Command::new(prog)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await?;
    Ok(out.stdout)
}

pub async fn thumbnail(ffmpeg: &Path, input: &Path, out: &Path, t: f64) -> bool {
    let args = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-ss".into(),
        format!("{:.3}", t),
        "-i".into(),
        input.to_string_lossy().to_string(),
        "-frames:v".into(),
        "1".into(),
        "-vf".into(),
        "scale='min(640,iw)':-2".into(),
        "-q:v".into(),
        "4".into(),
        "-y".into(),
        out.to_string_lossy().to_string(),
    ];
    Command::new(ffmpeg)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success() && out.exists())
        .unwrap_or(false)
}

pub async fn cover_art(ffmpeg: &Path, input: &Path, out: &Path) -> bool {
    let args = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        input.to_string_lossy().to_string(),
        "-an".into(),
        "-frames:v".into(),
        "1".into(),
        "-vf".into(),
        "scale='min(800,iw)':-2".into(),
        "-q:v".into(),
        "4".into(),
        "-y".into(),
        out.to_string_lossy().to_string(),
    ];
    Command::new(ffmpeg)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success() && out.exists())
        .unwrap_or(false)
}
