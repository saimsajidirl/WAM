export type MediaKind = "video" | "audio" | "subtitle" | "image" | "unknown";

export interface MediaItem {
  id: string;
  path: string;
  name: string;
  kind: MediaKind;
  /** playable directly by the webview (no transcode) */
  native: boolean;
  remote: boolean;
  /** ready-to-use playback URL */
  src: string;
}

export type RepeatMode = "off" | "all" | "one";
export type PanelId = "none" | "playlist" | "settings" | "eq" | "subs" | "info";
export type PlayStatus =
  | "idle"
  | "loading"
  | "paused"
  | "playing"
  | "ended"
  | "error";

export interface SubCue {
  start: number;
  end: number;
  text: string;
}

export interface SubTrack {
  id: string;
  label: string;
  lang?: string;
  source: "embedded" | "external";
  /** ffmpeg stream index for embedded tracks */
  streamIndex?: number;
  cues?: SubCue[];
  loading?: boolean;
  unsupported?: boolean;
}

export interface AudioTrack {
  /** index among audio streams (0-based) */
  index: number;
  /** absolute stream index in the container */
  streamIndex: number;
  label: string;
  lang?: string;
  channels?: number;
  codec?: string;
}

export interface Chapter {
  title: string;
  start: number;
  end: number;
}

export interface SubStyle {
  size: number; // px
  color: string;
  bg: string; // css color / transparent
  outline: boolean;
  bottom: number; // px from bottom
  bold: boolean;
}

export interface VideoFilter {
  brightness: number; // 1 = neutral
  contrast: number;
  saturate: number;
  hue: number; // deg
  zoom: number; // 1 = no zoom
  rotation: 0 | 90 | 180 | 270;
  aspect: "auto" | "16:9" | "4:3" | "2.35:1" | "1:1" | "fill";
}

export interface EqState {
  enabled: boolean;
  preamp: number; // dB
  bands: number[]; // 10 x dB
  preset: string;
}

export interface Settings {
  theme: "dark" | "light" | "system";
  accent: string;
  resumePlayback: boolean;
  autoplay: boolean;
  volumeStep: number;
  seekShort: number;
  seekLong: number;
  hardwareAccel: boolean;
  ffmpegPath: string;
  autoLoadSubs: boolean;
  showMilli: boolean;
  uiScale: number;
}

export interface HistoryEntry {
  path: string;
  name: string;
  kind: MediaKind;
  at: number; // epoch ms
}

export interface Bookmark {
  path: string;
  name: string;
  t: number;
}

export interface FfprobeStream {
  index: number;
  codec_name?: string;
  codec_type?: string;
  width?: number;
  height?: number;
  channels?: number;
  sample_rate?: string;
  bit_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
  pix_fmt?: string;
  profile?: string;
  channel_layout?: string;
}

export interface MediaInfo {
  streams?: FfprobeStream[];
  format?: {
    filename?: string;
    format_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  chapters?: {
    id?: number;
    start_time?: string;
    end_time?: string;
    tags?: Record<string, string>;
  }[];
}

export interface FfmpegStatus {
  available: boolean;
  ffmpeg?: string;
  ffprobe?: string;
  version?: string;
  mp3Encoder?: boolean;
  opusEncoder?: boolean;
}
