const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orfNativeNotifications", {
  showChatMessage(payload) {
    return ipcRenderer.invoke("orf:chat-notification:show", payload);
  },
  onOpenChatTarget(handler) {
    if (typeof handler !== "function") return undefined;
    const listener = (_event, targetPath) => {
      if (typeof targetPath === "string") handler(targetPath);
    };
    ipcRenderer.on("orf:chat-notification:open", listener);
    return () => ipcRenderer.removeListener("orf:chat-notification:open", listener);
  },
});

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
  setChatUnreadCount(payload) {
    return ipcRenderer.invoke("orf:desktop-shell:set-chat-unread-count", payload);
  },
  getWindowState() {
    return ipcRenderer.invoke("orf:desktop-shell:get-window-state");
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
  onWindowStateChange(handler) {
    if (typeof handler !== "function") return undefined;
    const listener = (_event, state) => {
      if (state && typeof state === "object") handler(state);
    };
    ipcRenderer.on("orf:desktop-shell:window-state", listener);
    return () => ipcRenderer.removeListener("orf:desktop-shell:window-state", listener);
  },
});
