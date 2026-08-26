const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, net, powerMonitor, safeStorage, screen, shell } = require("electron");
const { createDesktopShellIconRgba, createUnreadBadgeRgba } = require("./icon-renderer.cjs");
const { windowsNotificationToastXml } = require("./notification-renderer.cjs");
const { launchDesktopUpdateInstallerAfterExit } = require("./update-installer.cjs");

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
const DESKTOP_ICON_BITMAP_SCALE = 4;
const DESKTOP_TASKBAR_ICON_BITMAP_SIZE = 32;
const DESKTOP_TRAY_ICON_BITMAP_SIZE = 16;
const MAX_PENDING_DESKTOP_TARGETS = 16;
const MAX_SEEN_DESKTOP_TOAST_INTENTS = 128;
const MAX_NOTIFICATION_AVATAR_CACHE_FILES = 64;
const MAX_NOTIFICATION_AVATAR_DATA_URL_LENGTH = 1_000_000;
const DESKTOP_TOAST_ACTIVATION_PREFIX = "orf-desktop-toast";
const CHAT_NOTIFICATION_ACTIVATION_PREFIX = "orf-chat-notification";
const ATTENTION_NOTIFICATION_ACTIVATION_PREFIX = "orf-attention-notification";
const DESKTOP_ATTENTION_FLASH_COOLDOWN_MS = 12000;
const DESKTOP_ATTENTION_ICON_FLASH_INTERVAL_MS = 700;
const DESKTOP_RECOVERY_ROOT_CHECK_DELAY_MS = 4000;
const DESKTOP_RECOVERY_RELOAD_COOLDOWN_MS = 8000;
const DESKTOP_RECOVERY_STABLE_RESET_DELAY_MS = 30000;
const DESKTOP_RECOVERY_MAX_AUTOMATIC_RELOADS = 2;
const DESKTOP_CREDENTIALS_MAX_ACCOUNTS = 10;
const DESKTOP_CREDENTIALS_FILE_NAME = "saved-login-accounts.v1.json";
const DESKTOP_SETTINGS_FILE_NAME = "desktop-settings.v1.json";
const DESKTOP_STABLE_DATA_DIR_NAME = "ORF";
const DESKTOP_WINDOW_BACKGROUND_COLORS = Object.freeze({
  dark: "#0e1115",
  light: "#e9edee",
});
const DESKTOP_MAIN_WINDOW_SIZE = Object.freeze({
  height: 900,
  minHeight: 680,
  minWidth: 820,
  width: 1360,
});
const CHAT_IMAGE_POPOUT_MINIMUM_SIZE = Object.freeze({
  height: 360,
  width: 520,
});
const DESKTOP_WORKBENCH_ZOOM_MIN = -2;
const DESKTOP_WORKBENCH_ZOOM_MAX = 4;
const DESKTOP_SYSTEM_IDLE_THRESHOLD_SECONDS = 10 * 60;
const DESKTOP_LAUNCH_AT_LOGIN_ARG = "--orf-start-hidden";
const DESKTOP_LAUNCH_AT_LOGIN_PROMPT_DELAY_MS = 1200;
const DESKTOP_RECOVERY_CHECK_SCRIPT = `
(() => {
  const root = document.getElementById("root");
  return {
    href: window.location.href,
    rootChildCount: root ? root.childElementCount : -1
  };
})()
`;

const desktopShellState = {
  attentionIconFlashHighlighted: false,
  attentionIconFlashTimer: null,
  attentionState: createEmptyDesktopAttentionState(),
  clientUpdateInstallInProgress: false,
  clientUrl: null,
  isQuitting: false,
  lastAttentionFlashAt: 0,
  mainWindow: null,
  notificationAvatarFilePaths: [],
  pendingDesktopTargetsByWebContents: new Map(),
  recoveryStateByWebContents: new Map(),
  seenDesktopToastIntentIds: [],
  seenDesktopToastIntentFingerprints: new Map(),
  storagePaths: null,
  tray: null,
  unreadCount: 0,
};

function createEmptyDesktopAttentionState() {
  return {
    badgeCount: 0,
    body: "",
    count: 0,
    latestEventId: null,
    latestTargetPath: null,
    level: "none",
    reason: null,
    title: "ORF",
  };
}

function configureStableDesktopStoragePaths() {
  const defaultUserDataPath = app.getPath("userData");
  const defaultSessionDataPath = app.getPath("sessionData");
  const stableDataPath = path.join(app.getPath("appData"), DESKTOP_STABLE_DATA_DIR_NAME);

  app.setPath("userData", stableDataPath);
  app.setPath("sessionData", stableDataPath);
  desktopShellState.storagePaths = {
    defaultSessionDataPath,
    defaultUserDataPath,
    sessionDataPath: stableDataPath,
    userDataPath: stableDataPath,
  };

  console.info("[ORF desktop] stable storage paths configured", desktopShellState.storagePaths);
}

function resolveClientUrl() {
  const rawUrl = process.env.ORF_CLIENT_URL || process.env.ORF_APP_URL || DEFAULT_ORF_CLIENT_URL;
  const clientUrl = new URL(rawUrl);
  if (clientUrl.protocol !== "https:" && clientUrl.hostname !== "localhost" && clientUrl.hostname !== "127.0.0.1") {
    throw new Error("ORF desktop client requires HTTPS unless it targets localhost.");
  }
  return clientUrl;
}

