import { api, audioTxUrl, transcodeUrl } from "./lib/api";
import { clamp } from "./lib/util";
import { audioGraph } from "./audio";
import type { MediaItem } from "./types";

export interface EngineHooks {
  update(patch: Partial<{ time: number; duration: number; buffered: number }>): void;
  playState(playing: boolean): void;
  loading(loading: boolean): void;
  ended(): void;
  error(message: string): void;
  durationKnown(d: number): void;
}

/**
 * Owns the single HTMLVideoElement used for both audio and video playback.
 * All transport/state changes flow through here; UI stays declarative.
 */
class Engine {
  el: HTMLVideoElement;
  hooks: EngineHooks | null = null;
  /** transcode mode: media position = base + el.currentTime */
  base = 0;
  transcoding = false;
  item: MediaItem | null = null;
  private pendingSeek: number | null = null;
  private retriedNoCors = false;
  fps = 24;

  constructor() {
    const el = document.createElement("video");
    el.className = "media-el";
    el.playsInline = true;
    el.preload = "auto";
    this.el = el;

    el.addEventListener("timeupdate", () => this.pushTime());
    el.addEventListener("progress", () => this.pushBuffered());
    el.addEventListener("loadedmetadata", () => {
      if (!this.transcoding && isFinite(el.duration)) {
        this.hooks?.durationKnown(el.duration);
      }
      if (this.pendingSeek != null) {
        const t = this.pendingSeek;
        this.pendingSeek = null;
        if (this.transcoding) {
          el.currentTime = Math.max(0, t - this.base);
        } else {
          el.currentTime = t;
        }
        this.pushTime();
      }
    });
    el.addEventListener("play", () => {
      audioGraph.resume();
      this.hooks?.playState(true);
    });
    el.addEventListener("pause", () => this.hooks?.playState(false));
    el.addEventListener("ended", () => this.hooks?.ended());
    el.addEventListener("waiting", () => this.hooks?.loading(true));
    el.addEventListener("playing", () => this.hooks?.loading(false));
    el.addEventListener("canplay", () => this.hooks?.loading(false));
    el.addEventListener("error", () => {
      const code = el.error?.code;
      // Retry remote URLs without CORS (tainted but playable)
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && !this.retriedNoCors && this.item?.remote) {
        this.retriedNoCors = true;
        el.crossOrigin = null;
        el.src = this.item.src;
        el.play().catch(() => {});
        return;
      }
      const msg =
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "Format not supported. Install ffmpeg to play all formats."
          : code === MediaError.MEDIA_ERR_NETWORK
            ? "Network error while loading media."
            : code === MediaError.MEDIA_ERR_DECODE
              ? "Failed to decode media."
              : "Failed to load media.";
      this.hooks?.error(msg);
    });
    el.addEventListener("ratechange", () => {});
  }

  mount(container: HTMLElement) {
    if (this.el.parentElement !== container) container.appendChild(this.el);
  }

  get time(): number {
    return this.transcoding ? this.base + this.el.currentTime : this.el.currentTime;
  }

  private pushTime() {
    this.hooks?.update({ time: this.time });
  }

  private pushBuffered() {
    try {
      const tb = this.el.buffered;
      let end = 0;
      for (let i = 0; i < tb.length; i++) {
        if (tb.start(i) <= this.el.currentTime && this.el.currentTime <= tb.end(i)) {
          end = tb.end(i);
          break;
        }
        end = Math.max(end, tb.end(i));
      }
      this.hooks?.update({ buffered: this.transcoding ? this.base + end : end });
    } catch { /* noop */ }
  }

  async load(item: MediaItem, opts: { startAt?: number; audioTrack?: number; videoTrack?: number } = {}) {
    this.item = item;
    this.retriedNoCors = false;
    this.pendingSeek = opts.startAt ?? null;
    this.base = opts.startAt ?? 0;
    this.hooks?.loading(true);

    let src = item.src;
    if (!item.native && !item.remote) {
      // needs transcode
      this.transcoding = true;
      const start = opts.startAt ?? 0;
      if (item.kind === "audio") {
        src = await audioTxUrl(item.id, start, opts.audioTrack ?? 0);
      } else {
        src = await transcodeUrl(item.id, {
          start,
          audioTrack: opts.audioTrack,
          videoTrack: opts.videoTrack,
        });
      }
    } else {
      this.transcoding = false;
    }

    const el = this.el;
    // CORS: local stream server always sends ACAO:* — required for Web Audio.
    // Remote servers may not; retry without CORS on failure.
    el.crossOrigin = item.remote ? null : "anonymous";
    el.src = src;
    el.load();
    el.play().catch(() => {});
  }

  async reloadForTrack(at: number, vt?: number) {
    if (!this.item) return;
    const t = this.time;
    await this.load(this.item, { startAt: t, audioTrack: at, videoTrack: vt });
  }

  play() {
    audioGraph.resume();
    this.el.play().catch(() => {});
  }

  pause() {
    this.el.pause();
  }

  toggle() {
    if (this.el.paused) this.play();
    else this.el.pause();
  }

  stop() {
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    this.base = 0;
    this.transcoding = false;
    this.item = null;
  }

  async seekTo(t: number, duration = Infinity) {
    t = clamp(t, 0, duration);
    if (this.transcoding && this.item) {
      // restart transcode at new position
      const it = this.item;
      const startUrl = it.kind === "audio"
        ? await audioTxUrl(it.id, t, currentAudioTrack)
        : await transcodeUrl(it.id, { start: t, audioTrack: currentAudioTrack, videoTrack: currentVideoTrack });
      this.base = t;
      this.el.src = startUrl;
      this.el.load();
      this.el.play().catch(() => {});
      this.hooks?.update({ time: t });
      return;
    }
    this.el.currentTime = t;
    this.pushTime();
  }

  seekBy(d: number, duration = Infinity): Promise<void> {
    return this.seekTo(this.time + d, duration);
  }

  setRate(r: number) {
    this.el.playbackRate = clamp(r, 0.0625, 16);
    this.el.preservesPitch = this.el.playbackRate <= 4;
  }

  /** volume 0..1 through element; >1 via Web Audio boost */
  setVolume(v: number) {
    v = clamp(v, 0, 3);
    this.el.muted = false;
    this.el.volume = Math.min(1, v);
    audioGraph.setBoost(Math.max(1, v));
  }

  setMuted(m: boolean) {
    this.el.muted = m;
  }

  frameStep(dir: 1 | -1) {
    if (this.transcoding) return;
    this.el.pause();
    const dt = dir / this.fps;
    this.el.currentTime = clamp(this.el.currentTime + dt, 0, this.el.duration || Infinity);
    this.pushTime();
  }

  snapshot(): string | null {
    const el = this.el;
    if (!el.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = el.videoWidth;
    c.height = el.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(el, 0, 0);
      return c.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  async pip(): Promise<boolean> {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return false;
      }
      await this.el.requestPictureInPicture();
      return true;
    } catch {
      return false;
    }
  }
}

let currentAudioTrack = 0;
let currentVideoTrack: number | undefined;
export function setCurrentTracks(at: number, vt?: number) {
  currentAudioTrack = at;
  currentVideoTrack = vt;
}

export const engine = new Engine();
