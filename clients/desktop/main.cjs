const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, net, shell } = require("electron");
const {
  createAppIconRgba,
  createUnreadBadgeRgba,
} = require("./icon-renderer.cjs");

const DEFAULT_ORF_CLIENT_URL = "https://orf-xueyu.duckdns.org:8443/";
const DESKTOP_PACKAGE_PATH = path.join(__dirname, "package.json");
const PACKAGED_DESKTOP_ICON_PATH = path.join(__dirname, "assets", "icon.png");
const REPO_ANDROID_LAUNCHER_ICON_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "android",
  "app",
  "src",
  "main",
  "res",
  "mipmap-xxxhdpi",
  "ic_launcher.png",
);
const DESKTOP_UNREAD_BADGE_LIMIT = 99;
const ORF_APP_NAME = "ORF";
const DESKTOP_ICON_BITMAP_SIZE = 32;
const DESKTOP_ICON_BITMAP_SCALE = 4;

const desktopShellState = {
  clientUrl: null,
  isQuitting: false,
  mainWindow: null,
  tray: null,
  unreadCount: 0,
};

function resolveClientUrl() {
  const rawUrl = process.env.ORF_CLIENT_URL || process.env.ORF_APP_URL || DEFAULT_ORF_CLIENT_URL;
  const clientUrl = new URL(rawUrl);
  if (clientUrl.protocol !== "https:" && clientUrl.hostname !== "localhost" && clientUrl.hostname !== "127.0.0.1") {
    throw new Error("ORF desktop client requires HTTPS unless it targets localhost.");
  }
  return clientUrl;
}