function createMainWindow(clientUrl, options = {}) {
  const mainWindow = new BrowserWindow({
    ...DESKTOP_MAIN_WINDOW_SIZE,
    title: "ORF",
    icon: createDesktopTaskbarIconImage("normal", false),
    frame: false,
    backgroundColor: desktopWindowBackgroundColor(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: desktopBrowserWindowWebPreferences(),
  });
  const webContentsId = mainWindow.webContents.id;
  desktopShellState.clientUrl = clientUrl;
  desktopShellState.mainWindow = mainWindow;
  desktopShellState.recoveryStateByWebContents.set(webContentsId, createDesktopRecoveryState());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const targetUrl = new URL(url);
    if (targetUrl.origin === clientUrl.origin) {
      if (isChatImagePopoutUrl(targetUrl)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: chatImagePopoutBrowserWindowOptions(mainWindow),
        };
      }
      if (isDriveFilePreviewPopoutUrl(targetUrl)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: driveFilePreviewPopoutBrowserWindowOptions(),
        };
      }
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-create-window", (childWindow, details) => {
    const childUrl = new URL(details.url);
    if (isChatImagePopoutUrl(childUrl)) {
      centerAndRevealChatImagePopoutWindow(childWindow, mainWindow);
      return;
    }
    if (isDriveFilePreviewPopoutUrl(childUrl)) {
      revealDesktopWindowWhenReady(childWindow);
    }
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const targetUrl = new URL(url);
    if (targetUrl.origin === clientUrl.origin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  registerDesktopRecoveryHandlers(mainWindow, clientUrl);

  mainWindow.on("close", (event) => {
    if (!shouldKeepWindowInTray()) return;
    event.preventDefault();
    mainWindow.hide();
    updateDesktopUnreadState();
  });
  mainWindow.on("focus", () => {
    mainWindow.flashFrame(false);
    sendDesktopWindowState(mainWindow);
  });
  mainWindow.on("blur", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("show", () => {
    updateDesktopUnreadState();
    sendDesktopWindowState(mainWindow);
  });
  mainWindow.on("hide", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("minimize", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("restore", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("maximize", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("unmaximize", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("enter-full-screen", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("leave-full-screen", () => sendDesktopWindowState(mainWindow));
  mainWindow.on("closed", () => {
    desktopShellState.pendingDesktopTargetsByWebContents.delete(webContentsId);
    clearDesktopRecoveryTimersByWebContentsId(webContentsId);
    desktopShellState.recoveryStateByWebContents.delete(webContentsId);
    if (desktopShellState.mainWindow === mainWindow) {
      desktopShellState.mainWindow = null;
    }
  });

  if (options.show !== false) {
    mainWindow.once("ready-to-show", () => revealDesktopWindow(mainWindow));
  }

  void mainWindow.loadURL(clientUrl.toString());
  updateDesktopUnreadState();
  return mainWindow;
}

function desktopBrowserWindowWebPreferences() {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, "preload.cjs"),
    sandbox: true,
  };
}

function isChatImagePopoutUrl(url) {
  return url.pathname.startsWith("/chat/image-popout/");
}

function isDriveFilePreviewPopoutUrl(url) {
  return url.pathname.startsWith("/drive/file-preview-popout/");
}

function chatImagePopoutBrowserWindowOptions(parentWindow) {
  return {
    autoHideMenuBar: true,
    backgroundColor: desktopWindowBackgroundColor(),
    frame: false,
    minHeight: CHAT_IMAGE_POPOUT_MINIMUM_SIZE.height,
    minWidth: CHAT_IMAGE_POPOUT_MINIMUM_SIZE.width,
    parent: parentWindow,
    resizable: true,
    show: false,
    title: "ORF 图片窗口",
    webPreferences: desktopBrowserWindowWebPreferences(),
  };
}

function centerAndRevealChatImagePopoutWindow(popoutWindow, parentWindow) {
  if (popoutWindow.isDestroyed() || parentWindow.isDestroyed()) return;

  const parentBounds = parentWindow.getBounds();
  const workArea = screen.getDisplayMatching(parentBounds).workArea;
  const [requestedWidth, requestedHeight] = popoutWindow.getSize();
  const width = clampWindowDimension(requestedWidth, CHAT_IMAGE_POPOUT_MINIMUM_SIZE.width, workArea.width);
  const height = clampWindowDimension(requestedHeight, CHAT_IMAGE_POPOUT_MINIMUM_SIZE.height, workArea.height);
  popoutWindow.setBounds({
    height,
    width,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  });

  popoutWindow.once("ready-to-show", () => {
    if (popoutWindow.isDestroyed()) return;
    if (popoutWindow.isMinimized()) popoutWindow.restore();
    popoutWindow.show();
    popoutWindow.focus();
  });
}

function revealDesktopWindow(targetWindow) {
  if (targetWindow.isDestroyed()) return;
  if (targetWindow.isMinimized()) targetWindow.restore();
  targetWindow.show();
  targetWindow.focus();
}

function revealDesktopWindowWhenReady(targetWindow) {
  if (targetWindow.isDestroyed()) return;
  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.once("ready-to-show", () => revealDesktopWindow(targetWindow));
    return;
  }
  revealDesktopWindow(targetWindow);
}

function clampWindowDimension(value, minimum, available) {
  const maximum = Math.max(1, available);
  const effectiveMinimum = Math.min(minimum, maximum);
  return Math.min(Math.max(Math.round(value), effectiveMinimum), maximum);
}

function driveFilePreviewPopoutBrowserWindowOptions() {
  return {
    autoHideMenuBar: true,
    backgroundColor: desktopWindowBackgroundColor(),
    frame: false,
    height: 820,
    minHeight: 640,
    minWidth: 900,
    resizable: true,
    show: false,
    title: "ORF 文件预览",
    width: 1180,
    webPreferences: desktopBrowserWindowWebPreferences(),
  };
}

function resolveDesktopIconPath() {
  if (fs.existsSync(PACKAGED_DESKTOP_ICON_PATH)) return PACKAGED_DESKTOP_ICON_PATH;
  if (fs.existsSync(REPO_ANDROID_LAUNCHER_ICON_PATH)) return REPO_ANDROID_LAUNCHER_ICON_PATH;
  return undefined;
}

function shouldStartHidden() {
  return process.platform === "win32" && process.argv.includes(DESKTOP_LAUNCH_AT_LOGIN_ARG);
}

function desktopLaunchAtLoginUnsupportedReason() {
  if (process.platform !== "win32") return "unsupported_platform";
  if (!app.isPackaged) return "desktop_client_not_installed";
  return null;
}

function desktopLaunchAtLoginSettingsOptions() {
  return {
    args: [DESKTOP_LAUNCH_AT_LOGIN_ARG],
    name: ORF_APP_NAME,
    path: process.execPath,
  };
}

function desktopLaunchAtLoginState() {
  const unsupportedReason = desktopLaunchAtLoginUnsupportedReason();
  if (unsupportedReason) return { status: "unsupported", reason: unsupportedReason };

  try {
    const settings = app.getLoginItemSettings(desktopLaunchAtLoginSettingsOptions());
    return {
      status: "success",
      data: {
        enabled: Boolean(settings.openAtLogin && settings.executableWillLaunchAtLogin !== false),
        promptSeen: readDesktopSettings().launchAtLoginPromptSeen,
        supported: true,
      },
    };
  } catch {
    return { status: "error", reason: "login_item_read_failed" };
  }
}

function setDesktopLaunchAtLoginEnabled(enabled, options = {}) {
  const unsupportedReason = desktopLaunchAtLoginUnsupportedReason();
  if (unsupportedReason) return { status: "unsupported", reason: unsupportedReason };

  try {
    app.setLoginItemSettings({
      ...desktopLaunchAtLoginSettingsOptions(),
      enabled,
      openAtLogin: enabled,
    });
    if (options.markPromptSeen !== false) {
      updateDesktopSettings({ launchAtLoginPromptSeen: true });
    }
    const state = desktopLaunchAtLoginState();
    updateDesktopUnreadState();
    return state.status === "success"
      ? state
      : {
        status: "success",
        data: {
          enabled,
          promptSeen: readDesktopSettings().launchAtLoginPromptSeen,
          supported: true,
        },
      };
  } catch {
    return { status: "error", reason: "login_item_write_failed" };
  }
}

function scheduleDesktopLaunchAtLoginPrompt(targetWindow) {
  if (shouldStartHidden()) return;
  setTimeout(() => {
    void promptDesktopLaunchAtLogin(targetWindow);
  }, DESKTOP_LAUNCH_AT_LOGIN_PROMPT_DELAY_MS);
}

async function promptDesktopLaunchAtLogin(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed() || desktopShellState.isQuitting) return;
  const state = desktopLaunchAtLoginState();
  if (state.status !== "success" || state.data.enabled || state.data.promptSeen) return;

  const response = await dialog.showMessageBox(targetWindow, {
    buttons: ["开启", "暂不启用"],
    cancelId: 1,
    defaultId: 0,
    detail: "开启后，Windows 登录时会自动启动 ORF 并驻留托盘，不会直接弹出主窗口。你之后仍可在个人设置或托盘菜单里关闭。",
    message: "让 ORF 开机后自动启动？",
    noLink: true,
    title: "开机自启",
    type: "question",
  });

  updateDesktopSettings({ launchAtLoginPromptSeen: true });
  if (response.response !== 0) return;

  const result = setDesktopLaunchAtLoginEnabled(true, { markPromptSeen: false });
  if (result.status === "success") return;
  await dialog.showMessageBox(targetWindow, {
    buttons: ["知道了"],
    detail: "请稍后在个人设置或托盘菜单里重新开启。",
    message: "开机自启设置失败",
    noLink: true,
    title: "开机自启",
    type: "error",
  });
}

function desktopSettingsFilePath() {
  return path.join(app.getPath("userData"), DESKTOP_SETTINGS_FILE_NAME);
}

function readDesktopSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(desktopSettingsFilePath(), "utf8"));
    return {
      appearanceMode: normalizeDesktopAppearanceMode(parsed?.appearanceMode) ?? "light",
      launchAtLoginPromptSeen: parsed?.launchAtLoginPromptSeen === true,
    };
  } catch {
    return { appearanceMode: "light", launchAtLoginPromptSeen: false };
  }
}

function updateDesktopSettings(patch) {
  const nextSettings = {
    ...readDesktopSettings(),
    ...patch,
  };
  const filePath = desktopSettingsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({
    appearanceMode: normalizeDesktopAppearanceMode(nextSettings.appearanceMode) ?? "light",
    launchAtLoginPromptSeen: nextSettings.launchAtLoginPromptSeen === true,
  }, null, 2)}\n`);
}

function normalizeDesktopAppearanceMode(input) {
  return input === "dark" || input === "light" ? input : null;
}

function desktopWindowBackgroundColor(appearanceMode = readDesktopSettings().appearanceMode) {
  const normalizedMode = normalizeDesktopAppearanceMode(appearanceMode) ?? "light";
  return DESKTOP_WINDOW_BACKGROUND_COLORS[normalizedMode];
}

function setDesktopAppearanceMode(input) {
  const appearanceMode = normalizeDesktopAppearanceMode(input?.appearanceMode);
  if (!appearanceMode) return { status: "error", reason: "invalid_appearance_mode" };
  updateDesktopSettings({ appearanceMode });
  const backgroundColor = desktopWindowBackgroundColor(appearanceMode);
  for (const desktopWindow of BrowserWindow.getAllWindows()) {
    if (!desktopWindow.isDestroyed()) desktopWindow.setBackgroundColor(backgroundColor);
  }
  return { status: "success", data: { appearanceMode, backgroundColor } };
}

function createDesktopRecoveryState() {
  return {
    automaticReloadCount: 0,
    checkTimer: null,
    recoveryTimer: null,
    stableTimer: null,
    lastReloadAt: 0,
  };
}

function registerDesktopRecoveryHandlers(targetWindow, clientUrl) {
  targetWindow.webContents.on("before-input-event", (event, input) => {
    if (isDesktopReloadShortcut(input)) {
      event.preventDefault();
      reloadDesktopWindow(targetWindow, { resetRecovery: true });
    }
  });

  targetWindow.webContents.on("did-start-loading", () => {
    clearDesktopRecoveryCheck(targetWindow);
  });

  targetWindow.webContents.on("did-finish-load", () => {
    scheduleDesktopRootCheck(targetWindow, clientUrl);
  });

  targetWindow.webContents.on("did-fail-load", (_event, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
    if (isMainFrame === false) return;
    scheduleDesktopRecoveryReload(targetWindow, `main-frame-load-failed:${errorCode}`);
  });

  targetWindow.webContents.on("render-process-gone", (_event, details) => {
    scheduleDesktopRecoveryReload(targetWindow, `renderer-gone:${details?.reason ?? "unknown"}`);
  });

  targetWindow.webContents.on("console-message", (_event, _level, message) => {
    if (!isRecoverableDesktopConsoleMessage(message)) return;
    scheduleDesktopRecoveryReload(targetWindow, "asset-load-failed");
  });
}

function isDesktopReloadShortcut(input) {
  if (!input || input.type !== "keyDown") return false;
  const key = typeof input.key === "string" ? input.key.toLowerCase() : "";
  return key === "f5" || ((input.control || input.meta) && key === "r");
}

function isRecoverableDesktopConsoleMessage(message) {
  if (typeof message !== "string") return false;
  return /Failed to fetch dynamically imported module/i.test(message)
    || /Failed to load module script/i.test(message)
    || /Loading chunk .* failed/i.test(message)
    || /\/assets\/.*\b404\b/i.test(message);
}

function getDesktopRecoveryState(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return null;
  const webContentsId = targetWindow.webContents.id;
  let recoveryState = desktopShellState.recoveryStateByWebContents.get(webContentsId);
  if (!recoveryState) {
    recoveryState = createDesktopRecoveryState();
    desktopShellState.recoveryStateByWebContents.set(webContentsId, recoveryState);
  }
  return recoveryState;
}

function clearDesktopRecoveryCheck(targetWindow) {
  const recoveryState = getDesktopRecoveryState(targetWindow);
  if (!recoveryState || !recoveryState.checkTimer) return;
  clearTimeout(recoveryState.checkTimer);
  recoveryState.checkTimer = null;
}

function clearDesktopRecoveryTimers(targetWindow) {
  const recoveryState = getDesktopRecoveryState(targetWindow);
  clearDesktopRecoveryStateTimers(recoveryState);
}

function clearDesktopRecoveryTimersByWebContentsId(webContentsId) {
  clearDesktopRecoveryStateTimers(desktopShellState.recoveryStateByWebContents.get(webContentsId) ?? null);
}

function clearDesktopRecoveryStateTimers(recoveryState) {
  if (!recoveryState) return;
  if (recoveryState.checkTimer) {
    clearTimeout(recoveryState.checkTimer);
    recoveryState.checkTimer = null;
  }
  if (recoveryState.recoveryTimer) {
    clearTimeout(recoveryState.recoveryTimer);
    recoveryState.recoveryTimer = null;
  }
  if (recoveryState.stableTimer) {
    clearTimeout(recoveryState.stableTimer);
    recoveryState.stableTimer = null;
  }
}

function scheduleDesktopRootCheck(targetWindow, clientUrl) {
  if (!targetWindow || targetWindow.isDestroyed() || desktopShellState.isQuitting) return;
  const recoveryState = getDesktopRecoveryState(targetWindow);
  if (!recoveryState) return;
  clearDesktopRecoveryCheck(targetWindow);
  recoveryState.checkTimer = setTimeout(() => {
    recoveryState.checkTimer = null;
    void checkDesktopRootRendered(targetWindow, clientUrl);
  }, DESKTOP_RECOVERY_ROOT_CHECK_DELAY_MS);
}

async function checkDesktopRootRendered(targetWindow, clientUrl) {
  if (!targetWindow || targetWindow.isDestroyed() || desktopShellState.isQuitting) return;
  if (!isClientWindowUrl(targetWindow.webContents.getURL(), clientUrl)) return;

  let result = null;
  try {
    result = await targetWindow.webContents.executeJavaScript(DESKTOP_RECOVERY_CHECK_SCRIPT, true);
  } catch {
    scheduleDesktopRecoveryReload(targetWindow, "root-check-failed");
    return;
  }

  if (!result || !isClientWindowUrl(result.href, clientUrl)) return;
  if (typeof result.rootChildCount === "number" && result.rootChildCount > 0) {
    scheduleDesktopRecoveryStableReset(targetWindow);
    return;
  }
  scheduleDesktopRecoveryReload(targetWindow, "root-not-mounted");
}

function scheduleDesktopRecoveryStableReset(targetWindow) {
  const recoveryState = getDesktopRecoveryState(targetWindow);
  if (!recoveryState) return;
  if (recoveryState.automaticReloadCount <= 0) return;
  if (recoveryState.stableTimer) clearTimeout(recoveryState.stableTimer);
  recoveryState.stableTimer = setTimeout(() => {
    recoveryState.stableTimer = null;
    recoveryState.automaticReloadCount = 0;
  }, DESKTOP_RECOVERY_STABLE_RESET_DELAY_MS);
}

function scheduleDesktopRecoveryReload(targetWindow, reason) {
  if (!targetWindow || targetWindow.isDestroyed() || desktopShellState.isQuitting) return;
  const recoveryState = getDesktopRecoveryState(targetWindow);
  if (!recoveryState || recoveryState.recoveryTimer) return;
  if (recoveryState.stableTimer) {
    clearTimeout(recoveryState.stableTimer);
    recoveryState.stableTimer = null;
  }

  if (recoveryState.automaticReloadCount >= DESKTOP_RECOVERY_MAX_AUTOMATIC_RELOADS) {
    showDesktopRecoveryFallback(targetWindow, reason);
    return;
  }

  const delay = Math.max(0, DESKTOP_RECOVERY_RELOAD_COOLDOWN_MS - (Date.now() - recoveryState.lastReloadAt));
  recoveryState.recoveryTimer = setTimeout(() => {
    recoveryState.recoveryTimer = null;
    if (!targetWindow || targetWindow.isDestroyed() || desktopShellState.isQuitting) return;
    recoveryState.automaticReloadCount += 1;
    reloadDesktopWindow(targetWindow, { resetRecovery: false });
  }, delay);
}

function reloadDesktopWindow(targetWindow, options = {}) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const recoveryState = getDesktopRecoveryState(targetWindow);
  if (recoveryState) {
    if (options.resetRecovery) recoveryState.automaticReloadCount = 0;
    if (recoveryState.stableTimer) {
      clearTimeout(recoveryState.stableTimer);
      recoveryState.stableTimer = null;
    }
    recoveryState.lastReloadAt = Date.now();
  }
  clearDesktopRecoveryTimers(targetWindow);

  const clientUrl = desktopShellState.clientUrl ?? resolveClientUrl();
  desktopShellState.clientUrl = clientUrl;
  targetWindow.show();
  targetWindow.focus();

  if (isClientWindowUrl(targetWindow.webContents.getURL(), clientUrl)) {
    targetWindow.webContents.reloadIgnoringCache();
    return;
  }
  void targetWindow.loadURL(clientUrl.toString());
}

function showDesktopRecoveryFallback(targetWindow, reason) {
  if (!targetWindow || targetWindow.isDestroyed() || desktopShellState.isQuitting) return;
  clearDesktopRecoveryTimers(targetWindow);
  const clientUrl = desktopShellState.clientUrl ?? resolveClientUrl();
  desktopShellState.clientUrl = clientUrl;
  const fallbackHtml = [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>ORF 加载失败</title>",
    "<style>",
    "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f8fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    "main{width:min(520px,calc(100vw - 48px));border:1px solid #d7dee9;background:#fff;border-radius:8px;padding:28px;box-shadow:0 18px 50px rgba(23,32,51,.12)}",
    "h1{margin:0 0 12px;font-size:22px;line-height:1.3}",
    "p{margin:10px 0 0;font-size:14px;line-height:1.7;color:#526078}",
    "a{display:inline-flex;align-items:center;justify-content:center;margin-top:18px;min-height:38px;padding:0 16px;border-radius:6px;background:#1f6feb;color:#fff;text-decoration:none;font-size:14px;font-weight:600}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#6b7280}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>ORF 页面加载失败</h1>",
    "<p>客户端已经尝试自动恢复，但当前页面仍然没有成功加载。请从托盘菜单选择“刷新 ORF”，或按 Ctrl+R / F5 重新加载。</p>",
    "<p>如果刷新后仍然失败，请安装最新版本客户端。</p>",
    `<a href="${escapeHtmlAttribute(clientUrl.toString())}">重新加载 ORF</a>`,
    `<p><code>${escapeHtmlText(reason)}</code></p>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
  void targetWindow.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
}

