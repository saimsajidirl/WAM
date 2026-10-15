export function fmtTime(t: number, showMs = false): string {
  if (!isFinite(t) || t < 0) t = 0;
  const ms = Math.floor((t % 1) * 1000);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const core = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
  return showMs ? `${core}.${String(ms).padStart(3, "0")}` : core;
}

export function fmtBytes(n: number): string {
  if (!isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtBitrate(bps?: number | string): string {
  const n = Number(bps);
  if (!isFinite(n) || n <= 0) return "—";
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)} Mb/s` : `${Math.round(n / 1e3)} kb/s`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function debounce<A extends unknown[]>(
  fn: (...a: A) => void,
  ms: number
): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function ext(path: string): string {
  const clean = path.split(/[?#]/)[0];
  const i = clean.lastIndexOf(".");
  return i >= 0 ? clean.slice(i + 1).toLowerCase() : "";
}

export const SUB_EXTS = new Set(["srt", "vtt", "ass", "ssa", "sub", "sbv", "lrc"]);

export function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pure black/white accents always contrast the theme — no black-on-dark or white-on-light. */
export function contrastAccent(accent: string, resolvedTheme: string): string {
  if (accent === "#000000") return resolvedTheme === "dark" ? "#ffffff" : accent;
  if (accent === "#ffffff") return resolvedTheme === "light" ? "#000000" : accent;
  return accent;
}

let uid = 0;
export function nextUid(p = "x"): string {
  return `${p}${(uid++).toString(36)}${Date.now().toString(36)}`;
}
