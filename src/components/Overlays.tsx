import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePlayer } from "../store";

export function Toasts() {
  const toasts = usePlayer((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function UrlDialog() {
  const show = usePlayer((s) => s.showUrlDialog);
  const [url, setUrl] = useState("");
  if (!show) return null;
  const go = () => void usePlayer.getState().openUrl(url);
  return (
    <div className="modal-back" onClick={() => usePlayer.getState().setUrlDialog(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Open Network Stream</span>
          <button className="tb-btn" onClick={() => usePlayer.getState().setUrlDialog(false)}><X size={16} /></button>
        </div>
        <input
          autoFocus
          className="modal-input"
          placeholder="https://example.com/stream.mp3  (http, https, rtsp…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <div className="modal-foot">
          <button className="btn" onClick={() => usePlayer.getState().setUrlDialog(false)}>Cancel</button>
          <button className="btn primary" onClick={go}>Open</button>
        </div>
      </div>
    </div>
  );
}

export function ConvertDialog() {
  const show = usePlayer((s) => s.showConvert);
  const current = usePlayer((s) => s.current);
  const ffmpeg = usePlayer((s) => s.ffmpeg);
  const [preset, setPreset] = useState("mp4");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!show) return;
    let un1: (() => void) | undefined;
    let un2: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      un1 = await listen<{ percent: number }>("convert-progress", (e) => setProgress(e.payload.percent));
      un2 = await listen<{ ok: boolean }>("convert-done", (e) => {
        setBusy(false);
        setProgress(null);
        usePlayer.getState().toast(e.payload.ok ? "Conversion finished" : "Conversion failed", e.payload.ok ? "ok" : "error");
      });
    })();
    return () => { un1?.(); un2?.(); };
  }, [show]);

  if (!show || !current) return null;
  const isAudio = current.kind === "audio";
  const presets = isAudio
    ? [["mp3", "MP3"], ["m4a", "M4A (AAC)"], ["wav", "WAV"], ["ogg", "OGG Opus"]]
    : [["mp4", "MP4 (H.264)"], ["mp4fast", "MP4 fast"], ["webm", "WebM (VP9)"], ["gif", "GIF"], ["mp3", "Audio → MP3"]];

  const start = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const name = current.name.replace(/\.[^.]+$/, "");
    const extMap: Record<string, string> = { mp4: "mp4", mp4fast: "mp4", webm: "webm", gif: "gif", mp3: "mp3", m4a: "m4a", wav: "wav", ogg: "ogg" };
    const path = await save({
      defaultPath: `${name}.${extMap[preset]}`,
      filters: [{ name: preset.toUpperCase(), extensions: [extMap[preset]] }],
    });
    if (!path) return;
    setBusy(true);
    await usePlayer.getState().convert(preset, path);
  };

  return (
    <div className="modal-back" onClick={() => !busy && usePlayer.getState().setConvertDialog(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Convert / Save</span>
          <button className="tb-btn" onClick={() => !busy && usePlayer.getState().setConvertDialog(false)}><X size={16} /></button>
        </div>
        <p className="dim small">{current.name}</p>
        {!ffmpeg.available && <p className="dim small">ffmpeg required for conversion.</p>}
        <div className="chip-row">
          {presets.map(([id, label]) => (
            <button key={id} className={`chip ${preset === id ? "sel" : ""}`} onClick={() => setPreset(id)}>{label}</button>
          ))}
        </div>
        {progress != null && (
          <div className="conv-progress"><div className="conv-fill" style={{ width: `${progress}%` }} /></div>
        )}
        <div className="modal-foot">
          <button className="btn" disabled={busy} onClick={() => usePlayer.getState().setConvertDialog(false)}>Cancel</button>
          <button className="btn primary" disabled={busy || !ffmpeg.available} onClick={() => void start()}>
            {busy ? "Converting…" : "Choose output & start"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause"],
  ["S", "Stop"],
  ["← / →", `Seek (Shift = 3s, Ctrl = 60s)`],
  ["↑ / ↓", "Volume"],
  ["M", "Mute"],
  ["N / P", "Next / previous"],
  ["F", "Fullscreen"],
  ["E / D", "Frame step forward / back"],
  ["+ - [ ]", "Playback speed"],
  ["0–9", "Seek to 0–90%"],
  ["A", "Cycle aspect ratio"],
  ["C", "A-B loop set / clear"],
  ["X", "Clear A-B loop"],
  ["B", "Cycle audio track"],
  ["V", "Cycle subtitle track"],
  ["G / H", "Subtitle delay −/+ 50ms"],
  ["J / K", "Audio delay −/+ 50ms"],
  ["R / L", "Shuffle / repeat"],
  ["T", "Snapshot"],
  ["I", "Picture-in-picture"],
  ["Q", "Compact mode"],
  ["Ctrl+O", "Open files"],
  ["Ctrl+Shift+O", "Open folder"],
  ["Ctrl+L", "Open URL"],
  ["Ctrl+B", "Bookmark"],
  ["Ctrl+T", "Always on top"],
  ["Ctrl+P/E/S/I", "Playlist / Effects / Settings / Info"],
  ["Esc", "Close panel / exit"],
];

export function HelpOverlay() {
  const show = usePlayer((s) => s.showHelp);
  if (!show) return null;
  return (
    <div className="modal-back" onClick={() => usePlayer.getState().toggleHelp()}>
      <div className="modal wide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Keyboard shortcuts</span>
          <button className="tb-btn" onClick={() => usePlayer.getState().toggleHelp()}><X size={16} /></button>
        </div>
        <div className="shortcut-grid">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="shortcut-row">
              <kbd>{k}</kbd><span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