function isClientWindowUrl(value, clientUrl) {
  if (typeof value !== "string" || !value) return false;
  try {
    return new URL(value).origin === clientUrl.origin;
  } catch {
    return false;
  }
}

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shouldKeepWindowInTray() {
  return process.platform === "win32" && Boolean(desktopShellState.tray) && !desktopShellState.isQuitting;
}

function createDesktopTray(clientUrl) {
  if (process.platform !== "win32" || desktopShellState.tray) return;
  desktopShellState.clientUrl = clientUrl;
  const tray = new Tray(createDesktopTrayIconImage("normal", false));
  desktopShellState.tray = tray;
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow("/chat"));
  updateDesktopUnreadState();
}

function showMainWindow(targetPath) {
  const clientUrl = desktopShellState.clientUrl ?? resolveClientUrl();
  desktopShellState.clientUrl = clientUrl;
  const currentWindow = desktopShellState.mainWindow;
  const targetWindow = currentWindow && !currentWindow.isDestroyed()
    ? currentWindow
    : createMainWindow(clientUrl, { show: false });
  revealDesktopWindowWhenReady(targetWindow);
  if (isSafeDesktopTargetPath(targetPath)) {
    openDesktopTargetInWindow(targetWindow, targetPath);
  }
  return targetWindow;
}

