const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, net, shell } = require("electron");

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
const DESKTOP_ICON_BITMAP_SCALE = 2;
const desktopBadgeGlyphs = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
  "?": ["111", "001", "011", "000", "010"],
};

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
  if (unreadCount <= 0) {
    const iconPath = resolveDesktopIconPath();
    if (iconPath) {
      const image = nativeImage.createFromPath(iconPath).resize({
        height: DESKTOP_ICON_BITMAP_SIZE,
        width: DESKTOP_ICON_BITMAP_SIZE,
      });
      image.setTemplateImage(false);
      return image;
    }
  }

  const image = createUnreadTrayIconImage(unreadCount);
  image.setTemplateImage(false);
  return image;
}

function createUnreadTrayIconImage(unreadCount) {
  return createBitmapNativeImage(DESKTOP_ICON_BITMAP_SIZE, DESKTOP_ICON_BITMAP_SIZE, (canvas) => {
    fillRoundedRect(canvas, 2, 2, 28, 28, 7, { r: 248, g: 250, b: 252, a: 255 });
    fillRoundedRect(canvas, 3, 3, 26, 26, 6, { r: 255, g: 255, b: 255, a: 255 });
    drawLine(canvas, 9, 8.5, 23.5, 23, 4.2, { r: 56, g: 189, b: 248, a: 255 });
    drawLine(canvas, 23, 8.5, 8.5, 23, 4.2, { r: 56, g: 189, b: 248, a: 255 });
    drawUnreadBadge(canvas, unreadCount, { centerX: 24, centerY: 8, radius: 7.5 });
  });
}

function createTaskbarUnreadOverlayImage(unreadCount) {
  return createBitmapNativeImage(DESKTOP_ICON_BITMAP_SIZE, DESKTOP_ICON_BITMAP_SIZE, (canvas) => {
    drawUnreadBadge(canvas, unreadCount, { centerX: 16, centerY: 16, radius: 13.5 });
  });
}

function createBitmapNativeImage(logicalWidth, logicalHeight, draw) {
  const scaleFactor = DESKTOP_ICON_BITMAP_SCALE;
  const canvas = {
    buffer: Buffer.alloc(logicalWidth * scaleFactor * logicalHeight * scaleFactor * 4),
    height: logicalHeight * scaleFactor,
    scaleFactor,
    width: logicalWidth * scaleFactor,
  };
  draw(canvas);
  return nativeImage.createFromBitmap(canvas.buffer, {
    height: canvas.height,
    scaleFactor,
    width: canvas.width,
  });
}

function drawUnreadBadge(canvas, unreadCount, options) {
  const label = desktopUnreadBadgeLabel(unreadCount);
  fillCircle(canvas, options.centerX, options.centerY, options.radius, { r: 239, g: 68, b: 68, a: 255 });
  fillCircle(canvas, options.centerX, options.centerY, options.radius - 1.4, { r: 248, g: 55, b: 61, a: 255 });
  const textScale = badgeTextScale(label, options.radius);
  drawCenteredPixelText(canvas, label, options.centerX, options.centerY + 0.2, textScale, {
    r: 255,
    g: 255,
    b: 255,
    a: 255,
  });
}

function badgeTextScale(label, radius) {
  if (radius >= 10) {
    if (label.length <= 1) return 2.5;
    if (label.length <= 2) return 1.8;
    return 1.2;
  }
  if (label.length <= 1) return 1.8;
  if (label.length <= 2) return 1.2;
  return 0.82;
}

function fillRoundedRect(canvas, x, y, width, height, radius, color) {
  const scale = canvas.scaleFactor;
  const startX = Math.floor(x * scale);
  const endX = Math.ceil((x + width) * scale);
  const startY = Math.floor(y * scale);
  const endY = Math.ceil((y + height) * scale);
  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const logicalX = (pixelX + 0.5) / scale;
      const logicalY = (pixelY + 0.5) / scale;
      const nearestX = Math.max(x + radius, Math.min(logicalX, x + width - radius));
      const nearestY = Math.max(y + radius, Math.min(logicalY, y + height - radius));
      const distanceX = logicalX - nearestX;
      const distanceY = logicalY - nearestY;
      if (distanceX * distanceX + distanceY * distanceY <= radius * radius) {
        blendPixel(canvas, pixelX, pixelY, color);
      }
    }
  }
}

