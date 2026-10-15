import { useEffect, useRef, useState } from "react";
import {
  Camera, Captions, ChevronRight, Clapperboard, FastForward, Film,
  ListVideo, Loader2, Maximize, Minimize, Music2, Pause, PictureInPicture2,
  Play, Repeat, Repeat1, Rewind, Settings, Shuffle, SkipBack, SkipForward,
  SlidersHorizontal, Square, StepBack, StepForward, Timer, Volume1,
  Volume2, VolumeX, Info, Bookmark, Clock,
} from "lucide-react";
import { usePlayer } from "../store";
import { toggleFullscreen } from "../hooks";
import { RATE_STEPS } from "../lib/presets";
import { fmtTime } from "../lib/util";
import { SeekBar } from "./SeekBar";

function useMenu(): [boolean, React.RefObject<HTMLDivElement | null>, () => void] {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return [open, ref, () => setOpen((o) => !o)];
}

export function Controls() {
  const status = usePlayer((s) => s.status);
  const loading = usePlayer((s) => s.loading);
  const current = usePlayer((s) => s.current);
  const visible = usePlayer((s) => s.controlsVisible);
  const compact = usePlayer((s) => s.compact);
  const playing = status === "playing";
  const hasMedia = !!current;

  return (
    <div className={`controls ${visible || !hasMedia ? "show" : "hide"} ${compact ? "compact" : ""}`}>
      {!compact && <SeekBar />}
      <div className="ctl-row">
        <div className="ctl-group">
          <IconBtn title="Previous (P)" onClick={() => void usePlayer.getState().prev()} disabled={!hasMedia}>
            <SkipBack size={19} />
          </IconBtn>
          <button
            className="ctl-play"
            title="Play / Pause (Space)"
            onClick={() => (hasMedia ? usePlayer.getState().toggle() : void usePlayer.getState().openFiles())}
          >
            {loading ? <Loader2 size={22} className="spin" /> : playing ? <Pause size={22} /> : <Play size={22} style={{ marginLeft: 2 }} />}
          </button>
          <IconBtn title="Next (N)" onClick={() => void usePlayer.getState().next()} disabled={!hasMedia}>
            <SkipForward size={19} />
          </IconBtn>
          <IconBtn title="Stop (S)" onClick={() => usePlayer.getState().stop()} disabled={!hasMedia}>
            <Square size={16} />
          </IconBtn>
          <IconBtn title="Frame back (D)" onClick={() => usePlayer.getState().frameStep(-1)} disabled={!hasMedia || current?.kind !== "video"}>
            <StepBack size={17} />
          </IconBtn>
          <IconBtn title="Frame forward (E)" onClick={() => usePlayer.getState().frameStep(1)} disabled={!hasMedia || current?.kind !== "video"}>
            <StepForward size={17} />
          </IconBtn>
          <VolumeControl />
          <TimeDisplay />
        </div>

        <div className="ctl-group right">
          <SpeedMenu />
          <SubMenu />
          <AudioTrackMenu />
          <IconBtn
            title="A-B loop (C)"
            onClick={() => usePlayer.getState().setLoopPoint()}
            disabled={!hasMedia}
            className={usePlayer((s) => (s.abLoop.a != null ? "on" : ""))}
          >
            <span className="ab-label">AB</span>
          </IconBtn>
          <RepeatBtn />
          <ShuffleBtn />
          <IconBtn title="Equalizer (Ctrl+E)" onClick={() => usePlayer.getState().setPanel(usePlayer.getState().panel === "eq" ? "none" : "eq")}>
            <SlidersHorizontal size={17} />
          </IconBtn>
          <IconBtn title="Snapshot (T)" onClick={() => void usePlayer.getState().snapshot()} disabled={!hasMedia || current?.kind !== "video"}>
            <Camera size={17} />
          </IconBtn>
          <IconBtn title="Picture in picture (I)" onClick={() => void usePlayer.getState().togglePip()} disabled={!hasMedia || current?.kind !== "video"}>
            <PictureInPicture2 size={17} />
          </IconBtn>
          <MoreMenu />
          <IconBtn
            title="Playlist (Ctrl+P)"
            onClick={() => usePlayer.getState().setPanel(usePlayer.getState().panel === "playlist" ? "none" : "playlist")}
            className={usePlayer((s) => (s.panel === "playlist" ? "on" : ""))}
          >
            <ListVideo size={18} />
          </IconBtn>
          <IconBtn
            title="Settings (Ctrl+S)"
            onClick={() => usePlayer.getState().setPanel(usePlayer.getState().panel === "settings" ? "none" : "settings")}
            className={usePlayer((s) => (s.panel === "settings" ? "on" : ""))}
          >
            <Settings size={18} />
          </IconBtn>
          <FullscreenBtn />
        </div>
      </div>
    </div>
  );
}

