import { useEffect, useRef } from "react";
import { usePlayer } from "./store";
import { isTauri } from "./lib/api";

export async function toggleFullscreen() {
  if (isTauri) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      const fs = !(await w.isFullscreen());
      await w.setFullscreen(fs);
      usePlayer.setState({ fullscreen: fs });
      return;
    } catch { /* fall through to DOM API */ }
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen().then(() => usePlayer.setState({ fullscreen: false }));
  } else {
    void document.documentElement.requestFullscreen()
      .then(() => usePlayer.setState({ fullscreen: true }))
      .catch(() => {});
  }
}

/** VLC-style keyboard shortcuts. */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = usePlayer.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;

      if (mod) {
        switch (key.toLowerCase()) {
          case "o":
            e.preventDefault();
            if (e.shiftKey) void s.openFolder();
            else void s.openFiles();
            return;
          case "l":
            e.preventDefault();
            s.setUrlDialog(true);
            return;
          case "t":
            e.preventDefault();
            s.setAlwaysOnTop(!s.alwaysOnTop);
            s.toast(s.alwaysOnTop ? "Always on top: off" : "Always on top: on");
            return;
          case "b":
            e.preventDefault();
            s.addBookmark();
            return;
          case "e":
            e.preventDefault();
            s.setPanel(s.panel === "eq" ? "none" : "eq");
            return;
          case "p":
            e.preventDefault();
            s.setPanel(s.panel === "playlist" ? "none" : "playlist");
            return;
          case "s":
            e.preventDefault();
            s.setPanel(s.panel === "settings" ? "none" : "settings");
            return;
          case "i":
            e.preventDefault();
            s.setPanel(s.panel === "info" ? "none" : "info");
            return;
        }
        if (key === "ArrowLeft") { e.preventDefault(); s.seekBy(-s.settings.seekLong); return; }
        if (key === "ArrowRight") { e.preventDefault(); s.seekBy(s.settings.seekLong); return; }
        return;
      }

      switch (key) {
        case " ":
          e.preventDefault();
          s.toggle();
          return;
        case "ArrowLeft":
          e.preventDefault();
          s.seekBy(e.shiftKey ? -3 : -s.settings.seekShort);
          return;
        case "ArrowRight":
          e.preventDefault();
          s.seekBy(e.shiftKey ? 3 : s.settings.seekShort);
          return;
        case "ArrowUp":
          e.preventDefault();
          s.volumeBy(s.settings.volumeStep / 100);
          return;
        case "ArrowDown":
          e.preventDefault();
          s.volumeBy(-s.settings.volumeStep / 100);
          return;
        case "Enter":
          s.setPanel("none");
          return;
        case "Escape":
          if (s.panel !== "none") s.setPanel("none");
          else if (s.showHelp) s.toggleHelp();
          else if (s.showUrlDialog) s.setUrlDialog(false);
          else if (s.showConvert) s.setConvertDialog(false);
          else if (s.fullscreen) void toggleFullscreen();
          return;
      }

      switch (key.toLowerCase()) {
        case "m": s.toggleMute(); return;
        case "f": toggleFullscreen(); return;
        case "s": s.stop(); return;
        case "n": void s.next(); return;
        case "p": void s.prev(); return;
        case "l": s.cycleRepeat(); return;
        case "r": s.toggleShuffle(); return;
        case "a": s.cycleAspect(); return;
        case "b": {
          const n = s.audioTracks.length;
          if (n > 1) void s.setAudioTrack((s.activeAudioTrack + 1) % n);
          return;
        }
        case "v": {
          const t = s.subTracks;
          if (!t.length) return;
          const idx = t.findIndex((x) => x.id === s.activeSub);
          const next = idx + 1 >= t.length ? null : t[idx + 1].id;
          void s.setActiveSub(next);
          s.toast(next ? `Subtitles: ${t[idx + 1].label}` : "Subtitles off");
          return;
        }
        case "j":
          s.setAudioDelay(s.audioDelay - 50);
          s.toast(`Audio delay ${s.audioDelay - 50} ms`);
          return;
        case "k":
          s.setAudioDelay(s.audioDelay + 50);
          s.toast(`Audio delay ${s.audioDelay + 50} ms`);
          return;
        case "g":
          s.setSubDelay(s.subDelay - 50);
          s.toast(`Subtitle delay ${s.subDelay - 50} ms`);
          return;
        case "h":
          s.setSubDelay(s.subDelay + 50);
          s.toast(`Subtitle delay ${s.subDelay + 50} ms`);
          return;
        case "e": s.frameStep(1); return;
        case "d": s.frameStep(-1); return;
        case "+": case "=": case "]": s.rateStep(1); return;
        case "-": case "[": s.rateStep(-1); return;
        case "c": s.setLoopPoint(); return;
        case "x": s.clearLoop(); return;
        case "t": s.snapshot().then(() => {}); return;
        case "i": void s.togglePip(); return;
        case "?": case "f1": s.toggleHelp(); return;
        case "q": s.setCompact(!s.compact); return;
      }

      if (/^[0-9]$/.test(key) && s.duration > 0) {
        s.seekTo((parseInt(key) / 10) * s.duration);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** File drag & drop via Tauri's webview events + HTML5 fallback. */
export function useFileDrop() {
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      unlisten = await getCurrentWebview().onDragDropEvent(async (ev) => {
        const s = usePlayer.getState();
        if (ev.payload.type === "drop") {
          const paths = ev.payload.paths;
          if (!paths.length) return;
          try {
            const { api } = await import("./lib/api");
            const items = await api.registerPaths(paths);
            const subs = items.filter((i) => i.kind === "subtitle");
            for (const sub of subs) await s.addExternalSubtitle(sub.path);
            const media = items.filter((i) => i.kind === "video" || i.kind === "audio");
            // unknown kinds might be dropped folders — try scanning them
            for (const it of items.filter((i) => i.kind === "unknown")) {
              try {
                const found = await api.scanFolder(it.path);
                media.push(...found);
              } catch { /* not a folder */ }
            }
            if (media.length) {
              if (s.queue.length === 0) await s.playItems(media, 0);
              else {
                s.enqueue(media);
                s.toast(`Added ${media.length} file(s)`);
              }
            } else if (!subs.length) s.toast("Dropped items aren't media files", "error");
          } catch (e) {
            s.toast(`Drop failed: ${e}`, "error");
          }
        }
      });
    })();
    return () => unlisten?.();
  }, []);
}

