import type { AttentionLevel } from "../attention/attentionTypes";

export type DesktopShellUnreadResult = {
  data?: number;
  reason?: string;
  status: "error" | "success" | "unsupported";
};

export type DesktopAttentionToast = {
  body: string;
  id: string;
  level?: AttentionLevel;
  targetPath: string;
  title: string;
};

export type DesktopAttentionPayload = {
  body: string;
  count: number;
  latestEventId?: string | null;
  latestTargetPath?: string | null;
  level: AttentionLevel;
  reason?: string | null;
  title: string;
  toast?: DesktopAttentionToast | null;
};

export type DesktopAttentionResult = {
  data?: DesktopAttentionPayload;
  reason?: string;
  status: "error" | "success" | "unsupported";
};

export type DesktopLaunchAtLoginState = {
  enabled: boolean;
  promptSeen?: boolean;
  supported: boolean;
};

export type DesktopShellLaunchAtLoginResult = {
  data?: DesktopLaunchAtLoginState;
  reason?: string;
  status: "error" | "success" | "unsupported";
};

export type DesktopWindowState = {
  isFocused?: boolean;
  isFullScreen?: boolean;
  isMaximized: boolean;
  isMinimized?: boolean;
  isVisible?: boolean;
};

export type DesktopSystemIdleSnapshot = {
  idleSeconds: number | null;
  state: "active" | "idle" | "locked" | "unknown";
  supported: boolean;
};

export type DesktopShellWindowResult = {
  data?: DesktopWindowState;
  reason?: string;
  status: "error" | "success" | "unsupported";
};

export type DesktopSystemIdleResult = {
  data?: DesktopSystemIdleSnapshot;
  reason?: string;
  status: "error" | "success" | "unsupported";
};

export type DesktopWorkbenchZoomResult = {
  data?: { level: number };
  reason?: string;
  status: "error" | "success" | "unsupported";
};

type DesktopShellBridge = {
  closeWindow?: () => Promise<DesktopShellWindowResult>;
  getLaunchAtLoginState?: () => Promise<DesktopShellLaunchAtLoginResult>;
  getSystemIdleSnapshot?: () => Promise<DesktopSystemIdleResult>;
  getWindowState?: () => Promise<DesktopShellWindowResult>;
  minimizeWindow?: () => Promise<DesktopShellWindowResult>;
  onOpenTarget?: (handler: (targetPath: string) => void) => (() => void);
  onWindowStateChange?: (handler: (state: DesktopWindowState) => void) => (() => void);
  setAttentionState?: (payload: DesktopAttentionPayload) => Promise<DesktopAttentionResult>;
  setChatUnreadCount?: (payload: { count: number }) => Promise<DesktopShellUnreadResult>;
  setLaunchAtLoginEnabled?: (payload: { enabled: boolean }) => Promise<DesktopShellLaunchAtLoginResult>;
  setWorkbenchZoomLevel?: (payload: { level: number }) => Promise<DesktopWorkbenchZoomResult>;
  toggleMaximizeWindow?: () => Promise<DesktopShellWindowResult>;
};

declare global {
  interface Window {
    orfDesktopShell?: DesktopShellBridge;
  }
}

