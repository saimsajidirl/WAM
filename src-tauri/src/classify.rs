/// Format classification: which extensions the WebView2/Chromium engine can
/// play natively vs which need the ffmpeg transcode pipeline.

const NATIVE_VIDEO: &[&str] = &[
    "mp4", "m4v", "webm", "mov",
];

const NATIVE_AUDIO: &[&str] = &[
    "mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "weba",
];

const VIDEO: &[&str] = &[
    "mkv", "avi", "wmv", "ts", "mts", "m2ts", "mpg", "mpeg", "mpv", "vob",
    "3gp", "3g2", "rm", "rmvb", "flv", "f4v", "divx", "asf", "ogv", "mxf",
    "dv", "mod", "tod", "dat", "amv", "mp2", "m2v", "m4p", "nsv", "wtv",
];

const AUDIO: &[&str] = &[
    "wma", "aif", "aiff", "ape", "ac3", "dts", "mka", "mid", "midi", "ra",
    "amr", "mpc", "tta", "caf", "gsm", "au", "wv", "tak", "ofr", "ofs",
    "spx", "dsf", "dff", "mlp", "eac3", "mpa", "aifc", "snd", "voc", "8svx",
];

const SUBTITLES: &[&str] = &["srt", "vtt", "ass", "ssa", "sub", "sbv", "lrc"];

const IMAGES: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "tiff", "tif", "ico",
];

fn ext_of(path: &str) -> String {
    // For URLs, strip query/hash first.
    let clean = path.split(&['?', '#'][..]).next().unwrap_or(path);
    std::path::Path::new(clean)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Video,
    Audio,
    Subtitle,
    Image,
    Unknown,
}

impl MediaKind {
    pub fn is_playable(&self) -> bool {
        matches!(self, MediaKind::Video | MediaKind::Audio)
    }
}

pub fn classify(path: &str) -> (MediaKind, bool) {
    let e = ext_of(path);
    if NATIVE_VIDEO.contains(&e.as_str()) {
        (MediaKind::Video, true)
    } else if VIDEO.contains(&e.as_str()) {
        (MediaKind::Video, false)
    } else if NATIVE_AUDIO.contains(&e.as_str()) {
        (MediaKind::Audio, true)
    } else if AUDIO.contains(&e.as_str()) {
        (MediaKind::Audio, false)
    } else if SUBTITLES.contains(&e.as_str()) {
        (MediaKind::Subtitle, false)
    } else if IMAGES.contains(&e.as_str()) {
        (MediaKind::Image, true)
    } else {
        (MediaKind::Unknown, false)
    }
}

/// Is this path a remote URL?
pub fn is_url(path: &str) -> bool {
    path.starts_with("http://") || path.starts_with("https://") || path.starts_with("rtsp://")
        || path.starts_with("rtmp://") || path.starts_with("mms://") || path.starts_with("ftp://")
}
