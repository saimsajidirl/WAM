import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark, ChevronRight, FilePlus2, Film, FolderOpen, GripVertical,
  History, Info, Link2, ListMusic, Music2, Play, Search, Settings2,
  SlidersHorizontal, Trash2, X, Captions, Moon, Sun, MonitorSmartphone,
} from "lucide-react";
import { usePlayer } from "../store";
import { EQ_FREQS, EQ_PRESETS } from "../lib/presets";
import { basename, fmtBytes, fmtBitrate, fmtTime, stripExt } from "../lib/util";
import type { MediaItem, PanelId } from "../types";

const TABS: { id: PanelId; label: string; icon: React.ReactNode }[] = [
  { id: "playlist", label: "Playlist", icon: <ListMusic size={15} /> },
  { id: "eq", label: "Effects", icon: <SlidersHorizontal size={15} /> },
  { id: "subs", label: "Subtitles", icon: <Captions size={15} /> },
  { id: "info", label: "Info", icon: <Info size={15} /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={15} /> },
];

export function SidePanel() {
  const panel = usePlayer((s) => s.panel);
  const setPanel = usePlayer((s) => s.setPanel);
  if (panel === "none") return null;
  return (
    <aside className="side-panel">
      <div className="sp-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`sp-tab ${panel === t.id ? "active" : ""}`}
            onClick={() => setPanel(panel === t.id ? "none" : t.id)}
            title={t.label}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <button className="sp-tab sp-close" onClick={() => setPanel("none")} title="Close">
          <X size={16} />
        </button>
      </div>
      <div className="sp-body">
        {panel === "playlist" && <PlaylistPanel />}
        {panel === "eq" && <EqPanel />}
        {panel === "subs" && <SubsPanel />}
        {panel === "info" && <InfoPanel />}
        {panel === "settings" && <SettingsPanel />}
      </div>
    </aside>
  );
}

/* ------------------------------- Playlist ------------------------------- */