export async function syncDesktopChatUnreadCount(count: number): Promise<DesktopShellUnreadResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.setChatUnreadCount) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  const normalizedCount = normalizeUnreadCount(count);
  try {
    const result = await window.orfDesktopShell.setChatUnreadCount({ count: normalizedCount });
    return result?.status ? result : { data: normalizedCount, status: "success" };
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function syncDesktopAttentionState(payload: DesktopAttentionPayload): Promise<DesktopAttentionResult> {
  const normalizedPayload = normalizeDesktopAttentionPayload(payload);
  if (typeof window === "undefined" || !window.orfDesktopShell) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  if (window.orfDesktopShell.setAttentionState) {
    try {
      const result = await window.orfDesktopShell.setAttentionState(normalizedPayload);
      return result?.status ? result : { data: normalizedPayload, status: "success" };
    } catch {
      return { status: "error", reason: "desktop_shell_bridge_failed" };
    }
  }
  if (window.orfDesktopShell.setChatUnreadCount) {
    const result = await syncDesktopChatUnreadCount(normalizedPayload.count);
    return result.status === "success"
      ? { data: normalizedPayload, status: "success" }
      : { reason: result.reason, status: result.status };
  }
  return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
}

export function isDesktopShellAvailable() {
  return typeof window !== "undefined" && Boolean(window.orfDesktopShell);
}

export async function getDesktopLaunchAtLoginState(): Promise<DesktopShellLaunchAtLoginResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.getLaunchAtLoginState) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    return normalizeDesktopLaunchAtLoginResult(await window.orfDesktopShell.getLaunchAtLoginState());
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function setDesktopLaunchAtLoginEnabled(enabled: boolean): Promise<DesktopShellLaunchAtLoginResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.setLaunchAtLoginEnabled) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    return normalizeDesktopLaunchAtLoginResult(await window.orfDesktopShell.setLaunchAtLoginEnabled({ enabled }));
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function setDesktopWorkbenchZoomLevel(level: number): Promise<DesktopWorkbenchZoomResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.setWorkbenchZoomLevel) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    const result = await window.orfDesktopShell.setWorkbenchZoomLevel({ level });
    return result?.status ? result : { data: { level }, status: "success" };
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function getDesktopWindowState(): Promise<DesktopShellWindowResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.getWindowState) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    return normalizeDesktopWindowResult(await window.orfDesktopShell.getWindowState());
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function getDesktopSystemIdleSnapshot(): Promise<DesktopSystemIdleResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.getSystemIdleSnapshot) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    return normalizeDesktopSystemIdleResult(await window.orfDesktopShell.getSystemIdleSnapshot());
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function minimizeDesktopWindow(): Promise<DesktopShellWindowResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.minimizeWindow) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    return normalizeDesktopWindowResult(await window.orfDesktopShell.minimizeWindow());
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function toggleMaximizeDesktopWindow(): Promise<DesktopShellWindowResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.toggleMaximizeWindow) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    return normalizeDesktopWindowResult(await window.orfDesktopShell.toggleMaximizeWindow());
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export async function closeDesktopWindow(): Promise<DesktopShellWindowResult> {
  if (typeof window === "undefined" || !window.orfDesktopShell?.closeWindow) {
    return { status: "unsupported", reason: "desktop_shell_bridge_unavailable" };
  }
  try {
    return normalizeDesktopWindowResult(await window.orfDesktopShell.closeWindow());
  } catch {
    return { status: "error", reason: "desktop_shell_bridge_failed" };
  }
}

export function subscribeDesktopWindowState(handler: (state: DesktopWindowState) => void) {
  if (typeof window === "undefined" || !window.orfDesktopShell?.onWindowStateChange) {
    return undefined;
  }
  return window.orfDesktopShell.onWindowStateChange((state) => {
    const normalizedState = normalizeDesktopWindowState(state);
    if (normalizedState) {
      handler(normalizedState);
    }
  });
}

export function subscribeDesktopAttentionTargetOpen(handler: (targetPath: string) => void) {
  if (typeof window === "undefined" || !window.orfDesktopShell?.onOpenTarget) {
    return undefined;
  }
  return window.orfDesktopShell.onOpenTarget((targetPath) => {
    if (isSafeDesktopAttentionTargetPath(targetPath)) {
      handler(targetPath);
    }
  });
}

