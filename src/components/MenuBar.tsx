import { useEffect, useRef, useState } from "react";
import { usePlayer } from "../store";
import { toggleFullscreen } from "../hooks";
import { isTauri } from "../lib/api";

type Item = {
  label: string;
  kbd?: string;
  checked?: boolean;
  disabled?: boolean;
  action?: () => void;
} | "sep";

/** Classic menubar (File / Playback / …) — mirrors the icon controls. */
export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.status === "playing");
  const repeat = usePlayer((s) => s.repeat);
  const shuffle = usePlayer((s) => s.shuffle);
  const muted = usePlayer((s) => s.muted);
  const normalization = usePlayer((s) => s.normalization);
  const abLoop = usePlayer((s) => s.abLoop);
  const compact = usePlayer((s) => s.compact);
  const alwaysOnTop = usePlayer((s) => s.alwaysOnTop);
  const subTracks = usePlayer((s) => s.subTracks);
  const activeSub = usePlayer((s) => s.activeSub);
  const subDelay = usePlayer((s) => s.subDelay);
  const audioTracks = usePlayer((s) => s.audioTracks);
  const activeAudioTrack = usePlayer((s) => s.activeAudioTrack);
  const audioDelay = usePlayer((s) => s.audioDelay);
  const rate = usePlayer((s) => s.rate);
  const panel = usePlayer((s) => s.panel);
  const isVideo = current?.kind === "video";

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (hostRef.current && !hostRef.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [open]);

  const s = () => usePlayer.getState();
  const quit = async () => {
    if (isTauri) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      getCurrentWindow().close();
    } else {
      window.close();
    }
  };

  const menus: { id: string; label: string; items: Item[] }[] = [
    {
      id: "file",
      label: "File",
      items: [
        { label: "Open Files…", kbd: "Ctrl+O", action: () => void s().openFiles() },
        { label: "Open Folder…", kbd: "Ctrl+Shift+O", action: () => void s().openFolder() },
        { label: "Open URL…", kbd: "Ctrl+L", action: () => s().setUrlDialog(true) },
        "sep",
        { label: "Bookmark position", kbd: "Ctrl+B", disabled: !current, action: () => s().addBookmark() },
        { label: "Convert / save…", disabled: !current, action: () => s().setConvertDialog(true) },
        "sep",
        { label: "Quit", action: () => void quit() },
      ],
    },
    {
      id: "playback",
      label: "Playback",
      items: [
        { label: playing ? "Pause" : "Play", kbd: "Space", disabled: !current, action: () => s().toggle() },
        { label: "Stop", kbd: "S", disabled: !current, action: () => s().stop() },
        "sep",
        { label: "Next", kbd: "N", action: () => void s().next() },
        { label: "Previous", kbd: "P", action: () => void s().prev() },
        "sep",
        { label: `Speed up (now ${rate}x)`, kbd: "+", action: () => s().rateStep(1) },
        { label: "Speed down", kbd: "−", action: () => s().rateStep(-1) },
        "sep",
        { label: "Set A-B loop point", kbd: "C", disabled: !current, action: () => s().setLoopPoint() },
        { label: "Clear A-B loop", kbd: "X", disabled: abLoop.a == null && abLoop.b == null, action: () => s().clearLoop() },
        { label: "Frame forward", kbd: "E", disabled: !isVideo, action: () => s().frameStep(1) },
        { label: "Frame back", kbd: "D", disabled: !isVideo, action: () => s().frameStep(-1) },
        "sep",
        { label: "Snapshot", kbd: "T", disabled: !isVideo, action: () => void s().snapshot() },
        { label: "Picture in picture", kbd: "I", disabled: !isVideo, action: () => void s().togglePip() },
        "sep",
        { label: `Repeat: ${repeat}`, kbd: "L", checked: repeat !== "off", action: () => s().cycleRepeat() },
        { label: "Shuffle", kbd: "R", checked: shuffle, action: () => s().toggleShuffle() },
      ],
    },
    {
      id: "audio",
      label: "Audio",
      items: [
        ...(audioTracks.length
          ? audioTracks.map((t): Item => ({
              label: `${t.index + 1}. ${t.label}`,
              checked: t.index === activeAudioTrack,
              action: () => void s().setAudioTrack(t.index),
            }))
          : [{ label: "Single audio track", disabled: true }]),
        "sep",
        { label: `Audio delay −50 ms (now ${audioDelay})`, kbd: "J", action: () => s().setAudioDelay(audioDelay - 50) },
        { label: "Audio delay +50 ms", kbd: "K", action: () => s().setAudioDelay(audioDelay + 50) },
        "sep",
        { label: "Equalizer", kbd: "Ctrl+E", checked: panel === "eq", action: () => s().setPanel("eq") },
        { label: "Normalization", checked: normalization, action: () => s().setNormalization(!normalization) },
        { label: muted ? "Unmute" : "Mute", kbd: "M", action: () => s().toggleMute() },
      ],
    },
    {
      id: "subtitle",
      label: "Subtitle",
      items: [
        { label: "Off", checked: !activeSub, action: () => void s().setActiveSub(null) },
        ...subTracks.map((t): Item => ({
          label: t.label + (t.unsupported ? " (bitmap)" : ""),
          checked: t.id === activeSub,
          disabled: t.unsupported,
          action: () => void s().setActiveSub(t.id),
        })),
        "sep",
        { label: "Load subtitle file…", action: () => void s().addExternalSubDialog() },
        { label: `Subtitle delay −50 ms (now ${subDelay})`, kbd: "G", action: () => s().setSubDelay(subDelay - 50) },
        { label: "Subtitle delay +50 ms", kbd: "H", action: () => s().setSubDelay(subDelay + 50) },
        { label: "Style & sync…", checked: panel === "subs", action: () => s().setPanel("subs") },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        { label: "Fullscreen", kbd: "F", action: () => toggleFullscreen() },
        { label: "Compact mode", kbd: "Q", checked: compact, action: () => s().setCompact(!compact) },
        { label: "Always on top", kbd: "Ctrl+T", checked: alwaysOnTop, action: () => s().setAlwaysOnTop(!alwaysOnTop) },
        "sep",
        { label: "Playlist", kbd: "Ctrl+P", checked: panel === "playlist", action: () => s().setPanel("playlist") },
        { label: "Media info", kbd: "Ctrl+I", checked: panel === "info", action: () => s().setPanel("info") },
        { label: "Settings", kbd: "Ctrl+S", checked: panel === "settings", action: () => s().setPanel("settings") },
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [
        { label: "Keyboard shortcuts", kbd: "?", action: () => s().toggleHelp() },
        { label: "About WAM", action: () => s().setPanel("settings") },
      ],
    },
  ];

  return (
    <div className="menubar" ref={hostRef}>
      {menus.map((m) => (
        <div key={m.id} className="menu-host">
          <button
            className={`menubar-btn ${open === m.id ? "open" : ""}`}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => open && setOpen(m.id)}
          >
            {m.label}
          </button>
          {open === m.id && (
            <div className="menu drop">
              {m.items.map((it, i) =>
                it === "sep" ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={i}
                    className={`menu-item ${it.checked ? "sel" : ""}`}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.action?.();
                    }}
                  >
                    <span className="mi-label">{it.label}</span>
                    {it.kbd && <span className="mi-key">{it.kbd}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