function showMainWindowFromLaunchArguments(commandLine) {
  const targetPath = desktopTargetPathFromLaunchArguments(commandLine);
  if (targetPath) {
    showMainWindow(targetPath);
    return;
  }

  if (isHiddenDesktopLaunch(commandLine)) return;
  showMainWindow();
}

function desktopTargetPathFromLaunchArguments(commandLine) {
  if (!Array.isArray(commandLine)) return null;
  for (const value of commandLine) {
    const targetPath = desktopToastTargetPathFromActivationArguments(value)
      ?? attentionNotificationTargetPathFromActivationArguments(value)
      ?? chatNotificationTargetPathFromActivationArguments(value);
    if (targetPath) return targetPath;
  }
  return null;
}

function isHiddenDesktopLaunch(commandLine) {
  return Array.isArray(commandLine) && commandLine.includes(DESKTOP_LAUNCH_AT_LOGIN_ARG);
}

function openDesktopTargetInWindow(targetWindow, targetPath) {
  enqueueDesktopTarget(targetWindow, targetPath);
  const sendOpenTarget = () => {
    if (!targetWindow.isDestroyed()) {
      targetWindow.webContents.send("orf:desktop-shell:open-pending");
    }
  };
  if (targetWindow.webContents.isLoading()) {
    targetWindow.webContents.once("did-finish-load", sendOpenTarget);
    return;
  }
  sendOpenTarget();
}

function enqueueDesktopTarget(targetWindow, targetPath) {
  if (!isSafeDesktopTargetPath(targetPath) || targetWindow.isDestroyed()) return;
  const webContentsId = targetWindow.webContents.id;
  const pendingTargets = desktopShellState.pendingDesktopTargetsByWebContents.get(webContentsId) ?? [];
  pendingTargets.push(targetPath);
  desktopShellState.pendingDesktopTargetsByWebContents.set(
    webContentsId,
    pendingTargets.slice(-MAX_PENDING_DESKTOP_TARGETS),
  );
}

function consumePendingDesktopTarget(webContents) {
  if (!webContents || webContents.isDestroyed()) return null;
  const webContentsId = webContents.id;
  const pendingTargets = desktopShellState.pendingDesktopTargetsByWebContents.get(webContentsId) ?? [];
  const targetPath = pendingTargets.shift() ?? null;
  if (pendingTargets.length > 0) {
    desktopShellState.pendingDesktopTargetsByWebContents.set(webContentsId, pendingTargets);
  } else {
    desktopShellState.pendingDesktopTargetsByWebContents.delete(webContentsId);
  }
  return isSafeDesktopTargetPath(targetPath) ? targetPath : null;
}

function requestDesktopAttention(targetWindow) {
  if (process.platform !== "win32") return;
  const windowToFlash = targetWindow && !targetWindow.isDestroyed() ? targetWindow : desktopShellState.mainWindow;
  if (!windowToFlash || windowToFlash.isDestroyed() || windowToFlash.isFocused()) return;
  windowToFlash.flashFrame(true);
}

function requestDesktopAttentionForState(options = {}) {
  if (attentionLevelRank(desktopShellState.attentionState.level) < attentionLevelRank("flash")) return;
  const shouldFlash = options.forceFlash === true || options.attentionIncreased === true || options.levelIncreased === true;
  if (!shouldFlash) return;
  const now = Date.now();
  if (now - desktopShellState.lastAttentionFlashAt < DESKTOP_ATTENTION_FLASH_COOLDOWN_MS) return;
  desktopShellState.lastAttentionFlashAt = now;
  requestDesktopAttention();
}

function setDesktopUnreadCount(unreadCount) {
  setDesktopAttentionState({
    badgeCount: unreadCount,
    body: unreadCount > 0 ? unreadDescription(unreadCount) : "",
    count: unreadCount,
    latestEventId: unreadCount > 0 ? "chat-unread" : null,
    latestTargetPath: unreadCount > 0 ? "/chat" : null,
    level: unreadCount > 0 ? "badge" : "none",
    reason: unreadCount > 0 ? "chat.unread" : null,
    title: unreadCount > 0 ? "聊天消息未读" : "ORF",
    workItemCount: 0,
  });
}

function setDesktopAttentionState(input) {
  const previousState = desktopShellState.attentionState;
  const nextState = normalizeDesktopAttentionInput(input);
  desktopShellState.attentionState = nextState;
  desktopShellState.unreadCount = nextState.badgeCount;
  updateDesktopUnreadState({
    attentionIncreased: nextState.count > previousState.count,
    levelIncreased: attentionLevelRank(nextState.level) > attentionLevelRank(previousState.level),
  });
}

function updateDesktopUnreadState(options = {}) {
  updateTrayUnreadState();
  updateDesktopAttentionIconState();
  const targetWindow = desktopShellState.mainWindow;
  if (process.platform !== "win32" || !targetWindow || targetWindow.isDestroyed()) return;

  const attentionCount = desktopAttentionBadgeCount();
  targetWindow.setOverlayIcon(
    attentionCount > 0 ? createDesktopTaskbarOverlayIconImage(attentionCount) : null,
    attentionCount > 0 ? desktopAttentionDescription(desktopShellState.attentionState) : "",
  );
  if (attentionCount > 0) {
    requestDesktopAttentionForState(options);
    return;
  }

  targetWindow.flashFrame(false);
}

