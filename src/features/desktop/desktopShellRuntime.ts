export type DesktopShellUnreadResult = {
  data?: number;
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
  isFullScreen?: boolean;
  isMaximized: boolean;
};

export type DesktopShellWindowResult = {
  data?: DesktopWindowState;
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
  getWindowState?: () => Promise<DesktopShellWindowResult>;
  minimizeWindow?: () => Promise<DesktopShellWindowResult>;
  onWindowStateChange?: (handler: (state: DesktopWindowState) => void) => (() => void);
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
    if (state && typeof state.isMaximized === "boolean") {
      handler(state);
    }
  });
}

function normalizeUnreadCount(count: number) {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function normalizeDesktopWindowResult(result: DesktopShellWindowResult | undefined): DesktopShellWindowResult {
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