function createMainWindow(clientUrl) {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "ORF",
    icon: resolveDesktopIconPath(),
    frame: false,
    backgroundColor: "#f6f8fb",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });
  desktopShellState.clientUrl = clientUrl;
  desktopShellState.mainWindow = mainWindow;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const targetUrl = new URL(url);
    if (targetUrl.origin === clientUrl.origin) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const targetUrl = new URL(url);
    if (targetUrl.origin === clientUrl.origin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.on("close", (event) => {
    if (!shouldKeepWindowInTray()) return;
    event.preventDefault();
    mainWindow.hide();
    updateDesktopUnreadState();
  });
  mainWindow.on("focus", () => {
    mainWindow.flashFrame(false);
  });
  mainWindow.on("show", updateDesktopUnreadState);
  mainWindow.on("maximize", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("unmaximize", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("enter-full-screen", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("leave-full-screen", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("closed", () => {
    if (desktopShellState.mainWindow === mainWindow) {
      desktopShellState.mainWindow = null;
    }
  });

  void mainWindow.loadURL(clientUrl.toString());
  updateDesktopUnreadState();
  return mainWindow;
}

function resolveDesktopIconPath() {
  if (fs.existsSync(PACKAGED_DESKTOP_ICON_PATH)) return PACKAGED_DESKTOP_ICON_PATH;
  if (fs.existsSync(REPO_ANDROID_LAUNCHER_ICON_PATH)) return REPO_ANDROID_LAUNCHER_ICON_PATH;
  return undefined;
}

function shouldKeepWindowInTray() {
  return process.platform === "win32" && Boolean(desktopShellState.tray) && !desktopShellState.isQuitting;
}

function createDesktopTray(clientUrl) {
  if (process.platform !== "win32" || desktopShellState.tray) return;
  desktopShellState.clientUrl = clientUrl;
  const tray = new Tray(createTrayIconImage(desktopShellState.unreadCount));
  desktopShellState.tray = tray;
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow("/chat"));
  updateDesktopUnreadState();
}

function showMainWindow(targetPath) {
  const clientUrl = desktopShellState.clientUrl ?? resolveClientUrl();
  desktopShellState.clientUrl = clientUrl;
  const currentWindow = desktopShellState.mainWindow;
  const targetWindow = currentWindow && !currentWindow.isDestroyed() ? currentWindow : createMainWindow(clientUrl);
  if (targetWindow.isMinimized()) targetWindow.restore();
  targetWindow.show();
  targetWindow.focus();
  if (isSafeChatTargetPath(targetPath)) {
    openChatTargetInWindow(targetWindow, targetPath);
  }
  return targetWindow;
}

function openChatTargetInWindow(targetWindow, targetPath) {
  const sendOpenTarget = () => {
    if (!targetWindow.isDestroyed()) {
      targetWindow.webContents.send("orf:chat-notification:open", targetPath);
    }
  };
  if (targetWindow.webContents.isLoading()) {
    targetWindow.webContents.once("did-finish-load", sendOpenTarget);
    return;
  }
  sendOpenTarget();
}

function requestDesktopAttention(targetWindow) {
  if (process.platform !== "win32") return;
  const windowToFlash = targetWindow && !targetWindow.isDestroyed() ? targetWindow : desktopShellState.mainWindow;
  if (!windowToFlash || windowToFlash.isDestroyed() || windowToFlash.isFocused()) return;
  windowToFlash.flashFrame(true);
}

function setDesktopUnreadCount(unreadCount) {
  const previousUnreadCount = desktopShellState.unreadCount;
  desktopShellState.unreadCount = unreadCount;
  updateDesktopUnreadState({ unreadIncreased: unreadCount > previousUnreadCount });
}

function updateDesktopUnreadState(options = {}) {
  updateTrayUnreadState();
  const targetWindow = desktopShellState.mainWindow;
  if (process.platform !== "win32" || !targetWindow || targetWindow.isDestroyed()) return;

  const unreadCount = desktopShellState.unreadCount;
  if (unreadCount > 0) {
    targetWindow.setOverlayIcon(createTaskbarUnreadOverlayImage(unreadCount), unreadDescription(unreadCount));
    if (options.unreadIncreased && !targetWindow.isFocused()) {
      targetWindow.flashFrame(true);
    }
    return;
  }

  targetWindow.setOverlayIcon(null, "");
  targetWindow.flashFrame(false);
}

function updateTrayUnreadState() {
  const tray = desktopShellState.tray;
  if (!tray || tray.isDestroyed()) return;
  const unreadCount = desktopShellState.unreadCount;
  tray.setImage(createTrayIconImage(unreadCount));
  tray.setToolTip(unreadCount > 0 ? `${ORF_APP_NAME} - ${unreadDescription(unreadCount)}` : ORF_APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: unreadCount > 0 ? `打开聊天（${desktopUnreadBadgeLabel(unreadCount)} 未读）` : "打开聊天",
      click: () => showMainWindow("/chat"),
    },
    {
      label: "打开 ORF",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        desktopShellState.isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function createTrayIconImage(unreadCount) {
  const image = createDesktopIconNativeImage(DESKTOP_ICON_BITMAP_SIZE, unreadCount);
  image.setTemplateImage(false);
  return image;
}

function createTaskbarUnreadOverlayImage(unreadCount) {
  return createNativeImageFromRgba(DESKTOP_ICON_BITMAP_SIZE, createUnreadBadgeRgba(
    DESKTOP_ICON_BITMAP_SIZE * DESKTOP_ICON_BITMAP_SCALE,
    DESKTOP_ICON_BITMAP_SIZE * DESKTOP_ICON_BITMAP_SCALE,
    unreadCount,
  ));
}

function createDesktopIconNativeImage(logicalSize, unreadCount) {
  return createNativeImageFromRgba(logicalSize, createAppIconRgba(
    logicalSize * DESKTOP_ICON_BITMAP_SCALE,
    logicalSize * DESKTOP_ICON_BITMAP_SCALE,
    { unreadCount },
  ));
}

function createNativeImageFromRgba(logicalSize, rgbaBuffer) {
  const physicalSize = logicalSize * DESKTOP_ICON_BITMAP_SCALE;
  const bitmap = Buffer.alloc(rgbaBuffer.length);
  for (let offset = 0; offset < rgbaBuffer.length; offset += 4) {
    bitmap[offset] = rgbaBuffer[offset + 2];
    bitmap[offset + 1] = rgbaBuffer[offset + 1];
    bitmap[offset + 2] = rgbaBuffer[offset];
    bitmap[offset + 3] = rgbaBuffer[offset + 3];
  }
  return nativeImage.createFromBitmap(bitmap, {
    height: physicalSize,
    scaleFactor: DESKTOP_ICON_BITMAP_SCALE,
    width: physicalSize,
  });
}

function desktopUnreadBadgeLabel(unreadCount) {
  return unreadCount > DESKTOP_UNREAD_BADGE_LIMIT ? `${DESKTOP_UNREAD_BADGE_LIMIT}+` : String(Math.max(0, unreadCount));
}

function unreadDescription(unreadCount) {
  return `${desktopUnreadBadgeLabel(unreadCount)} 条未读聊天消息`;
}

function isSafeChatTargetPath(targetPath) {
  return typeof targetPath === "string" && /^\/chat(?:\/[^?#]+)?(?:\?[^#]*)?$/.test(targetPath);
}

function normalizeDesktopUnreadInput(input) {
  const rawValue = typeof input === "number"
    ? input
    : input && typeof input === "object" && "count" in input
      ? input.count
      : 0;
  const count = Number(rawValue);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

function notificationText(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function chatNotificationPayload(input, clientUrl) {
  if (!input || typeof input !== "object") return null;
  const title = notificationText(input.title, 120);
  const body = notificationText(input.body, 500);
  const targetPath = notificationText(input.targetPath, 500);
  if (!title || !body || !isSafeChatTargetPath(targetPath)) return null;

  const targetUrl = new URL(targetPath, clientUrl);
  if (targetUrl.origin !== clientUrl.origin) return null;

  return {
    body,
    targetPath: `${targetUrl.pathname}${targetUrl.search}`,
    title,
  };
}

function registerNativeNotificationBridge(clientUrl) {
  ipcMain.handle("orf:chat-notification:show", (event, input) => {
    const payload = chatNotificationPayload(input, clientUrl);
    if (!payload) return { status: "not_sent", reason: "invalid_payload" };
    if (!Notification.isSupported()) return { status: "unsupported", reason: "notification_not_supported" };

    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      icon: resolveDesktopIconPath(),
      silent: false,
    });
    notification.on("click", () => {
      showMainWindow(payload.targetPath);
    });
    notification.show();
    requestDesktopAttention(BrowserWindow.fromWebContents(event.sender));
    return { status: "success" };
  });
}

function registerDesktopShellBridge() {
  ipcMain.handle("orf:desktop-shell:set-chat-unread-count", (_event, input) => {
    const unreadCount = normalizeDesktopUnreadInput(input);
    setDesktopUnreadCount(unreadCount);
    return { status: "success", data: unreadCount };
  });
  ipcMain.handle("orf:desktop-shell:get-window-state", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return { status: "unsupported", reason: "window_unavailable" };
    return { status: "success", data: desktopWindowState(targetWindow) };
  });
  ipcMain.handle("orf:desktop-shell:minimize-window", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return { status: "unsupported", reason: "window_unavailable" };
    targetWindow.minimize();
    return { status: "success", data: desktopWindowState(targetWindow) };
  });
  ipcMain.handle("orf:desktop-shell:toggle-maximize-window", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return { status: "unsupported", reason: "window_unavailable" };
    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
    } else {
      targetWindow.maximize();
    }
    return { status: "success", data: desktopWindowState(targetWindow) };
  });
  ipcMain.handle("orf:desktop-shell:close-window", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return { status: "unsupported", reason: "window_unavailable" };
    targetWindow.close();
    return { status: "success" };
  });
}

function desktopWindowState(targetWindow) {
  return {
    isFullScreen: targetWindow.isFullScreen(),
    isMaximized: targetWindow.isMaximized(),
  };
}

function sendDesktopWindowState(targetWindow) {
  if (targetWindow.isDestroyed()) return;
  targetWindow.webContents.send("orf:desktop-shell:window-state", desktopWindowState(targetWindow));
}

function isTrustedClientUpdateUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      /^\/xueyu888\/ORF\/releases(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function registerNativeRuntimeBridge() {
  ipcMain.handle("orf:runtime:get-info", () => ({
    platform: process.platform,
    version: resolveDesktopClientVersion(),
  }));
  ipcMain.handle("orf:runtime:open-external", async (_event, url) => {
    if (!isTrustedClientUpdateUrl(url)) {
      return { status: "error", reason: "untrusted_url" };
    }
    await shell.openExternal(url);
    return { status: "success" };
  });
  ipcMain.handle("orf:runtime:install-update", async (_event, input) => {
    if (process.platform !== "win32") {
      return { status: "unsupported", reason: "unsupported_platform" };
    }
    const payload = clientUpdateInstallPayload(input);
    if (!payload) {
      return { status: "not_sent", reason: "invalid_payload" };
    }
    try {
      const installerPath = await downloadClientUpdateInstaller(payload);
      const openError = await shell.openPath(installerPath);
      if (openError) {
        return { status: "error", reason: "installer_open_failed", data: openError };
      }
      return { status: "success", data: installerPath };
    } catch (error) {
      return { status: "error", reason: "installer_download_failed", data: String(error) };
    }
  });
}

function resolveDesktopClientVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(DESKTOP_PACKAGE_PATH, "utf8"));
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    return null;
  }
}