function updateTrayUnreadState() {
  const tray = desktopShellState.tray;
  if (!tray || tray.isDestroyed()) return;
  const attentionState = desktopShellState.attentionState;
  const badgeCount = desktopAttentionBadgeCount();
  const workItemCount = desktopAttentionWorkItemCount();
  const launchAtLoginState = desktopLaunchAtLoginState();
  const menuTemplate = [
    ...(workItemCount > 0 ? [{
      label: `打开待处理提醒（${desktopUnreadBadgeLabel(workItemCount)}）`,
      click: () => showMainWindow(attentionState.latestTargetPath ?? "/chat/system/personalNotifications"),
    }] : []),
    {
      label: workItemCount <= 0 && badgeCount > 0 ? `打开聊天（${desktopUnreadBadgeLabel(badgeCount)}）` : "打开聊天",
      click: () => showMainWindow("/chat"),
    },
    {
      label: "打开我的系统通知",
      click: () => showMainWindow("/chat/system/personalNotifications"),
    },
    {
      label: "打开 ORF",
      click: () => showMainWindow(),
    },
    {
      label: "刷新 ORF",
      click: () => {
        reloadDesktopWindow(showMainWindow(), { resetRecovery: true });
      },
    },
  ];
  if (launchAtLoginState.status === "success") {
    menuTemplate.push({
      checked: launchAtLoginState.data.enabled,
      click: (menuItem) => {
        const result = setDesktopLaunchAtLoginEnabled(Boolean(menuItem.checked));
        if (result.status !== "success") {
          dialog.showErrorBox("开机自启设置失败", "请稍后在个人设置中重试。");
        }
      },
      label: "开机自启",
      type: "checkbox",
    });
  }
  menuTemplate.push(
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        desktopShellState.isQuitting = true;
        app.quit();
      },
    },
  );
  tray.setToolTip(badgeCount > 0 ? `${ORF_APP_NAME} - ${desktopAttentionDescription(attentionState)}` : ORF_APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

function createDesktopTrayIconImage(state, pulse) {
  const image = createDesktopShellIconImage(DESKTOP_TRAY_ICON_BITMAP_SIZE, state, pulse);
  image.setTemplateImage(false);
  return image;
}

function createDesktopTaskbarIconImage(state, pulse) {
  const baseState = state === "attention" && pulse ? "attention" : "normal";
  const image = createDesktopShellIconImage(DESKTOP_TASKBAR_ICON_BITMAP_SIZE, baseState, pulse);
  image.setTemplateImage(false);
  return image;
}

function createDesktopTaskbarOverlayIconImage(unreadCount) {
  return createNativeImageFromRgba(
    DESKTOP_TRAY_ICON_BITMAP_SIZE,
    createUnreadBadgeRgba(
      DESKTOP_TRAY_ICON_BITMAP_SIZE * DESKTOP_ICON_BITMAP_SCALE,
      DESKTOP_TRAY_ICON_BITMAP_SIZE * DESKTOP_ICON_BITMAP_SCALE,
      unreadCount,
    ),
  );
}

function createDesktopShellIconImage(logicalSize, state, pulse) {
  return createNativeImageFromRgba(logicalSize, createDesktopShellIconRgba(
    logicalSize * DESKTOP_ICON_BITMAP_SCALE,
    logicalSize * DESKTOP_ICON_BITMAP_SCALE,
    {
      context: logicalSize === DESKTOP_TRAY_ICON_BITMAP_SIZE ? "tray" : "taskbar",
      pulse,
      state,
      unreadCount: desktopAttentionBadgeCount(),
    },
  ));
}

function desktopAttentionIconVisualState() {
  if (shouldFlashDesktopAttentionIcons()) return "attention";
  return desktopAttentionBadgeCount() > 0 ? "unread" : "normal";
}

function updateDesktopAttentionIconState() {
  if (!shouldFlashDesktopAttentionIcons()) {
    stopDesktopAttentionIconFlash();
    applyDesktopAttentionIconFrame();
    return;
  }
  if (desktopShellState.attentionIconFlashTimer) return;
  desktopShellState.attentionIconFlashHighlighted = false;
  applyDesktopAttentionIconFrame();
  desktopShellState.attentionIconFlashTimer = setInterval(() => {
    desktopShellState.attentionIconFlashHighlighted = !desktopShellState.attentionIconFlashHighlighted;
    applyDesktopAttentionIconFrame();
  }, DESKTOP_ATTENTION_ICON_FLASH_INTERVAL_MS);
  if (typeof desktopShellState.attentionIconFlashTimer.unref === "function") {
    desktopShellState.attentionIconFlashTimer.unref();
  }
}

function stopDesktopAttentionIconFlash() {
  if (desktopShellState.attentionIconFlashTimer) {
    clearInterval(desktopShellState.attentionIconFlashTimer);
    desktopShellState.attentionIconFlashTimer = null;
  }
  desktopShellState.attentionIconFlashHighlighted = false;
}

function shouldFlashDesktopAttentionIcons() {
  return process.platform === "win32"
    && desktopAttentionBadgeCount() > 0
    && attentionLevelRank(desktopShellState.attentionState.level) >= attentionLevelRank("flash");
}

function applyDesktopAttentionIconFrame() {
  const state = desktopAttentionIconVisualState();
  const pulse = state === "attention" && desktopShellState.attentionIconFlashHighlighted;
  const tray = desktopShellState.tray;
  if (tray && !tray.isDestroyed()) {
    tray.setImage(createDesktopTrayIconImage(state, pulse));
  }
  const targetWindow = desktopShellState.mainWindow;
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.setIcon(createDesktopTaskbarIconImage(state, pulse));
  }
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

function desktopAttentionBadgeCount() {
  return normalizeDesktopUnreadInput(desktopShellState.attentionState?.badgeCount ?? desktopShellState.unreadCount);
}

function desktopAttentionWorkItemCount() {
  return normalizeDesktopUnreadInput(desktopShellState.attentionState?.count);
}

function desktopAttentionDescription(attentionState) {
  const badgeCount = normalizeDesktopUnreadInput(attentionState?.badgeCount ?? attentionState?.count);
  const workItemCount = normalizeDesktopUnreadInput(attentionState?.count);
  if (badgeCount <= 0) return "";
  if (workItemCount <= 0) return unreadDescription(badgeCount);
  const label = desktopUnreadBadgeLabel(workItemCount);
  if (attentionState?.level === "urgent") return `${label} 条强提醒待处理`;
  return `${label} 条待处理提醒`;
}

function attentionLevelRank(level) {
  switch (level) {
    case "urgent":
      return 4;
    case "flash":
      return 3;
    case "toast":
      return 2;
    case "badge":
      return 1;
    default:
      return 0;
  }
}

function normalizeDesktopAttentionInput(input) {
  if (!input || typeof input !== "object") return createEmptyDesktopAttentionState();
  const legacyCount = normalizeDesktopUnreadInput(input);
  const badgeCount = normalizeDesktopUnreadInput(input.badgeCount ?? legacyCount);
  const count = normalizeDesktopUnreadInput(input.workItemCount ?? legacyCount);
  const level = normalizeDesktopAttentionLevel(input.level, badgeCount);
  return {
    badgeCount,
    body: notificationText(input.body, 500) || (badgeCount > 0 ? desktopAttentionDescription({ badgeCount, count, level }) : ""),
    count,
    latestEventId: notificationText(input.latestEventId, 160) || null,
    latestTargetPath: isSafeDesktopTargetPath(input.latestTargetPath) ? input.latestTargetPath : null,
    level,
    reason: notificationText(input.reason, 160) || null,
    title: notificationText(input.title, 120) || "ORF",
  };
}

function normalizeDesktopAttentionLevel(level, count) {
  const validLevel = level === "urgent" || level === "flash" || level === "toast" || level === "badge" || level === "none"
    ? level
    : null;
  if (count <= 0) return "none";
  return validLevel && validLevel !== "none" ? validLevel : "badge";
}

function showDesktopToastIntent(input, clientUrl) {
  const payload = desktopToastPayload(input, clientUrl);
  if (!payload) return { status: "not_sent", reason: "invalid_payload" };
  if (!Notification.isSupported()) return { status: "unsupported", reason: "notification_not_supported" };
  const reservation = reserveDesktopToastIntent(payload);
  if (reservation.status !== "success") return reservation;

  const notificationPayload = {
    ...payload,
    avatarImageUri: materializeNotificationAvatar(payload.avatarDataUrl),
  };
  try {
    const notification = new Notification(desktopToastNotificationOptions(notificationPayload));
    if (process.platform !== "win32" || typeof Notification.handleActivation !== "function") {
      notification.on("click", () => {
        showMainWindow(payload.targetPath);
      });
    }
    notification.show();
  } catch (error) {
    console.warn("[ORF desktop] failed to show desktop toast", { eventId: payload.eventId, error: String(error) });
    return { status: "error", reason: "notification_show_failed" };
  }

  if (attentionLevelRank(payload.level) >= attentionLevelRank("flash")) {
    requestDesktopAttentionForState({ forceFlash: true });
  }
  return { status: "success" };
}

function desktopToastPayload(input, clientUrl) {
  if (!input || typeof input !== "object") return null;
  const source = normalizeDesktopToastSource(input.source);
  const eventId = notificationText(input.eventId, 160);
  const title = notificationText(input.title, 120);
  const body = notificationText(input.body, 500);
  const targetPath = notificationText(input.targetPath, 500);
  if (!source || !eventId || !title || !body) return null;
  if (source === "chat" ? !isSafeChatTargetPath(targetPath) : !isSafeDesktopTargetPath(targetPath)) return null;

  const targetUrl = new URL(targetPath, clientUrl);
  if (targetUrl.origin !== clientUrl.origin) return null;

  return {
    avatarDataUrl: normalizeNotificationAvatarDataUrl(input.avatarDataUrl),
    body,
    duration: input.duration === "long" || input.duration === "short"
      ? input.duration
      : source === "chat" ? "short" : undefined,
    eventId,
    level: normalizeDesktopToastLevel(input.level),
    sender: normalizeNotificationSender(input.sender),
    source,
    targetPath: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
    title,
  };
}

function normalizeDesktopToastSource(source) {
  return source === "chat" || source === "notification" || source === "worklog" ? source : null;
}

function normalizeDesktopToastLevel(level) {
  return level === "urgent" || level === "flash" ? level : "toast";
}

function reserveDesktopToastIntent(payload) {
  const fingerprint = desktopToastIntentFingerprint(payload);
  const existingFingerprint = desktopShellState.seenDesktopToastIntentFingerprints.get(payload.eventId);
  if (existingFingerprint === fingerprint) {
    return { status: "not_sent", reason: "duplicate_event" };
  }
  if (existingFingerprint) {
    console.warn("[ORF desktop] desktop toast event id conflict", {
      eventId: payload.eventId,
      source: payload.source,
    });
    return { status: "error", reason: "event_id_conflict" };
  }
  desktopShellState.seenDesktopToastIntentFingerprints.set(payload.eventId, fingerprint);
  desktopShellState.seenDesktopToastIntentIds.push(payload.eventId);
  while (desktopShellState.seenDesktopToastIntentIds.length > MAX_SEEN_DESKTOP_TOAST_INTENTS) {
    const expiredId = desktopShellState.seenDesktopToastIntentIds.shift();
    if (expiredId) desktopShellState.seenDesktopToastIntentFingerprints.delete(expiredId);
  }
  return { status: "success" };
}

function desktopToastIntentFingerprint(payload) {
  return JSON.stringify({
    body: payload.body,
    duration: payload.duration ?? null,
    level: payload.level,
    senderName: payload.sender?.name ?? null,
    senderUserId: payload.sender?.userId ?? null,
    source: payload.source,
    targetPath: payload.targetPath,
    title: payload.title,
  });
}

function desktopToastActivationArguments(targetPath) {
  const params = new URLSearchParams();
  params.set("targetPath", targetPath);
  return `${DESKTOP_TOAST_ACTIVATION_PREFIX}?${params.toString()}`;
}

function desktopToastTargetPathFromActivationArguments(value) {
  if (typeof value !== "string") return null;
  const queryStart = value.indexOf("?");
  if (queryStart < 0 || value.slice(0, queryStart) !== DESKTOP_TOAST_ACTIVATION_PREFIX) return null;
  const params = new URLSearchParams(value.slice(queryStart + 1));
  const targetPath = params.get("targetPath");
  return isSafeDesktopTargetPath(targetPath) ? targetPath : null;
}

function attentionNotificationTargetPathFromActivationArguments(value) {
  if (typeof value !== "string") return null;
  const queryStart = value.indexOf("?");
  if (queryStart < 0 || value.slice(0, queryStart) !== ATTENTION_NOTIFICATION_ACTIVATION_PREFIX) return null;
  const queryParams = new URLSearchParams(value.slice(queryStart + 1));
  const targetPath = queryParams.get("targetPath");
  return isSafeDesktopTargetPath(targetPath) ? targetPath : null;
}

function chatNotificationTargetPathFromActivationArguments(value) {
  if (typeof value !== "string") return null;
  const queryStart = value.indexOf("?");
  if (queryStart < 0 || value.slice(0, queryStart) !== CHAT_NOTIFICATION_ACTIVATION_PREFIX) return null;
  const params = new URLSearchParams(value.slice(queryStart + 1));
  const targetPath = params.get("targetPath");
  return isSafeChatTargetPath(targetPath) ? targetPath : null;
}

function desktopToastNotificationOptions(payload) {
  if (process.platform === "win32") {
    return {
      toastXml: windowsDesktopToastXml(payload),
    };
  }
  return {
    title: payload.title,
    body: payload.body,
    icon: notificationIcon(payload.avatarDataUrl),
    silent: false,
  };
}

function windowsDesktopToastXml(payload) {
  return windowsNotificationToastXml({
    activationArguments: desktopToastActivationArguments(payload.targetPath),
    avatarAlt: payload.sender?.name,
    avatarImageUri: payload.avatarImageUri,
    body: payload.body,
    duration: payload.duration,
    title: payload.title,
  });
}

function isSafeDesktopTargetPath(targetPath) {
  return typeof targetPath === "string"
    && /^\/(?!\/)[\w\-./~%]*(?:\?[^#\s]*)?(?:#[^\s]*)?$/.test(targetPath)
    && !targetPath.startsWith("/api/")
    && !targetPath.startsWith("/auth");
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

function registerDesktopCredentialBridge(clientUrl) {
  ipcMain.handle("orf:credentials:list-accounts", (event) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "error", reason: "untrusted_sender" };
    if (!isDesktopCredentialVaultAvailable()) return { status: "unsupported", reason: "safe_storage_unavailable" };
    return { status: "success", data: { accounts: listDesktopCredentialAccounts() } };
  });

  ipcMain.handle("orf:credentials:save-account", (event, input) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "error", reason: "untrusted_sender" };
    if (!isDesktopCredentialVaultAvailable()) return { status: "unsupported", reason: "safe_storage_unavailable" };
    const credential = desktopCredentialInput(input);
    if (!credential) return { status: "error", reason: "invalid_payload" };
    return { status: "success", data: { accounts: upsertDesktopCredentialAccount(credential) } };
  });

  ipcMain.handle("orf:credentials:get-password", (event, accountId) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "error", reason: "untrusted_sender" };
    if (!isDesktopCredentialVaultAvailable()) return { status: "unsupported", reason: "safe_storage_unavailable" };
    const id = normalizeCredentialEmail(typeof accountId === "string" ? accountId : "");
    if (!id) return { status: "error", reason: "invalid_payload" };
    const password = readDesktopCredentialPassword(id);
    if (typeof password !== "string") return { status: "error", reason: "credential_not_found" };
    return { status: "success", data: { password } };
  });

  ipcMain.handle("orf:credentials:delete-account", (event, accountId) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "error", reason: "untrusted_sender" };
    if (!isDesktopCredentialVaultAvailable()) return { status: "unsupported", reason: "safe_storage_unavailable" };
    const id = normalizeCredentialEmail(typeof accountId === "string" ? accountId : "");
    if (!id) return { status: "error", reason: "invalid_payload" };
    return { status: "success", data: { accounts: deleteDesktopCredentialAccount(id) } };
  });
}