/** OS media key integration (play/pause/next/prev on keyboard/lock screen). */
export function useMediaSession() {
  const current = usePlayer((s) => s.current);
  const status = usePlayer((s) => s.status);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const name = current?.name || "WAM";
    ms.metadata = new MediaMetadata({
      title: name.replace(/\.[^.]+$/, ""),
      artist: "WAM",
      album: "Now Playing",
    });
    ms.playbackState = status === "playing" ? "playing" : "paused";
    ms.setActionHandler("play", () => usePlayer.getState().toggle());
    ms.setActionHandler("pause", () => usePlayer.getState().toggle());
    ms.setActionHandler("previoustrack", () => void usePlayer.getState().prev());
    ms.setActionHandler("nexttrack", () => void usePlayer.getState().next());
    ms.setActionHandler("seekbackward", () => usePlayer.getState().seekBy(-10));
    ms.setActionHandler("seekforward", () => usePlayer.getState().seekBy(10));
    ms.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) usePlayer.getState().seekTo(d.seekTime);
    });
  }, [current, status]);
}

/** Auto-hide controls + cursor during video playback. */
export function useAutoHideControls(containerRef: React.RefObject<HTMLElement | null>) {
  const setControlsVisible = usePlayer((s) => s.setControlsVisible);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const bump = () => {
      setControlsVisible(true);
      el.classList.remove("cursor-hidden");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = usePlayer.getState();
        if (s.status === "playing" && s.current?.kind === "video" && s.panel === "none") {
          setControlsVisible(false);
          el.classList.add("cursor-hidden");
        }
      }, 2600);
    };
    bump();
    el.addEventListener("mousemove", bump);
    el.addEventListener("mousedown", bump);
    el.addEventListener("touchstart", bump);
    el.addEventListener("keydown", bump);
    return () => {
      clearTimeout(timer.current);
      el.removeEventListener("mousemove", bump);
      el.removeEventListener("mousedown", bump);
      el.removeEventListener("touchstart", bump);
      el.removeEventListener("keydown", bump);
    };
  }, [containerRef, setControlsVisible]);
}
