const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { app, BrowserWindow, Menu, Notification, ipcMain, net, shell } = require("electron");

const DEFAULT_ORF_CLIENT_URL = "https://orf-xueyu.duckdns.org:8443/";
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
    backgroundColor: "#f6f8fb",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

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

  void mainWindow.loadURL(clientUrl.toString());
  return mainWindow;
}

function resolveDesktopIconPath() {
  if (fs.existsSync(PACKAGED_DESKTOP_ICON_PATH)) return PACKAGED_DESKTOP_ICON_PATH;
  if (fs.existsSync(REPO_ANDROID_LAUNCHER_ICON_PATH)) return REPO_ANDROID_LAUNCHER_ICON_PATH;
  return undefined;
}

function isSafeChatTargetPath(targetPath) {
  return typeof targetPath === "string" && /^\/chat(?:\/[^?#]+)?(?:\?[^#]*)?$/.test(targetPath);
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
      const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
      if (!targetWindow || targetWindow.isDestroyed()) return;
      if (targetWindow.isMinimized()) targetWindow.restore();
      targetWindow.show();
      targetWindow.focus();
      targetWindow.webContents.send("orf:chat-notification:open", payload.targetPath);
    });
    notification.show();
    return { status: "success" };
  });
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

app.whenReady().then(() => {
  const clientUrl = resolveClientUrl();
  registerNativeNotificationBridge(clientUrl);
  registerNativeRuntimeBridge();
  createMainWindow(clientUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(clientUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
