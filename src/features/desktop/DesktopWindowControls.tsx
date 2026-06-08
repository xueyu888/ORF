import { Maximize2, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  closeDesktopWindow,
  getDesktopWindowState,
  minimizeDesktopWindow,
  subscribeDesktopWindowState,
  toggleMaximizeDesktopWindow,
  type DesktopWindowState,
} from "./desktopShellRuntime";

export function DesktopWindowControls({ enabled }: { enabled: boolean }) {
  const [windowState, setWindowState] = useState<DesktopWindowState>({ isMaximized: false });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void getDesktopWindowState().then((result) => {
      if (!cancelled && result.status === "success" && result.data) {
        setWindowState(result.data);
      }
    });
    const unsubscribe = subscribeDesktopWindowState((state) => setWindowState(state));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled]);

  if (!enabled) return null;

  const toggleMaximize = async () => {
    const result = await toggleMaximizeDesktopWindow();
    if (result.status === "success" && result.data) {
      setWindowState(result.data);
    }
  };

  return (
    <div className="orf-desktop-window-controls" aria-label="窗口控制">
      <button className="orf-desktop-window-control" type="button" aria-label="最小化" title="最小化" onClick={() => void minimizeDesktopWindow()}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        className="orf-desktop-window-control"
        type="button"
        aria-label={windowState.isMaximized ? "还原窗口" : "最大化"}
        title={windowState.isMaximized ? "还原窗口" : "最大化"}
        onClick={() => void toggleMaximize()}
      >
        {windowState.isMaximized ? <Square className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      <button className="orf-desktop-window-control orf-desktop-window-control-close" type="button" aria-label="关闭到托盘" title="关闭到托盘" onClick={() => void closeDesktopWindow()}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
