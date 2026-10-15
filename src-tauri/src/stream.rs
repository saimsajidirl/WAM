use axum::{
    body::Body,
    extract::{Path, Query, Request, State},
    http::{header, HeaderMap, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::io;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

use crate::state::AppState;

const CHUNK: usize = 256 * 1024;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/media/{id}", get(media))
        .route("/transcode/{id}", get(transcode))
        .route("/audiotx/{id}", get(audiotx))
        .route("/thumb/{id}", get(thumb))
        .route("/cover/{id}", get(cover))
        .layer(middleware::from_fn(cors_preflight))
        .with_state(state)
}

/// Answer CORS preflights (incl. Private Network Access, required by WebView2
/// when the app origin fetches http://127.0.0.1 with crossOrigin=anonymous).
async fn cors_preflight(req: Request, next: Next) -> Response {
    if req.method() == Method::OPTIONS {
        let mut h = cors();
        h.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            "GET, OPTIONS".parse().unwrap(),
        );
        h.insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            "Range, Content-Type".parse().unwrap(),
        );
        h.insert(header::ACCESS_CONTROL_MAX_AGE, "600".parse().unwrap());
        return (StatusCode::NO_CONTENT, h).into_response();
    }
    next.run(req).await
}

fn cors() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".parse().unwrap());
    h.insert(
        "access-control-allow-private-network",
        "true".parse().unwrap(),
    );
    h.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        "Content-Range, Accept-Ranges, Content-Length, Content-Type, X-Transcode"
            .parse()
            .unwrap(),
    );
    h.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    h
}

fn bad(msg: &str) -> Response {
    (StatusCode::NOT_FOUND, cors(), msg.to_string()).into_response()
}

/// Stream a local file with HTTP Range support (required for seeking).
async fn media(
    State(st): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(path) = st.resolve(&id) else {
        return bad("unknown media id");
    };
    if crate::classify::is_url(&path.to_string_lossy()) {
        return (StatusCode::BAD_REQUEST, cors(), "use src directly for urls").into_response();
    }
    serve_file(path, headers, None).await
}

async fn serve_file(path: PathBuf, headers: HeaderMap, content_type: Option<&str>) -> Response {
    let mut file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => return bad("file not found"),
    };
    let len = match file.metadata().await {
        Ok(m) => m.len(),
        Err(_) => return bad("stat failed"),
    };

    let mut start: u64 = 0;
    let mut end: u64 = len.saturating_sub(1);
    let mut partial = false;

    if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some(spec) = range.strip_prefix("bytes=") {
            let spec = spec.split(',').next().unwrap_or("").trim();
            let mut it = spec.splitn(2, '-');
            let (a, b) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
            let parsed: Option<(u64, u64)> = if a.is_empty() {
                // suffix range: last N bytes
                b.parse::<u64>()
                    .ok()
                    .map(|n| (len.saturating_sub(n), len.saturating_sub(1)))
            } else {
                (|| {
                    let s = a.parse::<u64>().ok()?;
                    let e = if b.is_empty() {
                        len.saturating_sub(1)
                    } else {
                        b.parse::<u64>().ok()?.min(len.saturating_sub(1))
                    };
                    Some((s, e))
                })()
            };
            if let Some((s, e)) = parsed {
                if s <= e && s < len {
                    start = s;
                    end = e;
                    partial = true;
                } else {
                    let mut h = cors();
                    h.insert(
                        header::CONTENT_RANGE,
                        format!("bytes */{}", len).parse().unwrap(),
                    );
                    return (StatusCode::RANGE_NOT_SATISFIABLE, h).into_response();
                }
            }
        }
    }

    if start > 0 {
        if file
            .seek(std::io::SeekFrom::Start(start))
            .await
            .is_err()
        {
            return bad("seek failed");
        }
    }
    let remaining = end - start + 1;

    let stream = async_stream::stream! {
        let mut left = remaining;
        let mut buf = vec![0u8; CHUNK];
        while left > 0 {
            let want = left.min(buf.len() as u64) as usize;
            match file.read(&mut buf[..want]).await {
                Ok(0) => break,
                Ok(n) => {
                    left -= n as u64;
                    yield Ok::<_, io::Error>(bytes::Bytes::copy_from_slice(&buf[..n]));
                }
                Err(e) => { yield Err(e); break; }
            }
        }
    };

    let mime = content_type
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            mime_guess::from_path(&path)
                .first_or_octet_stream()
                .to_string()
        });

    let mut h = cors();
    h.insert(header::CONTENT_TYPE, mime.parse().unwrap());
    h.insert(header::ACCEPT_RANGES, "bytes".parse().unwrap());
    h.insert(
        header::CONTENT_LENGTH,
        remaining.to_string().parse().unwrap(),
    );

    let status = if partial {
        h.insert(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", start, end, len).parse().unwrap(),
        );
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    (status, h, Body::from_stream(stream)).into_response()
}

#[derive(serde::Deserialize)]
pub struct TxQuery {
    start: Option<f64>,
    at: Option<u32>, // audio stream index (0-based among a: streams)
    vt: Option<u32>, // video stream index
}