export function isSafeDesktopAttentionTargetPath(targetPath: string | null | undefined) {
  return typeof targetPath === "string"
    && /^\/(?!\/)[\w\-./~%]*(?:\?[^#\s]*)?(?:#[^\s]*)?$/.test(targetPath)
    && !targetPath.startsWith("/api/")
    && !targetPath.startsWith("/auth");
}

function normalizeUnreadCount(count: number) {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function normalizeDesktopAttentionPayload(payload: DesktopAttentionPayload): DesktopAttentionPayload {
  const count = normalizeUnreadCount(payload.count);
  const level = normalizeAttentionLevel(payload.level, count);
  const latestTargetPath = isSafeDesktopAttentionTargetPath(payload.latestTargetPath) ? payload.latestTargetPath : null;
  const toast = normalizeDesktopAttentionToast(payload.toast);
  return {
    body: normalizeDesktopAttentionText(payload.body, count > 0 ? `${count} 条待处理提醒` : ""),
    count,
    latestEventId: normalizeDesktopAttentionText(payload.latestEventId, "") || null,
    latestTargetPath,
    level,
    reason: normalizeDesktopAttentionText(payload.reason, "") || null,
    title: normalizeDesktopAttentionText(payload.title, "ORF"),
    toast,
  };
}

function normalizeDesktopAttentionToast(toast: DesktopAttentionPayload["toast"]): DesktopAttentionToast | null {
  if (!toast || !isSafeDesktopAttentionTargetPath(toast.targetPath)) return null;
  return {
    body: normalizeDesktopAttentionText(toast.body, "你有一条新的提醒"),
    id: normalizeDesktopAttentionText(toast.id, ""),
    level: normalizeAttentionLevel(toast.level ?? "toast", 1),
    targetPath: toast.targetPath,
    title: normalizeDesktopAttentionText(toast.title, "ORF 提醒"),
  };
}

function normalizeAttentionLevel(level: AttentionLevel | undefined, count: number): AttentionLevel {
  if (level === "urgent" || level === "flash" || level === "toast" || level === "badge") {
    return count > 0 ? level : "none";
  }
  return count > 0 ? "badge" : "none";
}

function normalizeDesktopAttentionText(value: string | null | undefined, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, 500);
}

function normalizeDesktopWindowResult(result: DesktopShellWindowResult | undefined): DesktopShellWindowResult {
  if (result?.status === "success" && result.data) {
    const data = normalizeDesktopWindowState(result.data);
    return data ? { status: "success", data } : { status: "error", reason: "desktop_window_state_invalid" };
  }
  return result?.status ? result : { status: "success" };
}

function normalizeDesktopLaunchAtLoginResult(result: DesktopShellLaunchAtLoginResult | undefined): DesktopShellLaunchAtLoginResult {
  if (result?.status === "success" && result.data) {
    return {
      status: "success",
      data: {
        enabled: result.data.enabled === true,
        promptSeen: result.data.promptSeen === true,
        supported: result.data.supported !== false,
      },
    };
  }
  return result?.status ? result : { status: "error", reason: "desktop_launch_at_login_result_invalid" };
}

function normalizeDesktopWindowState(state: DesktopWindowState | undefined): DesktopWindowState | null {
  if (!state || typeof state.isMaximized !== "boolean") return null;
  return {
    isFocused: state.isFocused === true,
    isFullScreen: state.isFullScreen === true,
    isMaximized: state.isMaximized,
    isMinimized: state.isMinimized === true,
    isVisible: state.isVisible !== false,
  };
}

function normalizeDesktopSystemIdleResult(result: DesktopSystemIdleResult | undefined): DesktopSystemIdleResult {
  if (result?.status === "success" && result.data) {
    const idleSeconds = typeof result.data.idleSeconds === "number" && Number.isFinite(result.data.idleSeconds)
      ? Math.max(0, result.data.idleSeconds)
      : null;
    const state = result.data.state === "active" || result.data.state === "idle" || result.data.state === "locked"
      ? result.data.state
      : "unknown";
    return {
      status: "success",
      data: {
        idleSeconds,
        state,
        supported: result.data.supported === true,
      },
    };
  }
  return result?.status ? result : { status: "error", reason: "desktop_system_idle_result_invalid" };
}
