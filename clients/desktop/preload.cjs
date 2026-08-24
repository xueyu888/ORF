const { contextBridge, ipcRenderer } = require("electron");

function createPendingTargetSubscriber(pendingChannel, consumeChannel) {
  return (handler) => {
    if (typeof handler !== "function") return undefined;
    let disposed = false;
    let drainRequested = false;
    let draining = false;

    const drainOpenTargets = () => {
      if (disposed) return;
      if (draining) {
        drainRequested = true;
        return;
      }
      draining = true;
      void (async () => {
        try {
          do {
            drainRequested = false;
            for (;;) {
              const result = await ipcRenderer.invoke(consumeChannel).catch(() => null);
              const targetPath = result && typeof result === "object" ? result.targetPath : null;
              if (disposed || typeof targetPath !== "string" || !targetPath) break;
              handler(targetPath);
            }
          } while (!disposed && drainRequested);
        } finally {
          draining = false;
          if (!disposed && drainRequested) drainOpenTargets();
        }
      })();
    };

    const listener = () => {
      drainOpenTargets();
    };
    ipcRenderer.on(pendingChannel, listener);
    drainOpenTargets();
    return () => {
      disposed = true;
      ipcRenderer.removeListener(pendingChannel, listener);
    };
  };
}

contextBridge.exposeInMainWorld("orfNativeRuntime", {
  getInfo() {
    return ipcRenderer.invoke("orf:runtime:get-info");
  },
  openExternal(url) {
    return ipcRenderer.invoke("orf:runtime:open-external", url);
  },
  installUpdate(payload) {
    return ipcRenderer.invoke("orf:runtime:install-update", payload);
  },
  onInstallProgress(handler) {
    if (typeof handler !== "function") return undefined;
    const listener = (_event, progress) => {
      if (progress && typeof progress === "object") handler(progress);
    };
    ipcRenderer.on("orf:runtime:install-progress", listener);
    return () => ipcRenderer.removeListener("orf:runtime:install-progress", listener);
  },
});

contextBridge.exposeInMainWorld("orfDesktopShell", {
  setAppearanceMode(payload) {
    return ipcRenderer.invoke("orf:desktop-shell:set-appearance-mode", payload);
  },
  setAttentionState(payload) {
    return ipcRenderer.invoke("orf:desktop-shell:set-attention-state", payload);
  },
  showToastIntent(payload) {
    return ipcRenderer.invoke("orf:desktop-shell:show-toast-intent", payload);
  },
  setChatUnreadCount(payload) {
    return ipcRenderer.invoke("orf:desktop-shell:set-chat-unread-count", payload);
  },
  getLaunchAtLoginState() {
    return ipcRenderer.invoke("orf:desktop-shell:get-launch-at-login-state");
  },
  setLaunchAtLoginEnabled(payload) {
    return ipcRenderer.invoke("orf:desktop-shell:set-launch-at-login-enabled", payload);
  },
  setWorkbenchZoomLevel(payload) {
    return ipcRenderer.invoke("orf:desktop-shell:set-workbench-zoom-level", payload);
  },
  getWindowState() {
    return ipcRenderer.invoke("orf:desktop-shell:get-window-state");
  },
  getSystemIdleSnapshot() {
    return ipcRenderer.invoke("orf:desktop-shell:get-system-idle-snapshot");
  },
  minimizeWindow() {
    return ipcRenderer.invoke("orf:desktop-shell:minimize-window");
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke("orf:desktop-shell:toggle-maximize-window");
  },
  closeWindow() {
    return ipcRenderer.invoke("orf:desktop-shell:close-window");
  },
  onOpenTarget: createPendingTargetSubscriber("orf:desktop-shell:open-pending", "orf:desktop-shell:consume-open-target"),
  onWindowStateChange(handler) {
    if (typeof handler !== "function") return undefined;
    const listener = (_event, state) => {
      if (state && typeof state === "object") handler(state);
    };
    ipcRenderer.on("orf:desktop-shell:window-state", listener);
    return () => ipcRenderer.removeListener("orf:desktop-shell:window-state", listener);
  },
});

contextBridge.exposeInMainWorld("orfDesktopCredentials", {
  listAccounts() {
    return ipcRenderer.invoke("orf:credentials:list-accounts");
  },
  saveAccount(payload) {
    return ipcRenderer.invoke("orf:credentials:save-account", payload);
  },
  getPassword(accountId) {
    return ipcRenderer.invoke("orf:credentials:get-password", accountId);
  },
  deleteAccount(accountId) {
    return ipcRenderer.invoke("orf:credentials:delete-account", accountId);
  },
});