/// Transcode any media ffmpeg can decode into fragmented-MP4 (h264/aac),
/// streamed on the fly. `start` restarts the transcode at a seek offset.
async fn transcode(
    State(st): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<TxQuery>,
) -> Response {
    let Some(path) = st.resolve(&id) else {
        return bad("unknown media id");
    };
    let ffmpeg = {
        let t = st.tools.read().unwrap();
        match &t.ffmpeg {
            Some(f) => f.clone(),
            None => return bad("ffmpeg not available"),
        }
    };

    let mut args: Vec<String> = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
    ];
    if let Some(s) = q.start {
        if s > 0.0 {
            args.push("-ss".into());
            args.push(format!("{:.3}", s));
        }
    }
    let src = path.to_string_lossy().to_string();
    let is_remote = crate::classify::is_url(&src);
    if is_remote {
        args.push("-reconnect".into());
        args.push("1".into());
        args.push("-reconnect_streamed".into());
        args.push("1".into());
        args.push("-timeout".into());
        args.push("15000000".into());
    }
    args.push("-i".into());
    args.push(src);
    args.push("-map".into());
    args.push(format!("0:v:{}", q.vt.unwrap_or(0)));
    args.push("-map".into());
    args.push(format!("0:a:{}?", q.at.unwrap_or(0))); // optional audio
    args.extend([
        "-c:v".into(), "libx264".into(),
        "-preset".into(), "ultrafast".into(),
        "-tune".into(), "fastdecode".into(),
        "-crf".into(), "22".into(),
        "-pix_fmt".into(), "yuv420p".into(),
        "-c:a".into(), "aac".into(),
        "-b:a".into(), "160k".into(),
        "-ac".into(), "2".into(),
        "-movflags".into(), "+frag_keyframe+empty_moov+default_base_moof".into(),
        "-f".into(), "mp4".into(),
        "-".into(),
    ]);

    let stream = crate::ffmpeg::spawn_pipe(ffmpeg, args);
    let mut h = cors();
    h.insert(header::CONTENT_TYPE, "video/mp4".parse().unwrap());
    h.insert("X-Transcode", "1".parse().unwrap());
    (StatusCode::OK, h, Body::from_stream(stream)).into_response()
}

/// Transcode audio-only sources to a streamable format (mp3 -> aac -> wav fallback).
async fn audiotx(
    State(st): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<TxQuery>,
) -> Response {
    let Some(path) = st.resolve(&id) else {
        return bad("unknown media id");
    };
    let (ffmpeg, use_mp3) = {
        let t = st.tools.read().unwrap();
        match &t.ffmpeg {
            Some(f) => (f.clone(), t.mp3),
            None => return bad("ffmpeg not available"),
        }
    };

    let mut args: Vec<String> = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
    ];
    if let Some(s) = q.start {
        if s > 0.0 {
            args.push("-ss".into());
            args.push(format!("{:.3}", s));
        }
    }
    args.push("-i".into());
    args.push(path.to_string_lossy().to_string());
    args.push("-map".into());
    args.push(format!("0:a:{}", q.at.unwrap_or(0)));
    args.push("-vn".into());

    let (codec_args, mime): (Vec<String>, &str) = if use_mp3 {
        (
            vec!["-c:a".into(), "libmp3lame".into(), "-b:a".into(), "192k".into(), "-f".into(), "mp3".into()],
            "audio/mpeg",
        )
    } else {
        (
            vec!["-c:a".into(), "aac".into(), "-b:a".into(), "160k".into(), "-f".into(), "adts".into()],
            "audio/aac",
        )
    };
    args.extend(codec_args);
    args.push("-".into());

    let stream = crate::ffmpeg::spawn_pipe(ffmpeg, args);
    let mut h = cors();
    h.insert(header::CONTENT_TYPE, mime.parse().unwrap());
    h.insert("X-Transcode", "1".parse().unwrap());
    (StatusCode::OK, h, Body::from_stream(stream)).into_response()
}

#[derive(serde::Deserialize)]
pub struct ThumbQuery {
    t: Option<f64>,
}

/// Extract a JPEG thumbnail at time t (cached on disk).
async fn thumb(
    State(st): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<ThumbQuery>,
    headers: HeaderMap,
) -> Response {
    let Some(path) = st.resolve(&id) else {
        return bad("unknown media id");
    };
    let dir = st.cache_dir.join("thumbs");
    let _ = std::fs::create_dir_all(&dir);
    let key = format!("{:x}", fxhash(format!("{}:{}", path.display(), q.t.unwrap_or(3.0)).as_str()));
    let out = dir.join(format!("{}.jpg", key));
    if !out.exists() {
        let ffmpeg = {
            let t = st.tools.read().unwrap();
            match &t.ffmpeg {
                Some(f) => f.clone(),
                None => return bad("ffmpeg not available"),
            }
        };
        let ok = crate::ffmpeg::thumbnail(&ffmpeg, &path, &out, q.t.unwrap_or(3.0)).await;
        if !ok {
            return bad("thumbnail failed");
        }
    }
    serve_file(out, headers, Some("image/jpeg")).await
}

/// Extract embedded cover art from audio files (cached on disk).
async fn cover(
    State(st): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(path) = st.resolve(&id) else {
        return bad("unknown media id");
    };
    let dir = st.cache_dir.join("covers");
    let _ = std::fs::create_dir_all(&dir);
    let key = format!("{:x}", fxhash(path.to_string_lossy().as_ref()));
    let out = dir.join(format!("{}.jpg", key));
    if !out.exists() {
        let ffmpeg = {
            let t = st.tools.read().unwrap();
            match &t.ffmpeg {
                Some(f) => f.clone(),
                None => return bad("ffmpeg not available"),
            }
        };
        let ok = crate::ffmpeg::cover_art(&ffmpeg, &path, &out).await;
        if !ok {
            return bad("no cover");
        }
    }
    serve_file(out, headers, Some("image/jpeg")).await
}

/// Simple FNV-style hash (no external dep needed).
fn fxhash(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}
