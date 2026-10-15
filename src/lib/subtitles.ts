import type { SubCue } from "../types";
import { ext } from "./util";

/** Parse a subtitle file's text into cues. Supports srt, vtt, ass/ssa, sbv, microdvd sub, lrc. */
export function parseSubtitles(text: string, filename = ""): SubCue[] {
  const e = ext(filename);
  const t = text.replace(/\r\n?/g, "\n");
  try {
    if (e === "ass" || e === "ssa" || t.includes("[Events]")) return parseAss(t);
    if (e === "vtt" || t.trimStart().startsWith("WEBVTT")) return parseVtt(t);
    if (e === "sbv") return parseSbv(t);
    if (e === "lrc") return parseLrc(t);
    if (e === "sub" || /^\{\d+\}\{\d+\}/m.test(t)) return parseMicroDvd(t);
    return parseSrt(t);
  } catch {
    return parseSrt(t);
  }
}

function ts(s: string): number {
  // "h:mm:ss.mmm" | "hh:mm:ss,mmm" | "mm:ss.mmm"
  const m = s.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return 0;
  const h = m[1] ? parseInt(m[1]) : m[2].length > 2 ? parseInt(m[1] || "0") : 0;
  const hasH = m[1] != null;
  const hh = hasH ? parseInt(m[1]!) : 0;
  const mm = hasH ? parseInt(m[2]) : parseInt(m[1] || m[2]);
  const sec = hasH ? parseInt(m[3]) : parseInt(m[3]);
  void h;
  const frac = parseFloat("0." + m[4]);
  return hh * 3600 + mm * 60 + sec + frac;
}

function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseSrt(t: string): SubCue[] {
  const cues: SubCue[] = [];
  for (const block of t.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1;
    const tm = lines[i]?.match(/(.+?)\s*-->\s*(.+?)(?:\s|$)/);
    if (!tm) continue;
    cues.push({
      start: ts(tm[1]),
      end: ts(tm[2]),
      text: clean(lines.slice(i + 1).join("\n")),
    });
  }
  return cues;
}

function parseVtt(t: string): SubCue[] {
  const body = t.replace(/^WEBVTT[^\n]*\n/, "");
  const cues: SubCue[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    let i = 0;
    if (!/-->/.test(lines[0])) i = 1; // cue identifier
    const tm = lines[i]?.match(/(\S+)\s*-->\s*(\S+)/);
    if (!tm) continue;
    cues.push({
      start: ts(tm[1]),
      end: ts(tm[2]),
      text: clean(lines.slice(i + 1).join("\n")),
    });
  }
  return cues;
}

function parseAss(t: string): SubCue[] {
  const cues: SubCue[] = [];
  const events = t.split("[Events]")[1];
  if (!events) return cues;
  const lines = events.split("\n");
  const fmt = lines
    .find((l) => l.trimStart().startsWith("Format:"))
    ?.slice(7)
    .split(",")
    .map((s) => s.trim().toLowerCase());
  const iStart = fmt?.indexOf("start") ?? 1;
  const iEnd = fmt?.indexOf("end") ?? 2;
  const iText = fmt?.indexOf("text") ?? 9;
  for (const l of lines) {
    const m = l.match(/^\s*Dialogue:\s*(.+)$/);
    if (!m) continue;
    // split into format fields; text field may contain commas
    const parts = m[1].split(",");
    const head = parts.slice(0, iText);
    const text = parts.slice(iText).join(",");
    const st = parseAssTime(head[iStart] ?? "");
    const en = parseAssTime(head[iEnd] ?? "");
    if (en > st) cues.push({ start: st, end: en, text: clean(text.replace(/\\N/g, "\n").replace(/\\n/g, "\n").replace(/\\h/g, " ")) });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function parseAssTime(s: string): number {
  const m = s.trim().match(/(\d+):(\d{2}):(\d{2})[.:](\d{2})/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
}

function parseSbv(t: string): SubCue[] {
  const cues: SubCue[] = [];
  for (const block of t.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    const tm = lines[0]?.match(/([\d:.,]+),([\d:.,]+)/);
    if (!tm) continue;
    cues.push({ start: ts(tm[1]), end: ts(tm[2]), text: clean(lines.slice(1).join("\n")) });
  }
  return cues;
}

function parseMicroDvd(t: string, fps = 25): SubCue[] {
  const cues: SubCue[] = [];
  for (const l of t.split("\n")) {
    const m = l.match(/\{(\d+)\}\{(\d+)\}(.*)/);
    if (!m) continue;
    cues.push({
      start: parseInt(m[1]) / fps,
      end: parseInt(m[2]) / fps,
      text: clean(m[3].replace(/\|/g, "\n")),
    });
  }
  return cues;
}

function parseLrc(t: string): SubCue[] {
  const cues: SubCue[] = [];
  for (const l of t.split("\n")) {
    const m = l.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,2}))?\](.*)/);
    if (!m) continue;
    const start = parseInt(m[1]) * 60 + parseInt(m[2]) + parseFloat("0." + (m[3] || "0"));
    cues.push({ start, end: start + 4, text: clean(m[4]) });
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.min(cues[i + 1].start, cues[i].end + 4);
  return cues;
}

/** Binary-search the active cue index for time t; cues must be sorted. */
export function activeCue(cues: SubCue[], t: number): SubCue | null {
  let lo = 0, hi = cues.length - 1, found: SubCue | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t > c.end) lo = mid + 1;
    else { found = c; break; }
  }
  // cues may overlap; if binary search misses, do a linear fallback near guess
  if (!found) {
    for (const c of cues) {
      if (t >= c.start && t <= c.end) return c;
      if (c.start > t + 2) break;
    }
  }
  return found;
}
