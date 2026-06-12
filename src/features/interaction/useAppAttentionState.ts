import { useEffect, useState } from "react";
import {
  getDesktopWindowState,
  isDesktopShellAvailable,
  subscribeDesktopWindowState,
  type DesktopWindowState,
} from "../desktop/desktopShellRuntime";
import {
  type AppAttentionState,
  appAttentionStateFromBrowserDocument,
  appAttentionStateFromDesktopWindow,
  readBrowserDocumentAttentionSnapshot,
} from "./appAttentionState";

function currentBrowserAttentionState() {
  return appAttentionStateFromBrowserDocument(readBrowserDocumentAttentionSnapshot());
}

function initialAppAttentionState(): AppAttentionState {
  if (isDesktopShellAvailable()) {
    return appAttentionStateFromDesktopWindow(null);
  }
  return currentBrowserAttentionState();
}

export function useAppAttentionState() {
  const [attentionState, setAttentionState] = useState<AppAttentionState>(initialAppAttentionState);

  useEffect(() => {
    let cancelled = false;
    if (isDesktopShellAvailable()) {
      const applyDesktopWindowState = (state: DesktopWindowState | null | undefined) => {
        if (!cancelled) setAttentionState(appAttentionStateFromDesktopWindow(state));
      };
      void getDesktopWindowState()
        .then((result) => {
          applyDesktopWindowState(result.status === "success" ? result.data : null);
        })
        .catch(() => applyDesktopWindowState(null));
      const unsubscribe = subscribeDesktopWindowState(applyDesktopWindowState);
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    }

    const refreshBrowserAttentionState = () => {
      if (!cancelled) setAttentionState(currentBrowserAttentionState());
    };
    if (typeof document === "undefined" || typeof window === "undefined") {
      refreshBrowserAttentionState();
      return () => {
        cancelled = true;
      };
    }
    document.addEventListener("visibilitychange", refreshBrowserAttentionState);
    window.addEventListener("focus", refreshBrowserAttentionState);
    window.addEventListener("blur", refreshBrowserAttentionState);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refreshBrowserAttentionState);
      window.removeEventListener("focus", refreshBrowserAttentionState);
      window.removeEventListener("blur", refreshBrowserAttentionState);
    };
  }, []);

  return attentionState;
}