function fillCircle(canvas, centerX, centerY, radius, color) {
  const scale = canvas.scaleFactor;
  const startX = Math.floor((centerX - radius) * scale);
  const endX = Math.ceil((centerX + radius) * scale);
  const startY = Math.floor((centerY - radius) * scale);
  const endY = Math.ceil((centerY + radius) * scale);
  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const logicalX = (pixelX + 0.5) / scale;
      const logicalY = (pixelY + 0.5) / scale;
      const distanceX = logicalX - centerX;
      const distanceY = logicalY - centerY;
      if (distanceX * distanceX + distanceY * distanceY <= radius * radius) {
        blendPixel(canvas, pixelX, pixelY, color);
      }
    }
  }
}

function drawLine(canvas, startX, startY, endX, endY, thickness, color) {
  const scale = canvas.scaleFactor;
  const halfThickness = thickness / 2;
  const minX = Math.floor((Math.min(startX, endX) - halfThickness) * scale);
  const maxX = Math.ceil((Math.max(startX, endX) + halfThickness) * scale);
  const minY = Math.floor((Math.min(startY, endY) - halfThickness) * scale);
  const maxY = Math.ceil((Math.max(startY, endY) + halfThickness) * scale);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared <= 0) return;
  for (let pixelY = minY; pixelY < maxY; pixelY += 1) {
    for (let pixelX = minX; pixelX < maxX; pixelX += 1) {
      const logicalX = (pixelX + 0.5) / scale;
      const logicalY = (pixelY + 0.5) / scale;
      const progress = Math.max(0, Math.min(1, ((logicalX - startX) * deltaX + (logicalY - startY) * deltaY) / lengthSquared));
      const nearestX = startX + progress * deltaX;
      const nearestY = startY + progress * deltaY;
      const distanceX = logicalX - nearestX;
      const distanceY = logicalY - nearestY;
      if (distanceX * distanceX + distanceY * distanceY <= halfThickness * halfThickness) {
        blendPixel(canvas, pixelX, pixelY, color);
      }
    }
  }
}

function drawCenteredPixelText(canvas, text, centerX, centerY, scale, color) {
  const glyphs = String(text).split("").map((char) => desktopBadgeGlyphs[char] ?? desktopBadgeGlyphs["?"]);
  const glyphWidth = 3;
  const glyphHeight = 5;
  const gap = scale;
  const totalWidth = glyphs.length * glyphWidth * scale + Math.max(0, glyphs.length - 1) * gap;
  let cursorX = centerX - totalWidth / 2;
  const top = centerY - (glyphHeight * scale) / 2;
  for (const glyph of glyphs) {
    for (let row = 0; row < glyphHeight; row += 1) {
      for (let column = 0; column < glyphWidth; column += 1) {
        if (glyph[row]?.[column] === "1") {
          fillRect(canvas, cursorX + column * scale, top + row * scale, scale, scale, color);
        }
      }
    }
    cursorX += glyphWidth * scale + gap;
  }
}

function fillRect(canvas, x, y, width, height, color) {
  const scale = canvas.scaleFactor;
  const startX = Math.floor(x * scale);
  const endX = Math.ceil((x + width) * scale);
  const startY = Math.floor(y * scale);
  const endY = Math.ceil((y + height) * scale);
  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      blendPixel(canvas, pixelX, pixelY, color);
    }
  }
}

function blendPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || color.a <= 0) return;
  const offset = (y * canvas.width + x) * 4;
  const alpha = color.a / 255;
  const inverseAlpha = 1 - alpha;
  canvas.buffer[offset] = Math.round(color.b * alpha + canvas.buffer[offset] * inverseAlpha);
  canvas.buffer[offset + 1] = Math.round(color.g * alpha + canvas.buffer[offset + 1] * inverseAlpha);
  canvas.buffer[offset + 2] = Math.round(color.r * alpha + canvas.buffer[offset + 2] * inverseAlpha);
  canvas.buffer[offset + 3] = Math.round(color.a + canvas.buffer[offset + 3] * inverseAlpha);
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
