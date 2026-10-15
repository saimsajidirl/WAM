# WAM — media player

Tauri v2 (Rust) + React/TS + Vite. WebView2 renders the UI; a Rust localhost
server streams local media with HTTP Range support and transcoding via ffmpeg.

## Commands

- `npm install` — install frontend deps
- `npm run dev` — Vite dev server (browser preview only; Tauri APIs stubbed)
- `npm run build` — `tsc -b && vite build` (typecheck + bundle)
- `npm run tauri dev` — run the desktop app
- `cargo check` — verify the Rust backend (in `src-tauri/`)

## Toolchain notes (this machine)

- Rust default toolchain is `stable-x86_64-pc-windows-gnu` (MSVC build tools
  are NOT installed, so `-msvc` can't link).
- windows-gnu crates shell out to `dlltool.exe`/`as.exe` (GNU binutils).
  `src-tauri/.cargo/config.toml` injects the rust-mingw self-contained dir and
  `DLLTOOL`; a real MinGW-w64 binutils (`as.exe`, `dlltool.exe`, `windres.exe`)
  lives in `~/.wam-tools/mingw64/bin` (extracted from a winlibs zip).
- If building on a fresh machine: install VS Build Tools + `rustup default
  stable-msvc`, or install MinGW-w64 and put its `bin` dir on PATH.

## ffmpeg

Optional but unlocks everything: transcode of non-web formats (MKV/AVI/WMA…),
thumbnails, embedded subtitles, codec info, waveforms, conversion.
Detected at startup from: settings path -> PATH -> next to the exe ->
`%APPDATA%/com.wam.player/bin/`. Set a custom path in Settings.

## Layout

- `src-tauri/src/` — `stream.rs` (HTTP server), `ffmpeg.rs` (tools +
  transcode), `commands.rs` (IPC), `classify.rs` (format mapping), `state.rs`
- `src/` — `store.ts` (zustand state + actions), `engine.ts` (media element),
  `audio.ts` (Web Audio: EQ/boost/delay/comp), `hooks.ts` (keys, dnd),
  `components/`, `styles/`, `lib/` (api, subtitle parsers, presets)
- `scripts/gen-icons.mjs` — regenerates `src-tauri/icons/`
