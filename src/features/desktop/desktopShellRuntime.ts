export type DesktopShellUnreadResult = {
  data?: number;
  reason?: string;
  status: "error" | "success" | "unsupported";
};

type DesktopShellBridge = {
  setChatUnreadCount?: (payload: { count: number }) => Promise<DesktopShellUnreadResult>;
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

function normalizeUnreadCount(count: number) {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}