function clientUpdateInstallPayload(input) {
  if (!input || typeof input !== "object") return null;
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!isTrustedClientUpdateUrl(url)) return null;
  const fileName = sanitizeUpdateInstallerName(input.name, "ORF-update-win11-x64-setup.exe");
  if (!fileName.endsWith(".exe")) return null;
  return { fileName, url };
}

async function downloadClientUpdateInstaller(payload) {
  const updateDir = path.join(app.getPath("temp"), "orf-client-updates");
  fs.mkdirSync(updateDir, { recursive: true });
  const installerPath = path.join(updateDir, payload.fileName);
  const tempPath = `${installerPath}.download`;
  fs.rmSync(tempPath, { force: true });

  const response = await net.fetch(payload.url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tempPath));
  fs.renameSync(tempPath, installerPath);
  return installerPath;
}

function sanitizeUpdateInstallerName(value, fallback) {
  const rawName = typeof value === "string" ? path.basename(value.trim()) : "";
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-");
  return safeName || fallback;
}

app.setName("ORF");
app.setAppUserModelId("org.duckdns.orfxueyu.orf");
Menu.setApplicationMenu(null);
app.on("before-quit", () => {
  desktopShellState.isQuitting = true;
  if (desktopShellState.tray && !desktopShellState.tray.isDestroyed()) {
    desktopShellState.tray.destroy();
  }
  desktopShellState.tray = null;
});

app.whenReady().then(() => {
  const clientUrl = resolveClientUrl();
  desktopShellState.clientUrl = clientUrl;
  registerNativeNotificationBridge(clientUrl);
  registerNativeRuntimeBridge();
  registerDesktopShellBridge();
  createDesktopTray(clientUrl);
  createMainWindow(clientUrl);

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !desktopShellState.tray) app.quit();
});
