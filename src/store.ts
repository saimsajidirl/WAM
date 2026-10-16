import { create } from "zustand";
import { engine, setCurrentTracks } from "./engine";
import { audioGraph } from "./audio";
import { api, coverUrl, isTauri } from "./lib/api";
import { parseSubtitles } from "./lib/subtitles";
import { ASPECTS, EQ_PRESETS, RATE_STEPS } from "./lib/presets";
import {
  clamp, debounce, ext, fmtTime, nextUid, stripExt, SUB_EXTS,
} from "./lib/util";
import type {
  AudioTrack, Bookmark, Chapter, EqState, FfmpegStatus, HistoryEntry,
  MediaInfo, MediaItem, PanelId, PlayStatus, RepeatMode, Settings,
  SubCue, SubStyle, SubTrack, VideoFilter,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  accent: "#000000",
  resumePlayback: true,
  autoplay: true,
  volumeStep: 5,
  seekShort: 10,
  seekLong: 60,
  hardwareAccel: true,
  ffmpegPath: "",
  autoLoadSubs: true,
  showMilli: false,
  uiScale: 1,
};

const DEFAULT_SUBSTYLE: SubStyle = {
  size: 30, color: "#ffffff", bg: "rgba(0,0,0,0.55)",
  outline: true, bottom: 76, bold: false,
};

const DEFAULT_VF: VideoFilter = {
  brightness: 1, contrast: 1, saturate: 1, hue: 0,
  zoom: 1, rotation: 0, aspect: "auto",
};

const DEFAULT_EQ: EqState = {
  enabled: false, preamp: 0, bands: new Array(10).fill(0), preset: "Flat",
};

interface Toast { id: string; text: string; kind: "info" | "error" | "ok" }

interface PlayerStore {
  // transport
  status: PlayStatus;
  error: string | null;
  loading: boolean;
  current: MediaItem | null;
  time: number;
  duration: number;
  buffered: number;
  volume: number; // 0..3
  muted: boolean;
  rate: number;
  transcoding: boolean;
  abLoop: { a: number | null; b: number | null };
  audioDelay: number; // ms
  fps: number;

  // queue
  queue: MediaItem[];
  order: number[];
  cursor: number;
  shuffle: boolean;
  repeat: RepeatMode;

  // tracks
  subTracks: SubTrack[];
  activeSub: string | null;
  subDelay: number; // ms
  subStyle: SubStyle;
  subCues: SubCue[];
  audioTracks: AudioTrack[];
  activeAudioTrack: number;
  videoTrackCount: number;
  activeVideoTrack: number;
  chapters: Chapter[];
  mediaInfo: MediaInfo | null;

  // audio
  eq: EqState;
  normalization: boolean;
  coverUrl: string | null;
  waveform: number[] | null;

  // video
  vf: VideoFilter;

  // ui
  panel: PanelId;
  theme: "dark" | "light" | "system";
  accent: string;
  uiScale: number;
  compact: boolean;
  fullscreen: boolean;
  alwaysOnTop: boolean;
  showHelp: boolean;
  showUrlDialog: boolean;
  showConvert: boolean;
  controlsVisible: boolean;
  toasts: Toast[];
  sleepTimer: number | null; // epoch ms
  sleepLabel: string | null;

  // meta
  settings: Settings;
  history: HistoryEntry[];
  positions: Record<string, { pos: number; dur: number }>;
  bookmarks: Bookmark[];
  ffmpeg: FfmpegStatus;

