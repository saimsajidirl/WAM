# WAM

A modern local media player for Windows — plays **everything**, not just what the browser likes.

Built with **Tauri v2** (Rust backend) + **React 19 / TypeScript** (frontend) + **Vite**. The UI runs in WebView2 while a Rust localhost server streams media over HTTP with Range support and transcodes non-web formats through **ffmpeg** — so MKV, AVI, WMA, FLAC, and friends all play natively in the app.

## Features

- **Plays anything** — ffmpeg transcodes formats the webview can't decode (MKV, AVI, WMV, WMA, FLAC, ...)
- **Local HTTP streaming** — instant seek via Range requests, no waiting for full-file transcode
- **Subtitles** — SRT/VTT/ASS/SSA/SUB/SBV/LRC, auto-loaded, embedded track extraction, custom styling + delay
- **Audio suite** — 10-band EQ with presets, volume boost up to 300%, normalization, compressor, audio/sub delay
- **Playback tools** — A-B loop, frame stepping, speed control, aspect ratio cycling, zoom/rotate/filters
- **Playlist** — queue, shuffle, repeat, history, resume position, bookmarks
- **Thumbnails & info** — generated thumbnails, codec/resolution/bitrate info via ffprobe
- **Extras** — picture-in-picture, compact mini-player, always-on-top, snapshots, URL playback, media conversion, OS media-session integration
- **Themes** — light / dark / system, customizable accent color

## Getting started

### Prerequisites

- **Node.js** (LTS)
- **Rust** — see toolchain note below
- **ffmpeg + ffprobe** *(optional but recommended)* — enables transcoding, thumbnails, embedded subtitles, codec info, waveforms, and conversion. The app detects it at startup from, in order: settings path → `PATH` → next to the exe → `%APPDATA%/com.wam.player/bin/`. You can also set a custom path in Settings.

### Windows toolchain note

This project builds with `stable-x86_64-pc-windows-gnu` (MSVC build tools are not installed, so the `-msvc` target can't link). MinGW-w64 binutils live in `~/.wam-tools/mingw64/bin` and `src-tauri/.cargo/config.toml` wires them up.

On a fresh machine, either:

- install **VS Build Tools** and `rustup default stable-msvc`, or
- install **MinGW-w64** and put its `bin` directory on `PATH`.

### Run

```powershell
npm install
npm run tauri:dev    # desktop app with hot reload
```

### Other commands

```powershell
npm run dev          # Vite dev server only (browser preview; Tauri APIs stubbed)
npm run build        # typecheck + production bundle -> dist/
cargo check          # verify the Rust backend (run inside src-tauri/)
node scripts/gen-icons.mjs   # regenerate app icons
```

## Keyboard shortcuts

Press `?` or `F1` in-app for the full list. Highlights:

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `← →` | Seek (`Shift` = 3s, `Ctrl` = 60s) |
| `↑ ↓` / `M` | Volume / mute |
| `E` / `D` | Frame step forward / back |
| `+ -` | Playback speed |
| `C` / `X` | Set / clear A-B loop |
| `B` / `V` | Cycle audio / subtitle track |
| `J K` / `G H` | Audio / subtitle delay ±50ms |
| `T` | Snapshot |
| `I` | Picture-in-picture |
| `Q` | Compact mode |
| `Ctrl+O` / `Ctrl+Shift+O` / `Ctrl+L` | Open files / folder / URL |
| `Ctrl+P E S I` | Playlist / Effects / Settings / Info |

## How it works

```
WebView2 (React UI)
      │  Tauri IPC
      ▼
Rust backend ──► localhost HTTP server (streams media, Range requests)
      │
      └──► ffmpeg/ffprobe (transcode, thumbnails, subtitles, info, conversion)
```

- `src-tauri/src/` — `stream.rs` (HTTP server), `ffmpeg.rs` (tool detection + transcode), `commands.rs` (IPC), `classify.rs` (format mapping), `state.rs`
- `src/` — `store.ts` (zustand state + actions), `engine.ts` (media element), `audio.ts` (Web Audio graph), `hooks.ts` (keys, drag & drop), `components/`, `lib/`
- UI state (settings, history, resume positions, queue) persists to `%APPDATA%\com.wam.player\state.json`

## Icons

`src-tauri/icons/` is generated — black rounded tile with a white "W" monogram, rendered procedurally with zero dependencies. To regenerate after changing the design, edit `scripts/gen-icons.mjs` and run:

```powershell
node scripts/gen-icons.mjs
```
