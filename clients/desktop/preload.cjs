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
});