function isDesktopCredentialVaultAvailable() {
  return Boolean(safeStorage?.isEncryptionAvailable?.());
}

function isTrustedDesktopIpcSender(event, clientUrl) {
  const frameUrl = typeof event.senderFrame?.url === "string" ? event.senderFrame.url : "";
  return isClientWindowUrl(frameUrl, clientUrl) || isClientWindowUrl(event.sender?.getURL?.(), clientUrl);
}

function desktopCredentialsFilePath() {
  return path.join(app.getPath("userData"), "credentials", DESKTOP_CREDENTIALS_FILE_NAME);
}

function listDesktopCredentialAccounts() {
  return readDesktopCredentialRecords()
    .map((record) => ({
      displayName: cleanCredentialText(record.displayName),
      email: record.email,
      id: record.id,
      updatedAt: record.updatedAt,
    }))
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
    .slice(0, DESKTOP_CREDENTIALS_MAX_ACCOUNTS);
}

function readDesktopCredentialPassword(accountId) {
  const record = readDesktopCredentialRecords().find((item) => item.id === accountId);
  if (!record) return null;
  try {
    return safeStorage.decryptString(Buffer.from(record.encryptedPassword, "base64"));
  } catch {
    return null;
  }
}

function upsertDesktopCredentialAccount(input) {
  const records = readDesktopCredentialRecords();
  const previous = records.find((record) => record.email === input.email);
  const existing = records.filter((record) => record.email !== input.email);
  const record = {
    displayName: cleanCredentialText(input.displayName) ?? previous?.displayName,
    email: input.email,
    encryptedPassword: safeStorage.encryptString(input.password).toString("base64"),
    id: credentialAccountId(input.email),
    updatedAt: new Date().toISOString(),
  };
  writeDesktopCredentialRecords([record, ...existing].slice(0, DESKTOP_CREDENTIALS_MAX_ACCOUNTS));
  return listDesktopCredentialAccounts();
}

