import { useEffect, useRef } from "react";
import { usePlayer } from "./store";
import { isTauri } from "./lib/api";
import { contrastAccent } from "./lib/util";
import {
  useAutoHideControls,
  useFileDrop,
  useKeyboard,
  useMediaSession,
} from "./hooks";
import { TitleBar } from "./components/TitleBar";
import { Stage } from "./components/Stage";
import { Controls } from "./components/Controls";
import { SidePanel } from "./components/Panels";
import {
  ConvertDialog, HelpOverlay, Toasts, UrlDialog,
} from "./components/Overlays";

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = usePlayer((s) => s.theme);
  const accent = usePlayer((s) => s.accent);
  const uiScale = usePlayer((s) => s.uiScale);
  const compact = usePlayer((s) => s.compact);
  const fullscreen = usePlayer((s) => s.fullscreen);
  const current = usePlayer((s) => s.current);
  const prevSize = useRef<{ w: number; h: number } | null>(null);

  // document title follows current media
  useEffect(() => {
    document.title = current ? `${current.name} — WAM` : "WAM";
  }, [current]);

  useKeyboard();
  useFileDrop();
  useMediaSession();
  useAutoHideControls(rootRef);

  useEffect(() => {
    void usePlayer.getState().init();
  }, []);

  // keep store.fullscreen in sync with the native window state
  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      un = await w.onResized(() => {
        w.isFullscreen()
          .then((fs) => usePlayer.setState({ fullscreen: fs }))
          .catch(() => {});
      });
    })();
    return () => un?.();
  }, []);

  // theme + accent + scale -> document
  useEffect(() => {
    const apply = () => {
      const resolved =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.setProperty("--accent", contrastAccent(accent, resolved));
      document.documentElement.style.fontSize = `${15 * uiScale}px`;
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent, uiScale]);

  // compact mini-player: shrink + pin window
  useEffect(() => {
    if (!isTauri) return;
    let dead = false;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      const w = getCurrentWindow();
      if (compact) {
        try {
          const sz = await w.outerSize();
          const factor = await w.scaleFactor();
          prevSize.current = { w: sz.width / factor, h: sz.height / factor };
          await w.setSize(new LogicalSize(560, 170));
          await w.setAlwaysOnTop(true);
          await w.setMinSize(new LogicalSize(400, 140));
        } catch { /* noop */ }
      } else {
        try {
          await w.setMinSize(new LogicalSize(560, 380));
          if (prevSize.current) {
            await w.setSize(new LogicalSize(prevSize.current.w, prevSize.current.h));
          }
          if (!usePlayer.getState().alwaysOnTop) await w.setAlwaysOnTop(false);
        } catch { /* noop */ }
      }
      if (dead) return;
    })();
    return () => { dead = true; };
  }, [compact]);

  return (
    <div className={`app ${compact ? "compact" : ""} ${fullscreen ? "fs" : ""}`} ref={rootRef}>
      <TitleBar />
      <div className="main">
        <Stage />
        <SidePanel />
      </div>
      <Controls />
      <Toasts />
      <UrlDialog />
      <ConvertDialog />
      <HelpOverlay />
    </div>
  );
}
