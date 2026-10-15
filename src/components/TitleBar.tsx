import { useEffect, useState } from "react";
import { Minus, Square, X, Pin, PinOff, Copy } from "lucide-react";
import { LogoMark } from "./Logo";
import { MenuBar } from "./MenuBar";
import { usePlayer } from "../store";
import { isTauri } from "../lib/api";

export function TitleBar() {
  const alwaysOnTop = usePlayer((s) => s.alwaysOnTop);
  const setAlwaysOnTop = usePlayer((s) => s.setAlwaysOnTop);
  const current = usePlayer((s) => s.current);
  const compact = usePlayer((s) => s.compact);
  const [maximized, setMaximized] = useState(false);
  const [win, setWin] = useState<import("@tauri-apps/api/window").Window | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      setWin(w);
      setMaximized(await w.isMaximized());
      un = await w.onResized(() => {
        w.isMaximized().then(setMaximized).catch(() => {});
      });
    })();
    return () => un?.();
  }, []);

  useEffect(() => {
    if (win) win.setAlwaysOnTop(alwaysOnTop).catch(() => {});
  }, [alwaysOnTop, win]);

  if (compact) return null;

  return (
    <div className="titlebar" data-tauri-drag-region onDoubleClick={() => win?.toggleMaximize()}>
      <div className="tb-brand" data-tauri-drag-region>
        <span className="tb-logo"><LogoMark size={15} /></span>
        <span className="tb-name">WAM</span>
        <MenuBar />
        {current && <span className="tb-now">{current.name}</span>}
      </div>
      <div className="tb-actions">
        <button
          className={`tb-btn ${alwaysOnTop ? "active" : ""}`}
          title="Always on top (Ctrl+T)"
          onClick={() => {
            setAlwaysOnTop(!alwaysOnTop);
            usePlayer.getState().toast(alwaysOnTop ? "Always on top off" : "Always on top on");
          }}
        >
          {alwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <button className="tb-btn" title="Minimize" onClick={() => win?.minimize()}>
          <Minus size={15} />
        </button>
        <button
          className="tb-btn"
          title="Maximize"
          onClick={() => win?.toggleMaximize()}
        >
          {maximized ? <Copy size={13} style={{ transform: "rotate(90deg)" }} /> : <Square size={13} />}
        </button>
        <button className="tb-btn tb-close" title="Close" onClick={() => win?.close()}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
