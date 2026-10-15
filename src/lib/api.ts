import { invoke } from "@tauri-apps/api/core";
import type {
  FfmpegStatus,
  MediaInfo,
  MediaItem,
} from "../types";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Invoke wrapper with a browser-mode stub so `vite dev` still renders the UI. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error("not running inside Tauri");
  }
  return invoke<T>(cmd, args);
}

export const api = {
  registerPath: (path: string) => call<MediaItem>("register_path", { path }),
  registerPaths: (paths: string[]) =>
    call<MediaItem[]>("register_paths", { paths }),
  scanFolder: (path: string) => call<MediaItem[]>("scan_folder", { path }),
  streamBase: async () => {
    if (!isTauri) return "http://127.0.0.1:0";
    return call<string>("stream_base");
  },
  mediaInfo: (id: string) => call<MediaInfo>("media_info", { id }),
  extractSubtitle: (id: string, streamIndex: number) =>
    call<string>("extract_subtitle", { id, streamIndex }),
  waveform: (id: string) => call<number[]>("waveform", { id }),
  readTextFile: (path: string) => call<string>("read_text_file", { path }),
  writeBinary: (path: string, b64: string) =>
    call<void>("write_binary", { path, b64 }),
  revealInExplorer: (path: string) =>
    call<void>("reveal_in_explorer", { path }),
  statFile: (path: string) =>
    call<{ size: number; modified?: number }>("stat_file", { path }),
  ffmpegStatus: () => call<FfmpegStatus>("ffmpeg_status"),
  setFfmpegPath: (path: string | null) =>
    call<FfmpegStatus>("set_ffmpeg_path", { path }),
  convertMedia: (id: string, output: string, preset: string) =>
    call<void>("convert_media", { id, output, preset }),
  loadState: () => call<Record<string, unknown> | null>("load_state"),
  saveState: (state: Record<string, unknown>) =>
    call<void>("save_state", { state }),
};

/** Transcode URL for a registered local media id. */
export async function transcodeUrl(
  id: string,
  opts: { start?: number; audioTrack?: number; videoTrack?: number } = {}
): Promise<string> {
  const base = await api.streamBase();
  const p = new URLSearchParams();
  if (opts.start && opts.start > 0) p.set("start", opts.start.toFixed(3));
  if (opts.audioTrack != null) p.set("at", String(opts.audioTrack));
  if (opts.videoTrack != null) p.set("vt", String(opts.videoTrack));
  const q = p.toString();
  return `${base}/transcode/${id}${q ? "?" + q : ""}`;
}

export async function audioTxUrl(id: string, start = 0, audioTrack = 0): Promise<string> {
  const base = await api.streamBase();
  const p = new URLSearchParams();
  if (start > 0) p.set("start", start.toFixed(3));
  if (audioTrack) p.set("at", String(audioTrack));
  const q = p.toString();
  return `${base}/audiotx/${id}${q ? "?" + q : ""}`;
}

export async function thumbUrl(id: string, t = 3): Promise<string> {
  const base = await api.streamBase();
  return `${base}/thumb/${id}?t=${t}`;
}

export async function coverUrl(id: string): Promise<string> {
  const base = await api.streamBase();
  return `${base}/cover/${id}`;
}
