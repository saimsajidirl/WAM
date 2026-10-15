import { useRef, useState } from "react";
import { usePlayer } from "../store";
import { clamp, fmtTime } from "../lib/util";

export function SeekBar() {
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const buffered = usePlayer((s) => s.buffered);
  const chapters = usePlayer((s) => s.chapters);
  const abLoop = usePlayer((s) => s.abLoop);
  const waveform = usePlayer((s) => s.waveform);
  const seekTo = usePlayer((s) => s.seekTo);
  const showMilli = usePlayer((s) => s.settings.showMilli);

  const barRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const posToTime = (clientX: number): number => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || !duration) return 0;
    return clamp((clientX - r.left) / r.width, 0, 1) * duration;
  };

  const shown = scrubbing ?? time;
  const pct = duration ? (shown / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;

  const wavePath = (() => {
    if (!waveform || !waveform.length) return "";
    const w = 100, h = 16;
    const pts = waveform.map((v, i) => {
      const x = (i / (waveform.length - 1)) * w;
      const y = h - v * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return `M0,${h} L${pts.join(" L")} L${w},${h} Z`;
  })();

  const chapter = chapters.find((c) => shown >= c.start && shown < c.end);
  const hoverChapter = hover && chapters.find((c) => hover.t >= c.start && hover.t < c.end);

  return (
    <div className="seek-wrap">
      <div
        ref={barRef}
        className={`seekbar ${!duration ? "disabled" : ""}`}
        onPointerDown={(e) => {
          if (!duration) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setScrubbing(posToTime(e.clientX));
        }}
        onPointerMove={(e) => {
          if (scrubbing != null) setScrubbing(posToTime(e.clientX));
          if (duration) {
            const r = barRef.current!.getBoundingClientRect();
            setHover({ x: e.clientX - r.left, t: posToTime(e.clientX) });
          }
        }}
        onPointerUp={(e) => {
          if (scrubbing != null) {
            seekTo(posToTime(e.clientX));
            setScrubbing(null);
          }
        }}
        onPointerLeave={() => setHover(null)}
      >
        {waveform && <svg className="seek-wave" viewBox="0 0 100 16" preserveAspectRatio="none"><path d={wavePath} /></svg>}
        <div className="seek-track" />
        <div className="seek-buffered" style={{ width: `${bufPct}%` }} />
        {abLoop.a != null && duration > 0 && (
          <div
            className="seek-ab"
            style={{
              left: `${(abLoop.a / duration) * 100}%`,
              width: `${(((abLoop.b ?? duration) - abLoop.a) / duration) * 100}%`,
            }}
          />
        )}
        {chapters.map((c, i) => (
          <div key={i} className="seek-tick" style={{ left: `${(c.start / duration) * 100}%` }} />
        ))}
        <div className="seek-fill" style={{ width: `${pct}%` }} />
        <div className="seek-thumb" style={{ left: `${pct}%` }} />
        {hover && duration > 0 && (
          <div className="seek-tip" style={{ left: clamp(hover.x, 30, (barRef.current?.clientWidth || 60) - 30) }}>
            {fmtTime(hover.t, showMilli)}
            {hoverChapter && <span className="seek-tip-ch">{hoverChapter.title}</span>}
          </div>
        )}
      </div>
      {chapter && <div className="chapter-label">{chapter.title}</div>}
    </div>
  );
}
