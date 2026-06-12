import type { DesktopWindowState } from "../desktop/desktopShellRuntime";

export type AppAttentionSource = "browser-document" | "desktop-window";

export type AppAttentionState = {
  activelyViewed: boolean;
  source: AppAttentionSource;
};

export type BrowserDocumentAttentionSnapshot = {
  documentFocused: boolean;
  visibilityState: DocumentVisibilityState | "unknown";
};

export function appAttentionStateFromBrowserDocument(snapshot: BrowserDocumentAttentionSnapshot): AppAttentionState {
  return {
    activelyViewed: snapshot.visibilityState === "visible" && snapshot.documentFocused,
    source: "browser-document",
  };
}

export function appAttentionStateFromDesktopWindow(state: DesktopWindowState | null | undefined): AppAttentionState {
  return {
    activelyViewed: Boolean(state?.isFocused && state.isVisible !== false && !state.isMinimized),
    source: "desktop-window",
  };
}

export function readBrowserDocumentAttentionSnapshot(): BrowserDocumentAttentionSnapshot {
  if (typeof document === "undefined") {
    return { documentFocused: false, visibilityState: "unknown" };
  }
  return {
    documentFocused: document.hasFocus(),
    visibilityState: document.visibilityState,
  };
}
