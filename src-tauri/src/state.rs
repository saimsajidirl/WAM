use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

/// Resolved ffmpeg/ffprobe locations + detected encoder capabilities.
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct Tools {
    pub ffmpeg: Option<PathBuf>,
    pub ffprobe: Option<PathBuf>,
    pub version: Option<String>,
    #[serde(skip)]
    pub mp3: bool,
    #[serde(skip)]
    pub opus: bool,
}

impl Tools {
    pub fn available(&self) -> bool {
        self.ffmpeg.is_some()
    }
}

pub struct Shared {
    /// media id -> source path (local path or URL)
    pub media: RwLock<HashMap<String, PathBuf>>,
    pub counter: AtomicU64,
    /// local streaming server port
    pub port: u16,
    pub tools: RwLock<Tools>,
    /// persisted frontend state file
    pub state_file: PathBuf,
    pub cache_dir: PathBuf,
}

pub type AppState = Arc<Shared>;

impl Shared {
    pub fn next_id(&self) -> String {
        format!("m{:x}", self.counter.fetch_add(1, Ordering::Relaxed))
    }

    pub fn resolve(&self, id: &str) -> Option<PathBuf> {
        self.media.read().ok()?.get(id).cloned()
    }

    /// Register a path and return its id (re-uses existing id if already registered).
    pub fn register(&self, path: PathBuf) -> String {
        let mut map = self.media.write().unwrap();
        if let Some((id, _)) = map.iter().find(|(_, p)| **p == path) {
            return id.clone();
        }
        let id = self.next_id();
        map.insert(id.clone(), path);
        id
    }
}
