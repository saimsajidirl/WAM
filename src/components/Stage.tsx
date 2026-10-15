import { useEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus2, FolderOpen, Link2, Loader2, TriangleAlert,
  Volume1, Volume2, VolumeX,
} from "lucide-react";
import { engine } from "../engine";
import { usePlayer } from "../store";
import { toggleFullscreen } from "../hooks";
import { activeCue } from "../lib/subtitles";
import { fmtTime } from "../lib/util";
import { NowPlaying } from "./NowPlaying";
import { LogoMark } from "./Logo";

export function Stage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const current = usePlayer((s) => s.current);
  const status = usePlayer((s) => s.status);
  const loading = usePlayer((s) => s.loading);
  const error = usePlayer((s) => s.error);
  const vf = usePlayer((s) => s.vf);
  const subCues = usePlayer((s) => s.subCues);
  const activeSub = usePlayer((s) => s.activeSub);
  const subDelay = usePlayer((s) => s.subDelay);
  const subStyle = usePlayer((s) => s.subStyle);
  const time = usePlayer((s) => s.time);
  const compact = usePlayer((s) => s.compact);

  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const dragRef = useRef<{ x0: number; t0: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mountRef.current) engine.mount(mountRef.current);
  }, []);

  // video transforms / filters
  useEffect(() => {
    const el = engine.el;
    const filters = `brightness(${vf.brightness}) contrast(${vf.contrast}) saturate(${vf.saturate}) hue-rotate(${vf.hue}deg)`;
    el.style.filter = filters;
    const rot = vf.rotation;
    const swap = rot === 90 || rot === 270;
    el.style.transform = `rotate(${rot}deg) scale(${swap ? vf.zoom * 0.72 : vf.zoom})`;
    el.style.objectFit =
      vf.aspect === "fill" ? "fill" : vf.aspect === "auto" ? "contain" : "cover";
    el.style.aspectRatio =
      vf.aspect !== "auto" && vf.aspect !== "fill" ? vf.aspect.replace(":", "/") : "";
    el.style.maxWidth = "100%";
    el.style.maxHeight = "100%";
    el.style.width = "100%";
    el.style.height = "100%";
  }, [vf]);

  const cue = useMemo(() => {
    if (!activeSub || !subCues.length) return null;
    return activeCue(subCues, time + subDelay / 1000);
  }, [activeSub, subCues, time, subDelay]);

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggleFullscreen();
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      if (usePlayer.getState().current) usePlayer.getState().toggle();
    }, 240);
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = usePlayer.getState();
    s.volumeBy(e.deltaY < 0 ? s.settings.volumeStep / 100 : -s.settings.volumeStep / 100);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!usePlayer.getState().current) return;
    dragRef.current = { x0: e.clientX, t0: usePlayer.getState().time, dragged: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > 12) d.dragged = true;
    if (d.dragged) {
      const s = usePlayer.getState();
      const dur = s.duration || 0;
      if (dur > 0) setSeekPreview(d.t0 + (dx / window.innerWidth) * Math.min(600, dur * 0.25));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.dragged) {
      suppressClick.current = true;
      const dx = e.clientX - d.x0;
      const s = usePlayer.getState();
      const dur = s.duration || 0;
      if (dur > 0) s.seekTo(d.t0 + (dx / window.innerWidth) * Math.min(600, dur * 0.25));
      setSeekPreview(null);
      e.preventDefault();
    }
  };

  return (
    <div
      className={`stage ${compact ? "hidden" : ""}`}
      onClick={onClick}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        ref={mountRef}
        className="video-mount"
        style={{ display: current?.kind === "audio" ? "none" : "flex" }}
      />

      {current?.kind === "audio" && <NowPlaying />}

      {!current && <EmptyState />}

      {/* subtitle overlay */}
      {cue && current?.kind !== "audio" && (
        <div
          className="sub-overlay"
          style={{ bottom: subStyle.bottom }}
        >
          <span
            className={`sub-text ${subStyle.outline ? "sub-outline" : ""} ${subStyle.bold ? "sub-bold" : ""}`}
            style={{
              fontSize: subStyle.size,
              color: subStyle.color,
              background: subStyle.bg,
            }}
          >
            {cue.text.split("\n").map((l, i) => (
              <span key={i}>
                {l}
                <br />
              </span>
            ))}
          </span>
        </div>
      )}
      {cue && current?.kind === "audio" && (
        <div className="sub-overlay sub-audio" style={{ bottom: 24 }}>
          <span className="sub-text sub-outline" style={{ fontSize: subStyle.size * 0.8, color: subStyle.color, background: subStyle.bg }}>
            {cue.text}
          </span>
        </div>
      )}

      {/* seek-drag preview */}
      {seekPreview != null && (
        <div className="osd-center">
          <span className="osd-badge">{fmtTime(seekPreview)}</span>
        </div>
      )}

      {/* volume change indicator */}
      <VolumeOsd />

      {/* loading spinner */}
      {(loading || status === "loading") && current && (
        <div className="osd-center">
          <Loader2 className="spin" size={44} />
        </div>
      )}

      {/* error */}
      {status === "error" && error && (
        <div className="osd-center">
          <div className="error-card" onClick={(e) => e.stopPropagation()}>
            <TriangleAlert size={30} />
            <p>{error}</p>
            {!usePlayer.getState().ffmpeg.available && (
              <p className="dim">
                Install ffmpeg (or set its path in Settings) to unlock every format.
              </p>
            )}
            <button className="btn" onClick={() => usePlayer.getState().setPanel("settings")}>
              Open Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Transient OSD badge showing the volume % whenever volume/mute changes. */
function VolumeOsd() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const [vis, setVis] = useState(false);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setVis(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVis(false), 900);
  }, [volume, muted]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  if (!vis) return null;
  const v = muted ? 0 : volume;
  return (
    <div className="osd-center">
      <span className="osd-badge osd-vol">
        {v === 0 ? <VolumeX size={20} /> : v < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
        {muted ? "Muted" : `${Math.round(v * 100)}%`}
      </span>
    </div>
  );
}

function EmptyState() {
  const s = usePlayer.getState();
  return (
    <div className="empty-state" onClick={(e) => e.stopPropagation()}>
      <div className="empty-logo">
        <LogoMark size={92} />
      </div>
      <h1>WAM</h1>
      <p className="dim">Drop media files anywhere, or</p>
      <div className="empty-actions">
        <button className="btn primary" onClick={() => void s.openFiles()}>
          <FilePlus2 size={16} /> Open Files
        </button>
        <button className="btn" onClick={() => void s.openFolder()}>
          <FolderOpen size={16} /> Open Folder
        </button>
        <button className="btn" onClick={() => s.setUrlDialog(true)}>
          <Link2 size={16} /> Open URL
        </button>
      </div>
      <p className="dim small">Space = play · F = fullscreen · Ctrl+O = open · ? = shortcuts</p>
    </div>
  );
}
