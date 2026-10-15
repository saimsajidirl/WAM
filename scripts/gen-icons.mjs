// Generates WAM app icons: black rounded-square with a white "W" monogram.
// Pure Node — no dependencies. Produces PNGs + a multi-size ICO.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../src-tauri/icons");

function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return b;
}

function render(size) {
  // RGBA pixel buffer
  const px = new Float64Array(size * size * 4);
  const r = size * 0.22; // corner radius
  const cA = [0x30, 0x30, 0x38]; // top-left charcoal
  const cB = [0x00, 0x00, 0x02]; // bottom-right black

  const inRound = (x, y) => {
    // rounded-rect signed distance
    const m = size * 0.5;
    const qx = Math.abs(x - m) - (m - r);
    const qy = Math.abs(y - m) - (m - r);
    const dx = Math.max(qx, 0), dy = Math.max(qy, 0);
    return Math.hypot(dx, dy) + Math.min(Math.max(qx, qy), 0) - r <= 0;
  };

  // "W" monogram as a distance field over 4 strokes (round caps/joins)
  const strokes = [
    [0.26, 0.30, 0.395, 0.70],
    [0.395, 0.70, 0.50, 0.40],
    [0.50, 0.40, 0.605, 0.70],
    [0.605, 0.70, 0.74, 0.30],
  ].map(([x1, y1, x2, y2]) => [x1 * size, y1 * size, x2 * size, y2 * size]);
  const half = size * 0.042; // stroke half-width

  const dSeg = (x, y, s) => {
    const dx = s[2] - s[0], dy = s[3] - s[1];
    const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (s[0] + dx * t), y - (s[1] + dy * t));
  };
  const inW = (x, y) => Math.min(...strokes.map((s) => dSeg(x, y, s))) <= half;

  const SS = 4; // supersample
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          if (!inRound(fx, fy)) continue;
          // diagonal gradient
          const t = (fx + fy) / (2 * size);
          const br = cA[0] + (cB[0] - cA[0]) * t;
          const bg = cA[1] + (cB[1] - cA[1]) * t;
          const bb2 = cA[2] + (cB[2] - cA[2]) * t;
          if (inW(fx, fy)) {
            // white W with a faint vertical sheen
            const g = 255 - (fy / size) * 55;
            rr += g; gg += g; bb += g; aa += 255;
          } else {
            rr += br; gg += bg; bb += bb2; aa += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      px[i] = rr / n; px[i + 1] = gg / n; px[i + 2] = bb / n; px[i + 3] = aa / n;
    }
  }
  return px;
}

function toPng(size, px) {
  // raw scanlines, filter 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4;
      const di = y * (size * 4 + 1) + 1 + x * 4;
      raw[di] = Math.round(px[si]);
      raw[di + 1] = Math.round(px[si + 1]);
      raw[di + 2] = Math.round(px[si + 2]);
      raw[di + 3] = Math.round(px[si + 3]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function toIco(pngs) {
  // ICO can embed PNGs directly (Vista+)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dirSize = 6 + 16 * pngs.length;
  const dirs = [];
  let offset = dirSize;
  for (const { size, buf } of pngs) {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size;
    d[1] = size >= 256 ? 0 : size;
    d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(buf.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += buf.length;
    dirs.push(d);
  }
  return Buffer.concat([header, ...dirs, ...pngs.map((p) => p.buf)]);
}

fs.mkdirSync(OUT, { recursive: true });
const targets = [
  { file: "32x32.png", size: 32 },
  { file: "128x128.png", size: 128 },
  { file: "128x128@2x.png", size: 256 },
  { file: "icon.png", size: 512 },
];
const bufs = [];
for (const t of targets) {
  const png = toPng(t.size, render(t.size));
  fs.writeFileSync(path.join(OUT, t.file), png);
  bufs.push({ size: t.size, buf: png });
  console.log(`wrote ${t.file}`);
}
fs.writeFileSync(path.join(OUT, "icon.ico"), toIco(bufs));
console.log("wrote icon.ico");

// Force cargo to rerun tauri-build (re-embeds the icon into the exe's
// .rsrc). The build script doesn't watch icon files, so without this a
// relink would reuse a stale compiled resource.
const buildRs = path.resolve(OUT, "../build.rs");
try {
  const now = new Date();
  fs.utimesSync(buildRs, now, now);
  console.log("touched build.rs (forces icon re-embed on next build)");
} catch {
  console.warn("could not touch build.rs — rebuild may reuse the old icon");
}