function deleteDesktopCredentialAccount(accountId) {
  writeDesktopCredentialRecords(readDesktopCredentialRecords().filter((record) => record.id !== accountId));
  return listDesktopCredentialAccounts();
}

function readDesktopCredentialRecords() {
  const filePath = desktopCredentialsFilePath();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toDesktopCredentialRecord)
      .filter(Boolean)
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, DESKTOP_CREDENTIALS_MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

function writeDesktopCredentialRecords(records) {
  const filePath = desktopCredentialsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function desktopCredentialInput(input) {
  if (!input || typeof input !== "object") return null;
  const email = normalizeCredentialEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  if (!email || !password) return null;
  return {
    displayName: cleanCredentialText(input.displayName),
    email,
    password,
  };
}

function toDesktopCredentialRecord(value) {
  if (!value || typeof value !== "object") return null;
  const email = normalizeCredentialEmail(value.email);
  const encryptedPassword = typeof value.encryptedPassword === "string" ? value.encryptedPassword : "";
  if (!email || !encryptedPassword) return null;
  return {
    displayName: cleanCredentialText(value.displayName),
    email,
    encryptedPassword,
    id: credentialAccountId(email),
    updatedAt: validIsoDate(value.updatedAt) ?? new Date(0).toISOString(),
  };
}

function credentialAccountId(email) {
  return normalizeCredentialEmail(email);
}

function normalizeCredentialEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function cleanCredentialText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function validIsoDate(value) {
  if (typeof value !== "string" || !value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function notificationText(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeNotificationSender(input) {
  if (!input || typeof input !== "object") return undefined;
  const name = notificationText(input.name, 120);
  if (!name) return undefined;
  return {
    name,
    userId: notificationText(input.userId, 160) || null,
  };
}

function normalizeNotificationAvatarDataUrl(value) {
  return notificationAvatarPngBuffer(value) ? value : null;
}

function notificationAvatarPngBuffer(value) {
  if (typeof value !== "string" || value.length > MAX_NOTIFICATION_AVATAR_DATA_URL_LENGTH) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length === 0 || buffer.length > 750_000) return null;
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return buffer.subarray(0, pngSignature.length).equals(pngSignature) ? buffer : null;
}

function notificationIcon(avatarDataUrl) {
  const avatarBuffer = notificationAvatarPngBuffer(avatarDataUrl);
  if (!avatarBuffer) return resolveDesktopIconPath();
  const image = nativeImage.createFromBuffer(avatarBuffer);
  return image.isEmpty() ? resolveDesktopIconPath() : image;
}

function notificationAvatarCacheDirectory() {
  return path.join(app.getPath("temp"), "orf-notification-avatars");
}

function resetNotificationAvatarCache() {
  const cacheDirectory = notificationAvatarCacheDirectory();
  try {
    fs.rmSync(cacheDirectory, { force: true, recursive: true });
    fs.mkdirSync(cacheDirectory, { mode: 0o700, recursive: true });
    desktopShellState.notificationAvatarFilePaths = [];
  } catch {
    // Avatar cache is a best-effort presentation detail and must never block startup.
  }
}

function materializeNotificationAvatar(avatarDataUrl) {
  if (process.platform !== "win32") return null;
  const avatarBuffer = notificationAvatarPngBuffer(avatarDataUrl);
  if (!avatarBuffer) return null;
  const cacheDirectory = notificationAvatarCacheDirectory();
  const filePath = path.join(cacheDirectory, `${createHash("sha256").update(avatarBuffer).digest("hex")}.png`);
  try {
    fs.mkdirSync(cacheDirectory, { mode: 0o700, recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, avatarBuffer, { mode: 0o600 });
    desktopShellState.notificationAvatarFilePaths = [
      ...desktopShellState.notificationAvatarFilePaths.filter((candidate) => candidate !== filePath),
      filePath,
    ];
    while (desktopShellState.notificationAvatarFilePaths.length > MAX_NOTIFICATION_AVATAR_CACHE_FILES) {
      const expiredPath = desktopShellState.notificationAvatarFilePaths.shift();
      if (expiredPath) fs.rmSync(expiredPath, { force: true });
    }
    return pathToFileURL(filePath).toString();
  } catch {
    return null;
  }
}

function registerNativeNotificationBridge() {
  if (process.platform === "win32" && typeof Notification.handleActivation === "function") {
    Notification.handleActivation((details) => {
      const targetPath = desktopToastTargetPathFromActivationArguments(details?.arguments)
        ?? attentionNotificationTargetPathFromActivationArguments(details?.arguments)
        ?? chatNotificationTargetPathFromActivationArguments(details?.arguments);
      if (targetPath) showMainWindow(targetPath);
    });
  }

  ipcMain.handle("orf:desktop-shell:consume-open-target", (event) => ({
    status: "success",
    targetPath: consumePendingDesktopTarget(event.sender),
  }));
}

function registerDesktopShellBridge(clientUrl) {
  ipcMain.handle("orf:desktop-shell:set-attention-state", (event, input) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "error", reason: "untrusted_sender" };
    setDesktopAttentionState(input);
    return { status: "success", data: desktopShellState.attentionState };
  });
  ipcMain.handle("orf:desktop-shell:show-toast-intent", (event, input) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "not_sent", reason: "untrusted_sender" };
    return showDesktopToastIntent(input, clientUrl);
  });
  ipcMain.handle("orf:desktop-shell:set-chat-unread-count", (event, input) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "error", reason: "untrusted_sender" };
    const unreadCount = normalizeDesktopUnreadInput(input);
    setDesktopUnreadCount(unreadCount);
    return { status: "success", data: unreadCount };
  });
  ipcMain.handle("orf:desktop-shell:set-appearance-mode", (event, input) => {
    if (!isTrustedDesktopIpcSender(event, clientUrl)) return { status: "error", reason: "untrusted_sender" };
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return { status: "unsupported", reason: "window_unavailable" };
    return setDesktopAppearanceMode(input);
  });
  ipcMain.handle("orf:desktop-shell:get-launch-at-login-state", () => desktopLaunchAtLoginState());
  ipcMain.handle("orf:desktop-shell:set-launch-at-login-enabled", (_event, input) => (
    setDesktopLaunchAtLoginEnabled(Boolean(input?.enabled))
  ));
  ipcMain.handle("orf:desktop-shell:set-workbench-zoom-level", (event, input) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return { status: "unsupported", reason: "window_unavailable" };
    const level = normalizeDesktopWorkbenchZoomLevel(input?.level);
    if (level === null) return { status: "error", reason: "invalid_zoom_level" };
    targetWindow.webContents.setZoomLevel(level);
    return { status: "success", data: { level } };
  });
  ipcMain.handle("orf:desktop-shell:get-window-state", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return { status: "unsupported", reason: "window_unavailable" };
    return { status: "success", data: desktopWindowState(targetWindow) };
  });
  ipcMain.handle("orf:desktop-shell:get-system-idle-snapshot", () => (
    { status: "success", data: desktopSystemIdleSnapshot() }
  ));
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

function normalizeDesktopWorkbenchZoomLevel(input) {
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) return null;
  const clamped = Math.max(DESKTOP_WORKBENCH_ZOOM_MIN, Math.min(DESKTOP_WORKBENCH_ZOOM_MAX, numeric));
  return Math.round(clamped * 4) / 4;
}

function desktopWindowState(targetWindow) {
  return {
    isFocused: targetWindow.isFocused(),
    isFullScreen: targetWindow.isFullScreen(),
    isMaximized: targetWindow.isMaximized(),
    isMinimized: targetWindow.isMinimized(),
    isVisible: targetWindow.isVisible(),
  };
}

