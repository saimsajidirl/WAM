import { useEffect, useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { audioGraph } from "../audio";
import { usePlayer } from "../store";
import { stripExt, contrastAccent } from "../lib/util";

/** Audio playback view: cover art (or generated art) + live spectrum. */
export function NowPlaying() {
  const current = usePlayer((s) => s.current);
  const coverUrl = usePlayer((s) => s.coverUrl);
  const accent = usePlayer((s) => s.accent);
  const [coverOk, setCoverOk] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => setCoverOk(true), [coverUrl, current?.id]);

  // live spectrum visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
      const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      const an = audioGraph.analyser;
      if (!an) return;
      if (!data || data.length !== an.frequencyBinCount) {
        data = new Uint8Array(an.frequencyBinCount);
      }
      an.getByteFrequencyData(data);
      const bars = 96;
      const step = Math.max(1, Math.floor(data.length / bars / 2));
      const bw = w / bars;
      const accentRgb = hexToRgb(contrastAccent(accent, document.documentElement.dataset.theme ?? "dark"));
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255;
        const bh = Math.max(2, v * h * 0.9);
        const x = i * bw + bw * 0.18;
        const y = h - bh;
        ctx.fillStyle = `rgba(${accentRgb}, ${0.25 + v * 0.75})`;
        roundRect(ctx, x, y, bw * 0.64, bh, Math.min(bw * 0.32, 6 * devicePixelRatio));
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [accent]);

  if (!current) return null;

  return (
    <div className="now-playing">
      <canvas ref={canvasRef} className="viz-canvas" />
      <div className="np-inner">
        <div className="np-art-wrap">
          {coverUrl && coverOk ? (
            <img
              src={coverUrl}
              className="np-art"
              onError={() => setCoverOk(false)}
              alt="cover"
              draggable={false}
            />
          ) : (
            <div className="np-art np-art-gen">
              <Music2 size={72} strokeWidth={1} />
            </div>
          )}
        </div>
        <div className="np-meta">
          <div className="np-title">{stripExt(current.name)}</div>
          <div className="np-sub dim">{current.name}</div>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