function PlaylistPanel() {
  const queue = usePlayer((s) => s.queue);
  const cursor = usePlayer((s) => s.cursor);
  const order = usePlayer((s) => s.order);
  const current = usePlayer((s) => s.current);
  const history = usePlayer((s) => s.history);
  const bookmarks = usePlayer((s) => s.bookmarks);
  const [tab, setTab] = useState<"queue" | "history" | "bookmarks">("queue");
  const [q, setQ] = useState("");
  const dragIdx = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return queue.map((item, i) => ({ item, i })).filter(({ item }) => !qq || item.name.toLowerCase().includes(qq));
  }, [queue, q]);

  const curQueueIdx = order[cursor];

  return (
    <div className="pl-panel">
      <div className="pl-toolbar">
        <div className="pl-search">
          <Search size={14} />
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="pl-subtabs">
        <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>Queue ({queue.length})</button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
        <button className={tab === "bookmarks" ? "active" : ""} onClick={() => setTab("bookmarks")}>Marks</button>
      </div>

      {tab === "queue" && (
        <>
          <div className="pl-actions">
            <button className="chip" onClick={() => void usePlayer.getState().openFiles()}><FilePlus2 size={13} /> Files</button>
            <button className="chip" onClick={() => void usePlayer.getState().openFolder()}><FolderOpen size={13} /> Folder</button>
            <button className="chip" onClick={() => usePlayer.getState().setUrlDialog(true)}><Link2 size={13} /> URL</button>
            <button className="chip danger" onClick={() => usePlayer.getState().clearQueue()}><Trash2 size={13} /> Clear</button>
          </div>
          <div className="pl-list">
            {filtered.map(({ item, i }) => (
              <QueueRow
                key={`${item.id}-${i}`}
                item={item}
                index={i}
                active={i === curQueueIdx}
                onDragStart={() => (dragIdx.current = i)}
                onDrop={() => {
                  if (dragIdx.current != null) usePlayer.getState().moveInQueue(dragIdx.current, i);
                  dragIdx.current = null;
                }}
              />
            ))}
            {!queue.length && (
              <div className="pl-empty">
                <ListMusic size={34} strokeWidth={1} />
                <p>Queue is empty</p>
                <p className="dim small">Open files or drag them in</p>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="pl-list">
          {history.map((h) => (
            <button key={h.path + h.at} className="pl-row" onClick={() => void usePlayer.getState().playHistoryEntry(h)}>
              <span className="pl-icon">{h.kind === "audio" ? <Music2 size={14} /> : <Film size={14} />}</span>
              <span className="pl-name">{h.name}</span>
              <span className="dim small">{new Date(h.at).toLocaleDateString()}</span>
            </button>
          ))}
          {!history.length && <div className="pl-empty"><History size={34} strokeWidth={1} /><p>No history yet</p></div>}
          {history.length > 0 && (
            <button className="chip danger center" onClick={() => usePlayer.getState().clearHistory()}>
              <Trash2 size={13} /> Clear history
            </button>
          )}
        </div>
      )}

      {tab === "bookmarks" && (
        <div className="pl-list">
          {bookmarks.map((b) => (
            <div key={b.path + b.t} className="pl-row">
              <button className="pl-bm" onClick={() => void usePlayer.getState().gotoBookmark(b)}>
                <Bookmark size={14} />
                <span className="pl-name">{b.name}</span>
                <span className="dim">{fmtTime(b.t)}</span>
              </button>
              <button className="pl-del" onClick={() => usePlayer.getState().removeBookmark(b)}><X size={13} /></button>
            </div>
          ))}
          {!bookmarks.length && <div className="pl-empty"><Bookmark size={34} strokeWidth={1} /><p>No bookmarks</p><p className="dim small">Ctrl+B while playing</p></div>}
        </div>
      )}
    </div>
  );
}

function QueueRow({ item, index, active, onDragStart, onDrop }: {
  item: MediaItem; index: number; active: boolean;
  onDragStart: () => void; onDrop: () => void;
}) {
  const pos = usePlayer((s) => s.positions[item.path]);
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`pl-row q ${active ? "active" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={() => void usePlayer.getState().playAt(index)}
    >
      <span className="pl-grip"><GripVertical size={13} /></span>
      <span className="pl-icon">{item.kind === "audio" ? <Music2 size={14} /> : item.remote ? <Link2 size={14} /> : <Film size={14} />}</span>
      <button className="pl-name" onClick={() => void usePlayer.getState().playAt(index)} title={item.path}>
        {stripExt(item.name)}
        {item.native === false && !item.remote && <span className="pl-badge" title="Played via transcode">TX</span>}
      </button>
      {pos && <span className="dim small pl-pos">{Math.round((pos.pos / pos.dur) * 100)}%</span>}
      {hover && (
        <span className="pl-hover">
          <button className="pl-del" title="Play" onClick={() => void usePlayer.getState().playAt(index)}><Play size={13} /></button>
          <button className="pl-del" title="Remove" onClick={() => usePlayer.getState().removeFromQueue(index)}><X size={13} /></button>
        </span>
      )}
    </div>
  );
}

/* -------------------------------- Effects ------------------------------- */

function Slider({ label, value, min, max, step, onChange, fmt, onReset }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string; onReset?: () => void;
}) {
  return (
    <div className="slider-row" onDoubleClick={onReset} title="Double-click to reset">
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="slider-val">{fmt ? fmt(value) : value.toFixed(2)}</span>
    </div>
  );
}

function EqPanel() {
  const eq = usePlayer((s) => s.eq);
  const setEq = usePlayer((s) => s.setEq);
  const applyEqPreset = usePlayer((s) => s.applyEqPreset);
  const vf = usePlayer((s) => s.vf);
  const setVf = usePlayer((s) => s.setVf);
  const resetVf = usePlayer((s) => s.resetVf);
  const normalization = usePlayer((s) => s.normalization);
  const setNormalization = usePlayer((s) => s.setNormalization);
  const current = usePlayer((s) => s.current);
  const [tab, setTab] = useState<"eq" | "video">("eq");

  return (
    <div className="eq-panel">
      <div className="pl-subtabs">
        <button className={tab === "eq" ? "active" : ""} onClick={() => setTab("eq")}>Audio EQ</button>
        <button className={tab === "video" ? "active" : ""} onClick={() => setTab("video")}>Video FX</button>
      </div>

      {tab === "eq" && (
        <>
          <div className="eq-head">
            <label className="toggle-row">
              <input type="checkbox" checked={eq.enabled} onChange={(e) => setEq({ enabled: e.target.checked })} />
              <span>Enable equalizer</span>
            </label>
            <select value={eq.preset} onChange={(e) => applyEqPreset(e.target.value)}>
              {EQ_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className="eq-bands">
            <div className="eq-band">
              <input type="range" min={-20} max={20} step={0.5} value={eq.preamp}
                onChange={(e) => setEq({ preamp: parseFloat(e.target.value), preset: "Custom" })}
                className="v" />
              <span>{eq.preamp.toFixed(1)}</span><span className="dim small">Pre</span>
            </div>
            {eq.bands.map((b, i) => (
              <div className="eq-band" key={i}>
                <input type="range" min={-20} max={20} step={0.5} value={b}
                  onChange={(e) => {
                    const bands = eq.bands.slice();
                    bands[i] = parseFloat(e.target.value);
                    setEq({ bands, preset: "Custom" });
                  }}
                  className="v" />
                <span>{b.toFixed(1)}</span>
                <span className="dim small">{EQ_FREQS[i] >= 1000 ? `${EQ_FREQS[i] / 1000}k` : EQ_FREQS[i]}</span>
              </div>
            ))}
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={normalization} onChange={(e) => setNormalization(e.target.checked)} />
            <span>Volume normalization (compressor)</span>
          </label>
        </>
      )}

      {tab === "video" && (
        <>
          {current?.kind !== "video" && <p className="dim small">Video filters apply during video playback.</p>}
          <Slider label="Brightness" value={vf.brightness} min={0} max={3} step={0.01}
            onChange={(v) => setVf({ brightness: v })} onReset={() => setVf({ brightness: 1 })} />
          <Slider label="Contrast" value={vf.contrast} min={0} max={3} step={0.01}
            onChange={(v) => setVf({ contrast: v })} onReset={() => setVf({ contrast: 1 })} />
          <Slider label="Saturation" value={vf.saturate} min={0} max={3} step={0.01}
            onChange={(v) => setVf({ saturate: v })} onReset={() => setVf({ saturate: 1 })} />
          <Slider label="Hue" value={vf.hue} min={-180} max={180} step={1}
            onChange={(v) => setVf({ hue: v })} fmt={(v) => `${v}°`} onReset={() => setVf({ hue: 0 })} />
          <Slider label="Zoom" value={vf.zoom} min={0.5} max={4} step={0.01}
            onChange={(v) => setVf({ zoom: v })} fmt={(v) => `${v.toFixed(2)}x`} onReset={() => setVf({ zoom: 1 })} />
          <div className="vrow">
            <span className="slider-label">Rotation</span>
            <div className="chip-row">
              {[0, 90, 180, 270].map((r) => (
                <button key={r} className={`chip ${vf.rotation === r ? "sel" : ""}`}
                  onClick={() => setVf({ rotation: r as 0 | 90 | 180 | 270 })}>{r}°</button>
              ))}
            </div>
          </div>
          <div className="vrow">
            <span className="slider-label">Aspect</span>
            <div className="chip-row">
              {(["auto", "16:9", "4:3", "2.35:1", "1:1", "fill"] as const).map((a) => (
                <button key={a} className={`chip ${vf.aspect === a ? "sel" : ""}`} onClick={() => setVf({ aspect: a })}>{a}</button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={resetVf}>Reset all</button>
        </>
      )}
    </div>
  );
}

/* ------------------------------- Subtitles ------------------------------ */

function SubsPanel() {
  const subTracks = usePlayer((s) => s.subTracks);
  const activeSub = usePlayer((s) => s.activeSub);
  const subStyle = usePlayer((s) => s.subStyle);
  const setSubStyle = usePlayer((s) => s.setSubStyle);
  const subDelay = usePlayer((s) => s.subDelay);
  const setSubDelay = usePlayer((s) => s.setSubDelay);

  return (
    <div className="subs-panel">
      <div className="menu-title">Track</div>
      <button className={`pl-row ${!activeSub ? "active" : ""}`} onClick={() => void usePlayer.getState().setActiveSub(null)}>
        <span className="pl-name">Off</span>
      </button>
      {subTracks.map((t) => (
        <button key={t.id} className={`pl-row ${t.id === activeSub ? "active" : ""}`}
          onClick={() => void usePlayer.getState().setActiveSub(t.id)} disabled={t.unsupported}>
          <span className="pl-name">{t.label}{t.unsupported ? " (unsupported)" : ""}</span>
        </button>
      ))}
      <button className="chip" onClick={() => void usePlayer.getState().addExternalSubDialog()}>
        <FilePlus2 size={13} /> Load subtitle file
      </button>

      <div className="menu-title" style={{ marginTop: 16 }}>Sync</div>
      <Slider label="Delay" value={subDelay} min={-5000} max={5000} step={50}
        onChange={setSubDelay} fmt={(v) => `${v} ms`} onReset={() => setSubDelay(0)} />

      <div className="menu-title" style={{ marginTop: 16 }}>Style</div>
      <Slider label="Size" value={subStyle.size} min={12} max={80} step={1}
        onChange={(v) => setSubStyle({ size: v })} fmt={(v) => `${v}px`} onReset={() => setSubStyle({ size: 30 })} />
      <Slider label="Position" value={subStyle.bottom} min={10} max={300} step={1}
        onChange={(v) => setSubStyle({ bottom: v })} fmt={(v) => `${v}px`} onReset={() => setSubStyle({ bottom: 76 })} />
      <div className="vrow">
        <span className="slider-label">Color</span>
        <div className="chip-row">
          {["#ffffff", "#ffe66d", "#9be26d", "#7dd7ff", "#ff9d9d"].map((c) => (
            <button key={c} className={`color-dot ${subStyle.color === c ? "sel" : ""}`}
              style={{ background: c }} onClick={() => setSubStyle({ color: c })} />
          ))}
          <input type="color" value={subStyle.color} onChange={(e) => setSubStyle({ color: e.target.value })} className="color-input" />
        </div>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={subStyle.bold} onChange={(e) => setSubStyle({ bold: e.target.checked })} />
        <span>Bold</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={subStyle.outline} onChange={(e) => setSubStyle({ outline: e.target.checked })} />
        <span>Outline</span>
      </label>
      <div className="vrow">
        <span className="slider-label">Backdrop</span>
        <div className="chip-row">
          {(["rgba(0,0,0,0.55)", "rgba(0,0,0,0.85)", "transparent"] as const).map((b, i) => (
            <button key={b} className={`chip ${subStyle.bg === b ? "sel" : ""}`} onClick={() => setSubStyle({ bg: b })}>
              {["Soft", "Solid", "None"][i]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Info --------------------------------- */

function InfoPanel() {
  const current = usePlayer((s) => s.current);
  const info = usePlayer((s) => s.mediaInfo);
  const duration = usePlayer((s) => s.duration);
  const ffmpeg = usePlayer((s) => s.ffmpeg);
  const [stat, setStat] = useState<{ size: number; modified?: number } | null>(null);

  useEffect(() => {
    setStat(null);
    if (current && !current.remote) {
      import("../lib/api").then(({ api }) =>
        api.statFile(current.path).then(setStat).catch(() => {})
      );
    }
  }, [current?.id]);

  if (!current) return <div className="pl-empty"><Info size={34} strokeWidth={1} /><p>Nothing playing</p></div>;

  const f = info?.format;
  const vs = info?.streams?.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const as = info?.streams?.find((s) => s.codec_type === "audio");

  const row = (k: string, v: React.ReactNode) => (
    <div className="info-row"><span className="dim">{k}</span><span className="info-val">{v}</span></div>
  );

  return (
    <div className="info-panel">
      <div className="info-title">{current.name}</div>
      {row("Path", <span className="info-path">{current.path}</span>)}
      {row("Type", `${current.kind}${current.remote ? " (stream)" : ""}${usePlayer.getState().transcoding ? " · transcoded" : " · direct"}`)}
      {stat && row("Size", fmtBytes(stat.size))}
      {stat?.modified && row("Modified", new Date(stat.modified * 1000).toLocaleString())}
      {duration > 0 && row("Duration", fmtTime(duration, true))}
      {f?.format_name && row("Container", f.format_name)}
      {f?.bit_rate && row("Bitrate", fmtBitrate(f.bit_rate))}
      {f?.tags?.title && row("Title", f.tags.title)}
      {f?.tags?.artist && row("Artist", f.tags.artist)}
      {f?.tags?.album && row("Album", f.tags.album)}
      {f?.tags?.date && row("Date", f.tags.date)}
      {vs && (
        <>
          <div className="menu-title" style={{ marginTop: 14 }}>Video</div>
          {row("Codec", `${vs.codec_name}${vs.profile ? ` (${vs.profile})` : ""}`)}
          {vs.width && row("Resolution", `${vs.width}×${vs.height}`)}
          {vs.r_frame_rate && row("Frame rate", evalRate(vs.r_frame_rate))}
          {vs.pix_fmt && row("Pixel format", vs.pix_fmt)}
        </>
      )}
      {as && (
        <>
          <div className="menu-title" style={{ marginTop: 14 }}>Audio</div>
          {row("Codec", as.codec_name)}
          {as.sample_rate && row("Sample rate", `${as.sample_rate} Hz`)}
          {as.channels && row("Channels", `${as.channels}${as.channel_layout ? ` (${as.channel_layout})` : ""}`)}
          {as.bit_rate && row("Bitrate", fmtBitrate(as.bit_rate))}
        </>
      )}
      {!info && ffmpeg.available && <p className="dim small">Probing…</p>}
      {!ffmpeg.available && <p className="dim small">Install ffmpeg for codec details.</p>}
      <div className="pl-actions" style={{ marginTop: 14 }}>
        {!current.remote && (
          <button className="chip" onClick={() => {
            import("../lib/api").then(({ api }) => api.revealInExplorer(current.path));
          }}>Reveal in Explorer</button>
        )}
      </div>
    </div>
  );
}

function evalRate(r: string): string {
  const [a, b] = r.split("/").map(Number);
  if (!b) return r;
  return `${(a / b).toFixed(2)} fps`;
}

/* ------------------------------- Settings ------------------------------- */

const ACCENTS = ["#000000", "#ffffff", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#e879f9", "#a3e635"];

function SettingsPanel() {
  const s = usePlayer();
  const ffmpeg = usePlayer((x) => x.ffmpeg);
  const [ffPath, setFfPath] = useState(s.settings.ffmpegPath);

  return (
    <div className="settings-panel">
      <div className="menu-title">Appearance</div>
      <div className="vrow">
        <span className="slider-label">Theme</span>
        <div className="chip-row">
          {(["dark", "light", "system"] as const).map((t) => (
            <button key={t} className={`chip ${s.theme === t ? "sel" : ""}`} onClick={() => s.setTheme(t)}>
              {t === "dark" ? <Moon size={13} /> : t === "light" ? <Sun size={13} /> : <MonitorSmartphone size={13} />}
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="vrow">
        <span className="slider-label">Accent</span>
        <div className="chip-row">
          {ACCENTS.map((c) => (
            <button key={c} className={`color-dot ${s.accent === c ? "sel" : ""}`}
              style={{ background: c }} onClick={() => s.setAccent(c)} />
          ))}
          <input type="color" className="color-input" value={s.accent} onChange={(e) => s.setAccent(e.target.value)} />
        </div>
      </div>
      <Slider label="UI scale" value={s.uiScale} min={0.75} max={1.5} step={0.05}
        onChange={(v) => s.setUiScale(v)} fmt={(v) => `${Math.round(v * 100)}%`} onReset={() => s.setUiScale(1)} />

      <div className="menu-title" style={{ marginTop: 18 }}>Playback</div>
      <label className="toggle-row">
        <input type="checkbox" checked={s.settings.resumePlayback}
          onChange={(e) => s.updateSettings({ resumePlayback: e.target.checked })} />
        <span>Resume playback where you left off</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={s.settings.autoplay}
          onChange={(e) => s.updateSettings({ autoplay: e.target.checked })} />
        <span>Auto-play on open</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={s.settings.autoLoadSubs}
          onChange={(e) => s.updateSettings({ autoLoadSubs: e.target.checked })} />
        <span>Auto-load subtitles next to the file</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={s.settings.showMilli}
          onChange={(e) => s.updateSettings({ showMilli: e.target.checked })} />
        <span>Show milliseconds in time display</span>
      </label>
      <Slider label="Seek step" value={s.settings.seekShort} min={1} max={30} step={1}
        onChange={(v) => s.updateSettings({ seekShort: v })} fmt={(v) => `${v}s`} />
      <Slider label="Long seek" value={s.settings.seekLong} min={10} max={300} step={5}
        onChange={(v) => s.updateSettings({ seekLong: v })} fmt={(v) => `${v}s`} />

      <div className="menu-title" style={{ marginTop: 18 }}>Formats (ffmpeg)</div>
      <div className={`ff-status ${ffmpeg.available ? "ok" : "bad"}`}>
        {ffmpeg.available
          ? <span>✓ {ffmpeg.version || "ffmpeg detected"}</span>
          : <span>ffmpeg not found — MKV/AVI/WMA/etc need it for playback & thumbnails</span>}
      </div>
      <div className="ff-path-row">
        <input value={ffPath} placeholder="Path to ffmpeg.exe or its folder (optional)"
          onChange={(e) => setFfPath(e.target.value)} />
        <button className="btn" onClick={() => void s.setFfmpegPath(ffPath || null)}>Apply</button>
      </div>
      <p className="dim small">
        Put ffmpeg.exe + ffprobe.exe on PATH, next to WAM.exe, or set the path above.
        Get a build from gyan.dev or BtbN (GPL build recommended for full codec coverage).
      </p>

      <div className="menu-title" style={{ marginTop: 18 }}>About</div>
      <p className="dim small">WAM 0.1 — a modern player. Tauri + React + ffmpeg.</p>
    </div>
  );
}