function desktopSystemIdleSnapshot() {
  try {
    return {
      idleSeconds: Math.max(0, powerMonitor.getSystemIdleTime()),
      state: powerMonitor.getSystemIdleState(DESKTOP_SYSTEM_IDLE_THRESHOLD_SECONDS),
      supported: true,
    };
  } catch {
    return {
      idleSeconds: null,
      state: "unknown",
      supported: false,
    };
  }
}

function sendDesktopWindowState(targetWindow) {
  if (targetWindow.isDestroyed()) return;
  targetWindow.webContents.send("orf:desktop-shell:window-state", desktopWindowState(targetWindow));
}

function isTrustedClientUpdateUrl(value) {
  try {
    const url = new URL(value);
    return isTrustedGitHubReleaseUrl(url) || isTrustedOrfClientUpdateAssetUrl(url);
  } catch {
    return false;
  }
}

function isTrustedGitHubReleaseUrl(url) {
  return (
    url.protocol === "https:" &&
    url.hostname === "github.com" &&
    /^\/xueyu888\/ORF\/releases(?:\/|$)/.test(url.pathname)
  );
}

function isTrustedOrfClientUpdateAssetUrl(url) {
  return (
    url.protocol === "https:" &&
    url.hostname === "orf-xueyu.duckdns.org" &&
    /^\/api\/client-updates\/assets\/[^/]+\/[^/]+$/.test(url.pathname)
  );
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
    if (desktopShellState.clientUpdateInstallInProgress) {
      return { status: "not_sent", reason: "installer_already_running" };
    }
    desktopShellState.clientUpdateInstallInProgress = true;
    const sendProgress = createClientUpdateProgressEmitter(_event.sender, {
      assetName: payload.fileName,
      installId: payload.installId,
    });
    let installerPath;
    try {
      sendProgress({ downloadedBytes: 0, stage: "preparing" });
      installerPath = await downloadClientUpdateInstaller(payload, sendProgress);
    } catch (error) {
      desktopShellState.clientUpdateInstallInProgress = false;
      const message = readableErrorMessage(error);
      sendProgress({ error: message, stage: "failed" });
      return { status: "error", reason: "installer_download_failed", data: message };
    }
    try {
      sendProgress({ percent: 100, stage: "opening" });
      await launchDesktopUpdateInstallerAfterExit(installerPath);
      sendProgress({ percent: 100, stage: "closing" });
      scheduleDesktopQuitForUpdate();
      return { status: "success", reason: "installer_scheduled", data: installerPath };
    } catch (error) {
      desktopShellState.clientUpdateInstallInProgress = false;
      const message = readableErrorMessage(error);
      sendProgress({ error: message, stage: "failed" });
      return { status: "error", reason: "installer_open_failed", data: message };
    }
  });
}

function scheduleDesktopQuitForUpdate() {
  desktopShellState.isQuitting = true;
  const timer = setTimeout(() => app.quit(), 650);
  if (typeof timer.unref === "function") timer.unref();
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
  const installId = typeof input.installId === "string" && input.installId.trim()
    ? input.installId.trim().slice(0, 120)
    : `desktop-update-${Date.now()}`;
  const fileName = sanitizeUpdateInstallerName(input.name, "ORF-update-win11-x64-setup.exe");
  if (!fileName.endsWith(".exe")) return null;
  return { fileName, installId, url };
}

async function downloadClientUpdateInstaller(payload, sendProgress) {
  const updateDir = path.join(app.getPath("temp"), "orf-client-updates");
  fs.mkdirSync(updateDir, { recursive: true });
  const installDir = fs.mkdtempSync(path.join(updateDir, `${sanitizeUpdatePathSegment(payload.installId, "desktop-update")}-`));
  const installerPath = path.join(installDir, payload.fileName);
  const tempPath = path.join(installDir, `${payload.fileName}.download`);

  try {
    const response = await net.fetch(payload.url);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    const totalBytes = parseContentLength(response.headers.get("content-length"));
    sendProgress({ downloadedBytes: 0, stage: "downloading", totalBytes });
    await pipeline(
      Readable.fromWeb(response.body),
      createDownloadProgressStream((downloadedBytes) => {
        sendProgress({ downloadedBytes, stage: "downloading", totalBytes });
      }),
      fs.createWriteStream(tempPath),
    );
    sendProgress({ percent: 100, stage: "downloaded", totalBytes });
    fs.renameSync(tempPath, installerPath);
    removeOtherClientUpdateInstallers(updateDir, installDir);
    return installerPath;
  } catch (error) {
    removeClientUpdateInstallPath(installDir);
    throw error;
  }
}

function createDownloadProgressStream(onProgress) {
  let downloadedBytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      onProgress(downloadedBytes);
      callback(null, chunk);
    },
  });
}

function parseContentLength(value) {
  const length = Number(value);
  return Number.isFinite(length) && length > 0 ? length : null;
}

function createClientUpdateProgressEmitter(webContents, baseProgress) {
  let lastPercent = -1;
  let lastSentAt = 0;
  return (progress) => {
    if (!webContents || webContents.isDestroyed()) return;
    const totalBytes = typeof progress.totalBytes === "number" && progress.totalBytes > 0 ? progress.totalBytes : null;
    const downloadedBytes = typeof progress.downloadedBytes === "number" && progress.downloadedBytes >= 0 ? progress.downloadedBytes : null;
    const percent = typeof progress.percent === "number"
      ? Math.max(0, Math.min(100, progress.percent))
      : totalBytes && downloadedBytes !== null
        ? Math.max(0, Math.min(100, (downloadedBytes / totalBytes) * 100))
        : null;
    const roundedPercent = percent === null ? null : Math.floor(percent);
    const now = Date.now();
    const shouldThrottle = progress.stage === "downloading" && roundedPercent === lastPercent && now - lastSentAt < 250;
    if (shouldThrottle) return;
    lastPercent = roundedPercent ?? lastPercent;
    lastSentAt = now;
    webContents.send("orf:runtime:install-progress", {
      assetName: baseProgress.assetName,
      downloadedBytes,
      error: typeof progress.error === "string" ? progress.error.slice(0, 240) : null,
      installId: baseProgress.installId,
      percent,
      stage: progress.stage,
      totalBytes,
    });
  };
}

function readableErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function sanitizeUpdateInstallerName(value, fallback) {
  const rawName = typeof value === "string" ? path.basename(value.trim()) : "";
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-");
  return safeName || fallback;
}

function sanitizeUpdatePathSegment(value, fallback) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  const safeValue = rawValue
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return safeValue || fallback;
}

function removeOtherClientUpdateInstallers(updateDir, activeInstallDir) {
  const activePath = path.resolve(activeInstallDir);
  try {
    for (const entryName of fs.readdirSync(updateDir)) {
      const entryPath = path.join(updateDir, entryName);
      if (path.resolve(entryPath) === activePath) continue;
      removeClientUpdateInstallPath(entryPath);
    }
  } catch {
    // Temp cache cleanup must not block update downloads.
  }
}

function removeClientUpdateInstallPath(targetPath) {
  try {
    fs.rmSync(targetPath, { force: true, recursive: true });
  } catch {
    // The installer can be temporarily locked by Windows or antivirus; temp cleanup is best effort.
  }
}

app.setName("ORF");
app.setAppUserModelId("org.duckdns.orfxueyu.orf");
configureStableDesktopStoragePaths();
Menu.setApplicationMenu(null);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    showMainWindowFromLaunchArguments(commandLine);
  });

  app.on("before-quit", () => {
    desktopShellState.isQuitting = true;
    stopDesktopAttentionIconFlash();
    if (desktopShellState.tray && !desktopShellState.tray.isDestroyed()) {
      desktopShellState.tray.destroy();
    }
    desktopShellState.tray = null;
  });

  app.whenReady().then(() => {
    const clientUrl = resolveClientUrl();
    const startHidden = shouldStartHidden();
    desktopShellState.clientUrl = clientUrl;
    resetNotificationAvatarCache();
    registerNativeNotificationBridge();
    registerNativeRuntimeBridge();
    registerDesktopShellBridge(clientUrl);
    registerDesktopCredentialBridge(clientUrl);
    createDesktopTray(clientUrl);
    const mainWindow = createMainWindow(clientUrl, { show: !startHidden });
    scheduleDesktopLaunchAtLoginPrompt(mainWindow);

    app.on("activate", () => {
      showMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !desktopShellState.tray) app.quit();
  });
}