function IconBtn(props: {
  children: React.ReactNode;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`ctl-btn ${props.className || ""}`}
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const v = drag ?? (muted ? 0 : volume);
  const max = 3;
  const pct = (v / max) * 100;

  const pos = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(max, Math.max(0, ((clientX - r.left) / r.width) * max));
  };

  return (
    <div className="vol-wrap">
      <IconBtn title={muted ? "Unmute (M)" : "Mute (M)"} onClick={toggleMute}>
        {muted || v === 0 ? <VolumeX size={18} /> : v < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
      </IconBtn>
      <div
        ref={ref}
        className="vol-slider"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDrag(pos(e.clientX));
        }}
        onPointerMove={(e) => drag != null && setDrag(pos(e.clientX))}
        onPointerUp={(e) => {
          if (drag != null) {
            setVolume(pos(e.clientX));
            setDrag(null);
          }
        }}
      >
        <div className="vol-track" />
        <div className={`vol-fill ${v > 1 ? "boost" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      {v > 1 && <span className="vol-pct">{Math.round(v * 100)}%</span>}
    </div>
  );
}

function TimeDisplay() {
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const showMilli = usePlayer((s) => s.settings.showMilli);
  const [remaining, setRemaining] = useState(false);
  return (
    <button
      className="time-display"
      title={remaining ? "Show elapsed" : "Show remaining"}
      onClick={() => setRemaining((r) => !r)}
    >
      <span>{fmtTime(time, showMilli)}</span>
      <span className="dim"> / </span>
      <span className="dim">
        {remaining && duration > 0 ? `-${fmtTime(Math.max(0, duration - time))}` : fmtTime(duration)}
      </span>
    </button>
  );
}

function SpeedMenu() {
  const rate = usePlayer((s) => s.rate);
  const setRate = usePlayer((s) => s.setRate);
  const [open, ref, toggle] = useMenu();
  return (
    <div className="menu-host" ref={ref}>
      <button className={`ctl-btn speed ${rate !== 1 ? "on" : ""}`} title="Playback speed ([ / ])" onClick={toggle}>
        {rate === 1 ? <FastForward size={17} /> : <span className="rate-label">{rate}x</span>}
      </button>
      {open && (
        <div className="menu">
          <div className="menu-title">Speed</div>
          {RATE_STEPS.map((r) => (
            <button key={r} className={`menu-item ${r === rate ? "sel" : ""}`} onClick={() => { setRate(r); toggle(); }}>
              {r}x
            </button>
          ))}
          <div className="menu-sep" />
          <div className="menu-item-row">
            <button className="menu-mini" onClick={() => usePlayer.getState().rateStep(-1)}><Rewind size={14} /></button>
            <button className="menu-mini" onClick={() => usePlayer.getState().rateStep(1)}><FastForward size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubMenu() {
  const subTracks = usePlayer((s) => s.subTracks);
  const activeSub = usePlayer((s) => s.activeSub);
  const subDelay = usePlayer((s) => s.subDelay);
  const [open, ref, toggle] = useMenu();
  const hasSubs = subTracks.length > 0;
  return (
    <div className="menu-host" ref={ref}>
      <button
        className={`ctl-btn ${activeSub ? "on" : ""}`}
        title="Subtitles (V)"
        onClick={toggle}
      >
        <Captions size={18} />
      </button>
      {open && (
        <div className="menu">
          <div className="menu-title">Subtitles</div>
          <button className={`menu-item ${!activeSub ? "sel" : ""}`} onClick={() => { void usePlayer.getState().setActiveSub(null); toggle(); }}>
            Off
          </button>
          {subTracks.map((t) => (
            <button
              key={t.id}
              className={`menu-item ${t.id === activeSub ? "sel" : ""}`}
              disabled={t.unsupported}
              onClick={() => { void usePlayer.getState().setActiveSub(t.id); toggle(); }}
            >
              <span className="mi-label">{t.label}{t.loading ? "…" : ""}{t.unsupported ? " (bitmap)" : ""}</span>
            </button>
          ))}
          {!hasSubs && <div className="menu-note">No subtitle tracks</div>}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { void usePlayer.getState().addExternalSubDialog(); toggle(); }}>
            <span className="mi-label">Load subtitle file…</span><ChevronRight size={13} />
          </button>
          <button className="menu-item" onClick={() => { usePlayer.getState().setPanel("subs"); toggle(); }}>
            <span className="mi-label">Style & sync…</span><ChevronRight size={13} />
          </button>
          <div className="menu-sep" />
          <div className="menu-delay">
            <span>Delay</span>
            <button className="menu-mini" onClick={() => usePlayer.getState().setSubDelay(subDelay - 100)}>-100</button>
            <span className="delay-val">{subDelay}ms</span>
            <button className="menu-mini" onClick={() => usePlayer.getState().setSubDelay(subDelay + 100)}>+100</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AudioTrackMenu() {
  const audioTracks = usePlayer((s) => s.audioTracks);
  const active = usePlayer((s) => s.activeAudioTrack);
  const audioDelay = usePlayer((s) => s.audioDelay);
  const [open, ref, toggle] = useMenu();
  if (!audioTracks.length && audioDelay === 0) {
    return (
      <IconBtn title="Audio tracks" disabled>
        <Music2 size={17} />
      </IconBtn>
    );
  }
  return (
    <div className="menu-host" ref={ref}>
      <button className={`ctl-btn ${audioDelay !== 0 ? "on" : ""}`} title="Audio track (B) & delay (J/K)" onClick={toggle}>
        <Music2 size={17} />
      </button>
      {open && (
        <div className="menu">
          <div className="menu-title">Audio track</div>
          {audioTracks.map((t) => (
            <button key={t.index} className={`menu-item ${t.index === active ? "sel" : ""}`} onClick={() => { void usePlayer.getState().setAudioTrack(t.index); toggle(); }}>
              <span className="mi-label">{t.index + 1}. {t.label}</span>
            </button>
          ))}
          {!audioTracks.length && <div className="menu-note">Single audio track</div>}
          <div className="menu-sep" />
          <div className="menu-delay">
            <span>A/V sync</span>
            <button className="menu-mini" onClick={() => usePlayer.getState().setAudioDelay(audioDelay - 50)}>-50</button>
            <span className="delay-val">{audioDelay}ms</span>
            <button className="menu-mini" onClick={() => usePlayer.getState().setAudioDelay(audioDelay + 50)}>+50</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RepeatBtn() {
  const repeat = usePlayer((s) => s.repeat);
  return (
    <IconBtn title={`Repeat: ${repeat} (L)`} onClick={() => usePlayer.getState().cycleRepeat()} className={repeat !== "off" ? "on" : ""}>
      {repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
    </IconBtn>
  );
}

function ShuffleBtn() {
  const shuffle = usePlayer((s) => s.shuffle);
  return (
    <IconBtn title={`Shuffle ${shuffle ? "on" : "off"} (R)`} onClick={() => usePlayer.getState().toggleShuffle()} className={shuffle ? "on" : ""}>
      <Shuffle size={16} />
    </IconBtn>
  );
}

function FullscreenBtn() {
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  return (
    <IconBtn title="Fullscreen (F)" onClick={toggleFullscreen}>
      {fs ? <Minimize size={18} /> : <Maximize size={18} />}
    </IconBtn>
  );
}

function MoreMenu() {
  const [open, ref, toggle] = useMenu();
  const sleepLabel = usePlayer((s) => s.sleepLabel);
  const normalization = usePlayer((s) => s.normalization);
  const current = usePlayer((s) => s.current);
  const s = () => usePlayer.getState();
  const item = (label: string, icon: React.ReactNode, fn: () => void, right?: React.ReactNode) => (
    <button className="menu-item" onClick={() => { fn(); toggle(); }}>
      {icon}<span className="mi-label">{label}</span>{right}
    </button>
  );
  return (
    <div className="menu-host" ref={ref}>
      <button className="ctl-btn" title="More" onClick={toggle}>
        <Clapperboard size={17} />
      </button>
      {open && (
        <div className="menu wide">
          <div className="menu-title">Playback</div>
          {item("Sleep timer…", <Timer size={15} />, () => {}, <span className="dim small">{sleepLabel || ""}</span>)}
          <div className="menu-sub">
            {[15, 30, 45, 60, 90].map((m) => (
              <button key={m} className="menu-mini" onClick={() => s().setSleepTimer(m)}>{m}m</button>
            ))}
            <button className="menu-mini" onClick={() => s().setSleepTimer("eof")}>EoT</button>
            <button className="menu-mini" onClick={() => s().setSleepTimer(null)}>Off</button>
          </div>
          {item("Bookmark this position", <Bookmark size={15} />, () => s().addBookmark())}
          {item("Media info", <Info size={15} />, () => s().setPanel("info"))}
          <div className="menu-sep" />
          <div className="menu-title">Audio</div>
          {item(`Normalization ${normalization ? "✓" : ""}`, <Volume2 size={15} />, () => s().setNormalization(!normalization))}
          <div className="menu-title">Video</div>
          {item("Convert / save…", <Film size={15} />, () => s().setConvertDialog(true), current ? undefined : <span className="dim">—</span>)}
          {item("Subtitle style…", <Captions size={15} />, () => s().setPanel("subs"))}
          {item("Adjustments & effects…", <SlidersHorizontal size={15} />, () => s().setPanel("eq"))}
          <div className="menu-sep" />
          {item("Keyboard shortcuts", <Clock size={15} />, () => s().toggleHelp())}
        </div>
      )}
    </div>
  );
}