  // actions
  init(): Promise<void>;
  playItems(items: MediaItem[], startIndex?: number): Promise<void>;
  enqueue(items: MediaItem[]): void;
  playItem(item: MediaItem): Promise<void>;
  playAt(queueIndex: number): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  toggle(): void;
  stop(): void;
  seekTo(t: number): void;
  seekBy(d: number): void;
  setRate(r: number): void;
  rateStep(dir: 1 | -1): void;
  setVolume(v: number): void;
  volumeBy(d: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  cycleAspect(): void;
  frameStep(dir: 1 | -1): void;
  setLoopPoint(): void;
  clearLoop(): void;
  setSubDelay(ms: number): void;
  setAudioDelay(ms: number): void;

  setActiveSub(id: string | null): Promise<void>;
  addExternalSubtitle(path: string): Promise<void>;
  setAudioTrack(i: number): Promise<void>;
  setVideoTrack(i: number): Promise<void>;
  setEq(patch: Partial<EqState>): void;
  applyEqPreset(name: string): void;
  setNormalization(on: boolean): void;

  openFiles(): Promise<void>;
  openFolder(): Promise<void>;
  openUrl(url: string): Promise<void>;
  addExternalSubDialog(): Promise<void>;

  removeFromQueue(i: number): void;
  clearQueue(): void;
  moveInQueue(from: number, to: number): void;
  playHistoryEntry(e: HistoryEntry): Promise<void>;
  clearHistory(): void;

  setPanel(p: PanelId): void;
  setTheme(t: Settings["theme"]): void;
  setAccent(a: string): void;
  setUiScale(s: number): void;
  setCompact(on: boolean): void;
  setAlwaysOnTop(on: boolean): void;
  toggleHelp(): void;
  setUrlDialog(on: boolean): void;
  setConvertDialog(on: boolean): void;
  setControlsVisible(v: boolean): void;
  toast(text: string, kind?: Toast["kind"]): void;
  dismissToast(id: string): void;
  setVf(patch: Partial<VideoFilter>): void;
  resetVf(): void;
  setSubStyle(patch: Partial<SubStyle>): void;
  updateSettings(patch: Partial<Settings>): void;
  setFfmpegPath(path: string | null): Promise<void>;
  convert(preset: string, output: string): Promise<void>;
  snapshot(): Promise<void>;
  togglePip(): Promise<void>;
  setSleepTimer(minutes: number | "eof" | null): void;
  addBookmark(): void;
  removeBookmark(b: Bookmark): void;
  gotoBookmark(b: Bookmark): Promise<void>;
  markSaved(): void;
}

const persist = debounce(() => {
  const s = usePlayer.getState();
  if (!isTauri) return;
  api.saveState({
    settings: s.settings,
    volume: s.volume,
    rate: s.rate,
    eq: s.eq,
    normalization: s.normalization,
    subStyle: s.subStyle,
    vf: s.vf,
    positions: s.positions,
    history: s.history.slice(0, 300),
    bookmarks: s.bookmarks,
    queuePaths: s.queue.filter((q) => !q.remote).map((q) => q.path),
    repeat: s.repeat,
    shuffle: s.shuffle,
    audioDelay: s.audioDelay,
    subDelay: s.subDelay,
  }).catch(() => {});
}, 800);

function reorder(queue: MediaItem[], shuffled: boolean, currentPath?: string): { order: number[]; cursor: number } {
  const order = queue.map((_, i) => i);
  if (shuffled && queue.length > 1) {
    const curIdx = currentPath != null ? queue.findIndex((q) => q.path === currentPath) : -1;
    const rest = order.filter((i) => i !== curIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const ord = curIdx >= 0 ? [curIdx, ...rest] : rest;
    return { order: ord, cursor: 0 };
  }
  const cursor = currentPath != null ? Math.max(0, queue.findIndex((q) => q.path === currentPath)) : 0;
  return { order, cursor };
}

export const usePlayer = create<PlayerStore>()((set, get) => ({
  status: "idle",
  error: null,
  loading: false,
  current: null,
  time: 0,
  duration: 0,
  buffered: 0,
  volume: 0.8,
  muted: false,
  rate: 1,
  transcoding: false,
  abLoop: { a: null, b: null },
  audioDelay: 0,
  fps: 24,

  queue: [],
  order: [],
  cursor: 0,
  shuffle: false,
  repeat: "off",

  subTracks: [],
  activeSub: null,
  subDelay: 0,
  subStyle: DEFAULT_SUBSTYLE,
  subCues: [],
  audioTracks: [],
  activeAudioTrack: 0,
  videoTrackCount: 0,
  activeVideoTrack: 0,
  chapters: [],
  mediaInfo: null,

  eq: DEFAULT_EQ,
  normalization: false,
  coverUrl: null,
  waveform: null,

  vf: DEFAULT_VF,

  panel: "none",
  theme: "light",
  accent: DEFAULT_SETTINGS.accent,
  uiScale: 1,
  compact: false,
  fullscreen: false,
  alwaysOnTop: false,
  showHelp: false,
  showUrlDialog: false,
  showConvert: false,
  controlsVisible: true,
  toasts: [],
  sleepTimer: null,
  sleepLabel: null,

  settings: DEFAULT_SETTINGS,
  history: [],
  positions: {},
  bookmarks: [],
  ffmpeg: { available: false },

  async init() {
    engine.hooks = {
      update: (p) => set(p),
      playState: (playing) => {
        const s = get();
        if (playing && s.status !== "playing") set({ status: "playing", error: null });
        if (!playing && s.status === "playing") set({ status: "paused" });
      },
      loading: (l) => set({ loading: l }),
      ended: () => {
        const s = get();
        set({ status: "ended" });
        if (s.sleepLabel === "End of track") {
          engine.pause();
          return;
        }
        void s.next();
      },
      error: (msg) => set({ status: "error", error: msg, loading: false }),
      durationKnown: (d) => set({ duration: d }),
    };

    try {
      if (isTauri) {
        const [saved, ff] = await Promise.all([
          api.loadState().catch(() => null),
          api.ffmpegStatus().catch(() => ({ available: false }) as FfmpegStatus),
        ]);
        set({ ffmpeg: ff });
        if (saved) {
          const settings = { ...DEFAULT_SETTINGS, ...(saved.settings as Partial<Settings> | undefined) };
          if (settings.accent === "#8b5cf6" || settings.accent === "mono") settings.accent = "#000000"; // migrate old defaults
          const eq = { ...DEFAULT_EQ, ...(saved.eq as Partial<EqState> | undefined) };
          const subStyle = { ...DEFAULT_SUBSTYLE, ...(saved.subStyle as Partial<SubStyle> | undefined) };
          const vf = { ...DEFAULT_VF, ...(saved.vf as Partial<VideoFilter> | undefined) };
          set({
            settings,
            theme: settings.theme,
            accent: settings.accent,
            uiScale: settings.uiScale ?? 1,
            eq,
            normalization: !!saved.normalization,
            subStyle,
            vf,
            volume: typeof saved.volume === "number" ? saved.volume : 0.8,
            rate: typeof saved.rate === "number" ? saved.rate : 1,
            positions: (saved.positions as PlayerStore["positions"]) || {},
            history: (saved.history as HistoryEntry[]) || [],
            bookmarks: (saved.bookmarks as Bookmark[]) || [],
            repeat: (saved.repeat as RepeatMode) || "off",
            shuffle: !!saved.shuffle,
            audioDelay: typeof saved.audioDelay === "number" ? saved.audioDelay : 0,
            subDelay: typeof saved.subDelay === "number" ? saved.subDelay : 0,
          });
          audioGraph.applyEq({ ...eq, enabled: eq.enabled });
          audioGraph.setNormalization(!!saved.normalization);
          // restore queue
          const paths = (saved.queuePaths as string[]) || [];
          if (paths.length) {
            try {
              const items = await api.registerPaths(paths);
              const playable = items.filter((i) => i.kind === "video" || i.kind === "audio");
              const { order, cursor } = reorder(playable, !!saved.shuffle);
              set({ queue: playable, order, cursor });
            } catch { /* ignore */ }
          }
        }
      }
    } finally {
      engine.setVolume(get().volume);
      engine.setRate(get().rate);
      audioGraph.setAudioDelay(get().audioDelay);
      persist();
    }
  },

  async playItems(items, startIndex = 0) {
    const playable = items.filter((i) => i.kind === "video" || i.kind === "audio");
    if (!playable.length) return;
    const idx = clamp(startIndex, 0, playable.length - 1);
    const { order, cursor } = reorder(playable, get().shuffle, playable[idx].path);
    set({ queue: playable, order, cursor });
    await get().playAt(order[cursor]);
  },

  enqueue(items) {
    const playable = items.filter((i) => i.kind === "video" || i.kind === "audio");
    if (!playable.length) return;
    const s = get();
    const queue = [...s.queue, ...playable];
    const order = s.order.concat(playable.map((_, i) => s.queue.length + i));
    if (s.shuffle) {
      // shuffle only the appended tail after current cursor
      const before = order.slice(0, s.cursor + 1);
      const after = order.slice(s.cursor + 1);
      for (let i = after.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [after[i], after[j]] = [after[j], after[i]];
      }
      set({ queue, order: before.concat(after) });
    } else {
      set({ queue, order });
    }
    persist();
  },

  async playItem(item) {
    await get().playItems([item], 0);
  },

  async playAt(queueIndex) {
    const s = get();
    const item = s.queue[queueIndex];
    if (!item) return;
    const cursor = Math.max(0, s.order.indexOf(queueIndex));
    set({
      cursor,
      status: "loading",
      error: null,
      current: item,
      time: 0,
      buffered: 0,
      duration: 0,
      abLoop: { a: null, b: null },
      subTracks: [],
      activeSub: null,
      subCues: [],
      audioTracks: [],
      activeAudioTrack: 0,
      activeVideoTrack: 0,
      videoTrackCount: 0,
      chapters: [],
      mediaInfo: null,
      coverUrl: null,
      waveform: null,
      transcoding: !item.native && !item.remote,
    });
    setCurrentTracks(0, undefined);

    // resume position
    let startAt = 0;
    const saved = s.positions[item.path];
    if (s.settings.resumePlayback && saved && saved.pos > 2 && saved.pos < saved.dur - 8) {
      startAt = saved.pos;
    }

    // history
    set({
      history: [
        { path: item.path, name: item.name, kind: item.kind, at: Date.now() },
        ...get().history.filter((h) => h.path !== item.path),
      ].slice(0, 300),
    });
    persist();

    // probe for tracks/chapters/duration when ffprobe exists (background)
    if (get().ffmpeg.available && !item.remote) {
      api.mediaInfo(item.id).then((info) => {
        if (get().current?.id !== item.id) return;
        const st = info.streams || [];
        const audios: AudioTrack[] = st
          .filter((x) => x.codec_type === "audio")
          .map((x, i) => ({
            index: i,
            streamIndex: x.index,
            label:
              x.tags?.title ||
              x.tags?.language?.toUpperCase() ||
              `${x.codec_name || "Audio"} ${x.channels ? x.channels + "ch" : ""}`.trim(),
            lang: x.tags?.language,
            channels: x.channels,
            codec: x.codec_name,
          }));
        const subs: SubTrack[] = st
          .filter((x) => x.codec_type === "subtitle")
          .map((x, i) => ({
            id: `emb${x.index}`,
            label:
              x.tags?.title ||
              x.tags?.language?.toUpperCase() ||
              `Subtitle ${i + 1} (${x.codec_name || "?"})`,
            lang: x.tags?.language,
            source: "embedded" as const,
            streamIndex: x.index,
            unsupported: !!x.codec_name && /hdmv|pgb|pgs|vobsub|dvd_sub|dvb_sub|xsub/i.test(x.codec_name),
          }));
        const vids = st.filter((x) => x.codec_type === "video" && x.disposition?.attached_pic !== 1);
        const chapters: Chapter[] = (info.chapters || []).map((c, i) => ({
          title: c.tags?.title || `Chapter ${i + 1}`,
          start: parseFloat(c.start_time || "0"),
          end: parseFloat(c.end_time || "0"),
        }));
        const fps = parseFloat((vids[0]?.r_frame_rate || "24/1").split("/")[0]) /
          (parseFloat((vids[0]?.r_frame_rate || "24/1").split("/")[1]) || 1);
        const dur = parseFloat(info.format?.duration || "0");
        set({
          audioTracks: audios,
          subTracks: subs,
          chapters,
          mediaInfo: info,
          videoTrackCount: vids.length || 1,
          fps: isFinite(fps) && fps > 0 ? fps : 24,
        });
        if (dur > 0 && get().transcoding) set({ duration: dur });
        engine.fps = isFinite(fps) && fps > 0 ? fps : 24;
      }).catch(() => {});
    }

    // cover art + waveform for audio
    if (item.kind === "audio" && get().ffmpeg.available && !item.remote) {
      set({ coverUrl: await coverUrl(item.id) });
      api.waveform(item.id).then((w) => {
        if (get().current?.id === item.id) set({ waveform: w });
      }).catch(() => {});
    }

    await engine.load(item, { startAt: startAt || undefined });
    engine.setVolume(get().volume);
    engine.setRate(get().rate);
    if (!get().settings.autoplay) engine.pause();

    // auto-load external subs next to the file
    if (get().settings.autoLoadSubs && !item.remote) {
      const base = stripExt(item.path);
      for (const e of ["srt", "vtt", "ass"]) {
        try {
          const text = await api.readTextFile(`${base}.${e}`);
          if (text && get().current?.id === item.id) {
            const cues = parseSubtitles(text, `x.${e}`);
            const tr: SubTrack = {
              id: nextUid("ext"),
              label: `${e.toUpperCase()} (external)`,
              source: "external",
              cues,
            };
            set({ subTracks: [...get().subTracks, tr] });
            if (!get().activeSub) void get().setActiveSub(tr.id);
          }
          break;
        } catch { /* keep trying next ext */ }
      }
    }
  },

  async next() {
    const s = get();
    if (!s.queue.length) return;
    if (s.repeat === "one") {
      engine.seekTo(0);
      engine.play();
      return;
    }
    let cursor = s.cursor + 1;
    if (cursor >= s.order.length) {
      if (s.repeat === "all") cursor = 0;
      else {
        set({ status: "ended" });
        return;
      }
    }
    set({ cursor });
    await s.playAt(s.order[cursor]);
  },

  async prev() {
    const s = get();
    if (s.time > 4 || s.cursor <= 0) {
      s.seekTo(0);
      return;
    }
    const cursor = s.cursor - 1;
    set({ cursor });
    await s.playAt(s.order[cursor]);
  },

  toggle() { engine.toggle(); },
  stop() {
    engine.stop();
    set({ status: "idle", current: null, time: 0, duration: 0, buffered: 0, transcoding: false });
    persist();
  },
  seekTo(t) {
    engine.seekTo(t, get().duration || Infinity).catch(() => {});
    const s = get();
    if (s.current && !s.current.remote) {
      const pos = { pos: t, dur: s.duration };
      set({ positions: { ...s.positions, [s.current.path]: pos } });
      persist();
    }
  },
  seekBy(d) {
    engine.seekBy(d, get().duration || Infinity).catch(() => {});
  },
  setRate(r) {
    engine.setRate(r);
    set({ rate: engine.el.playbackRate });
    persist();
  },
  rateStep(dir) {
    const r = get().rate;
    const steps = RATE_STEPS;
    let next = dir > 0
      ? steps.find((x) => x > r + 0.001) ?? Math.min(16, r * 2)
      : [...steps].reverse().find((x) => x < r - 0.001) ?? Math.max(0.0625, r / 2);
    get().setRate(next);
    get().toast(`Speed ${next}x`);
  },
  setVolume(v) {
    v = clamp(v, 0, 3);
    engine.setVolume(v);
    set({ volume: v, muted: false });
    persist();
  },
  volumeBy(d) {
    get().setVolume(get().volume + d);
  },
  toggleMute() {
    const m = !get().muted;
    engine.setMuted(m);
    set({ muted: m });
  },
  toggleShuffle() {
    const s = get();
    const shuffled = !s.shuffle;
    const { order, cursor } = reorder(s.queue, shuffled, s.current?.path);
    set({ shuffle: shuffled, order, cursor });
    get().toast(shuffled ? "Shuffle on" : "Shuffle off");
    persist();
  },
  cycleRepeat() {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const next = modes[(modes.indexOf(get().repeat) + 1) % modes.length];
    set({ repeat: next });
    get().toast(`Repeat: ${next === "off" ? "off" : next === "all" ? "all" : "one"}`);
    persist();
  },
  cycleAspect() {
    const cur = ASPECTS.indexOf(get().vf.aspect);
    const next = ASPECTS[(cur + 1) % ASPECTS.length];
    set({ vf: { ...get().vf, aspect: next } });
    get().toast(`Aspect: ${next}`);
    persist();
  },
  frameStep(dir) {
    engine.frameStep(dir);
    get().toast(dir > 0 ? "Frame +" : "Frame −");
  },
  setLoopPoint() {
    const { abLoop, time } = get();
    if (abLoop.a == null) {
      set({ abLoop: { a: time, b: null } });
      get().toast(`A-B loop: A = ${fmtTime(time)}`);
    } else if (abLoop.b == null) {
      const b = Math.max(time, abLoop.a + 0.1);
      set({ abLoop: { a: abLoop.a, b } });
      get().toast(`A-B loop: ${fmtTime(abLoop.a)} → ${fmtTime(b)}`);
    } else {
      set({ abLoop: { a: null, b: null } });
      get().toast("A-B loop cleared");
    }
  },
  clearLoop() { set({ abLoop: { a: null, b: null } }); },
  setSubDelay(ms) { set({ subDelay: ms }); persist(); },
  setAudioDelay(ms) {
    set({ audioDelay: ms });
    audioGraph.setAudioDelay(ms);
    persist();
  },

  async setActiveSub(id) {
    set({ activeSub: id });
    if (!id) {
      set({ subCues: [] });
      return;
    }
    const tr = get().subTracks.find((t) => t.id === id);
    if (!tr) return;
    if (tr.cues) {
      set({ subCues: tr.cues });
      return;
    }
    if (tr.source === "embedded" && tr.streamIndex != null && get().current) {
      set({
        subTracks: get().subTracks.map((t) => (t.id === id ? { ...t, loading: true } : t)),
      });
      try {
        const text = await api.extractSubtitle(get().current!.id, tr.streamIndex);
        const cues = parseSubtitles(text, "x.srt");
        set({
          subTracks: get().subTracks.map((t) => (t.id === id ? { ...t, loading: false, cues } : t)),
          subCues: cues,
        });
      } catch {
        set({
          subTracks: get().subTracks.map((t) => (t.id === id ? { ...t, loading: false, unsupported: true } : t)),
          subCues: [],
        });
        get().toast("Could not decode this subtitle format", "error");
      }
    }
  },

  async addExternalSubtitle(path) {
    if (!SUB_EXTS.has(ext(path))) {
      get().toast("Not a subtitle file", "error");
      return;
    }
    try {
      const text = await api.readTextFile(path);
      const cues = parseSubtitles(text, path);
      const tr: SubTrack = {
        id: nextUid("ext"),
        label: path.split(/[\\/]/).pop() || path,
        source: "external",
        cues,
      };
      set({ subTracks: [...get().subTracks.filter((t) => t.label !== tr.label), tr] });
      await get().setActiveSub(tr.id);
      get().toast(`Loaded ${tr.label}`);
    } catch (e) {
      get().toast(`Failed to load subtitle: ${e}`, "error");
    }
  },

  async setAudioTrack(i) {
    const s = get();
    set({ activeAudioTrack: i });
    setCurrentTracks(i, s.activeVideoTrack);
    if (s.current && s.transcoding) {
      await engine.reloadForTrack(i, s.activeVideoTrack);
    } else {
      const tracks = (engine.el as unknown as { audioTracks?: { length: number; [k: number]: { enabled: boolean } } }).audioTracks;
      if (tracks && tracks.length > 1) {
        for (let k = 0; k < tracks.length; k++) tracks[k].enabled = k === i;
      }
    }
    get().toast(`Audio track ${i + 1}`);
  },

  async setVideoTrack(i) {
    const s = get();
    set({ activeVideoTrack: i });
    setCurrentTracks(s.activeAudioTrack, i);
    if (s.current && s.transcoding) {
      await engine.reloadForTrack(s.activeAudioTrack, i);
    }
  },

  setEq(patch) {
    const eq = { ...get().eq, ...patch };
    set({ eq });
    audioGraph.applyEq(eq);
    persist();
  },
  applyEqPreset(name) {
    const p = EQ_PRESETS.find((x) => x.name === name);
    if (!p) return;
    const eq = { ...get().eq, preset: name, preamp: p.preamp, bands: [...p.bands], enabled: true };
    set({ eq });
    audioGraph.applyEq(eq);
    persist();
  },
  setNormalization(on) {
    set({ normalization: on });
    audioGraph.setNormalization(on);
    persist();
  },

  async openFiles() {
    if (!isTauri) {
      get().toast("File dialogs require the desktop app", "error");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: true,
      filters: [
        { name: "Media", extensions: ["*"] },
      ],
    });
    if (!sel) return;
    const paths = (Array.isArray(sel) ? sel : [sel]).filter(Boolean) as string[];
    if (!paths.length) return;
    try {
      const items = await api.registerPaths(paths);
      const subs = items.filter((i) => i.kind === "subtitle");
      for (const s of subs) await get().addExternalSubtitle(s.path);
      const media = items.filter((i) => i.kind === "video" || i.kind === "audio");
      if (media.length) await get().playItems(media, 0);
      else if (!subs.length) get().toast("No playable media selected", "error");
    } catch (e) {
      get().toast(`${e}`, "error");
    }
  },

  async openFolder() {
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({ directory: true });
    if (!sel || typeof sel !== "string") return;
    try {
      const items = await api.scanFolder(sel);
      if (!items.length) {
        get().toast("No media files found in folder");
        return;
      }
      await get().playItems(items, 0);
      get().toast(`Added ${items.length} files from folder`);
    } catch (e) {
      get().toast(`${e}`, "error");
    }
  },

  async openUrl(url) {
    url = url.trim();
    if (!url) return;
    if (!/^[a-z]+:\/\//i.test(url)) url = "http://" + url;
    try {
      const item = await api.registerPath(url);
      if (item.kind === "unknown") item.kind = "video";
      item.native = true; // remote handled directly by element
      await get().playItem(item);
      set({ showUrlDialog: false });
    } catch (e) {
      get().toast(`${e}`, "error");
    }
  },

  async addExternalSubDialog() {
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      filters: [{ name: "Subtitles", extensions: [...SUB_EXTS] }],
    });
    if (sel && typeof sel === "string") await get().addExternalSubtitle(sel);
  },

  removeFromQueue(i) {
    const s = get();
    const queue = s.queue.filter((_, idx) => idx !== i);
    const order = s.order
      .filter((x) => x !== i)
      .map((x) => (x > i ? x - 1 : x));
    let cursor = s.cursor;
    if (i === s.order[s.cursor]) {
      if (queue.length === 0) {
        get().stop();
        set({ queue: [], order: [], cursor: 0 });
        return;
      }
      cursor = Math.min(cursor, order.length - 1);
      set({ queue, order, cursor });
      void s.playAt(order[cursor]);
      return;
    }
    set({ queue, order, cursor });
    persist();
  },
  clearQueue() {
    get().stop();
    set({ queue: [], order: [], cursor: 0 });
    persist();
  },
  moveInQueue(from, to) {
    const s = get();
    if (from === to || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length) return;
    const queue = s.queue.slice();
    const [item] = queue.splice(from, 1);
    queue.splice(to, 0, item);
    // remap sequence order: old queue index -> new index of same item
    const order = s.order.map((qi) => queue.indexOf(s.queue[qi]));
    set({ queue, order });
    persist();
  },
  async playHistoryEntry(e) {
    try {
      const item = e.path.startsWith("http") || e.path.includes("://")
        ? await api.registerPath(e.path)
        : await api.registerPath(e.path);
      await get().playItem(item);
    } catch {
      get().toast("Could not reopen file (moved or deleted?)", "error");
    }
  },
  clearHistory() {
    set({ history: [] });
    persist();
  },

  setPanel(p) { set({ panel: p }); },
  setTheme(t) {
    set({ theme: t, settings: { ...get().settings, theme: t } });
    persist();
  },
  setAccent(a) {
    set({ accent: a, settings: { ...get().settings, accent: a } });
    persist();
  },
  setUiScale(s) {
    set({ uiScale: s, settings: { ...get().settings, uiScale: s } });
    persist();
  },
  setCompact(on) { set({ compact: on }); },
  setAlwaysOnTop(on) { set({ alwaysOnTop: on }); },
  toggleHelp() { set({ showHelp: !get().showHelp }); },
  setUrlDialog(on) { set({ showUrlDialog: on }); },
  setConvertDialog(on) { set({ showConvert: on }); },
  setControlsVisible(v) { set({ controlsVisible: v }); },
  toast(text, kind = "info") {
    const id = nextUid("t");
    set({ toasts: [...get().toasts.slice(-4), { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
  setVf(patch) { set({ vf: { ...get().vf, ...patch } }); persist(); },
  resetVf() { set({ vf: DEFAULT_VF }); persist(); },
  setSubStyle(patch) { set({ subStyle: { ...get().subStyle, ...patch } }); persist(); },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({
      settings,
      theme: settings.theme,
      accent: settings.accent,
      uiScale: settings.uiScale,
    });
    persist();
  },
  async setFfmpegPath(path) {
    try {
      const st = await api.setFfmpegPath(path);
      set({ ffmpeg: st, settings: { ...get().settings, ffmpegPath: path || "" } });
      persist();
      get().toast(st.available ? `ffmpeg found: ${st.version || "ok"}` : "ffmpeg not found at that path", st.available ? "ok" : "error");
    } catch (e) {
      get().toast(`${e}`, "error");
    }
  },

  async convert(preset, output) {
    const s = get();
    if (!s.current) return;
    try {
      await api.convertMedia(s.current.id, output, preset);
      get().toast(`Converting → ${output.split(/[\\/]/).pop()}`);
      set({ showConvert: false });
    } catch (e) {
      get().toast(`Convert failed: ${e}`, "error");
    }
  },

  async snapshot() {
    const data = engine.snapshot();
    if (!data) {
      get().toast("Nothing to capture", "error");
      return;
    }
    if (!isTauri) return;
    const { save } = await import("@tauri-apps/plugin-dialog");
    const name = (get().current?.name || "wam").replace(/\.[^.]+$/, "");
    const path = await save({
      defaultPath: `${name}-${fmtTime(get().time).replace(/:/g, "-")}.png`,
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (!path) return;
    try {
      await api.writeBinary(path, data.split(",")[1]);
      get().toast("Snapshot saved");
    } catch (e) {
      get().toast(`Save failed: ${e}`, "error");
    }
  },

  async togglePip() {
    const on = await engine.pip();
    if (!on && !document.pictureInPictureElement) {
      get().toast("Picture-in-picture not available", "error");
    }
  },

  setSleepTimer(minutes) {
    if (minutes === "eof") {
      set({ sleepTimer: null, sleepLabel: "End of track" });
      get().toast("Will pause at end of track");
      return;
    }
    if (minutes == null) {
      set({ sleepTimer: null, sleepLabel: null });
      get().toast("Sleep timer off");
      return;
    }
    const at = Date.now() + minutes * 60000;
    set({ sleepTimer: at, sleepLabel: `${minutes} min` });
    get().toast(`Sleep in ${minutes} min`);
    setTimeout(() => {
      const s = get();
      if (s.sleepTimer === at) {
        engine.pause();
        set({ sleepTimer: null, sleepLabel: null, status: "paused" });
        s.toast("Sleep timer: paused");
      }
    }, minutes * 60000 + 500);
  },

  addBookmark() {
    const s = get();
    if (!s.current || s.current.remote) return;
    const b: Bookmark = { path: s.current.path, name: s.current.name, t: s.time };
    set({ bookmarks: [...s.bookmarks, b] });
    s.toast(`Bookmark @ ${fmtTime(s.time)}`);
    persist();
  },
  removeBookmark(b) {
    set({ bookmarks: get().bookmarks.filter((x) => x !== b) });
    persist();
  },
  async gotoBookmark(b) {
    const s = get();
    if (s.current?.path !== b.path) {
      try {
        const item = await api.registerPath(b.path);
        await s.playItem(item);
        // wait briefly for metadata then seek
        setTimeout(() => engine.seekTo(b.t, get().duration || Infinity), 600);
      } catch {
        s.toast("File not found", "error");
      }
    } else {
      s.seekTo(b.t);
    }
  },
  markSaved() { persist(); },
}));

// A-B loop enforcement + position persistence on time updates
let lastPosSave = 0;
usePlayer.subscribe((s, prev) => {
  if (s.time !== prev.time) {
    const { a, b } = s.abLoop;
    if (a != null && b != null && s.time >= b) {
      engine.seekTo(a, s.duration || Infinity);
    }
    const now = Date.now();
    if (now - lastPosSave > 4000 && s.current && !s.current.remote && s.duration > 0) {
      lastPosSave = now;
      const pos = { pos: s.time, dur: s.duration };
      usePlayer.setState({
        positions: { ...s.positions, [s.current.path]: pos },
      });
      persist();
    }
  }
});
