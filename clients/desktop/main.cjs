const fs = require("node:fs");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, net, powerMonitor, safeStorage, shell } = require("electron");
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
const MAX_PENDING_CHAT_NOTIFICATION_TARGETS = 16;
const MAX_PENDING_DESKTOP_TARGETS = 16;
const MAX_SEEN_ATTENTION_TOAST_IDS = 128;
const CHAT_NOTIFICATION_ACTIVATION_PREFIX = "orf-chat-notification";
const ATTENTION_NOTIFICATION_ACTIVATION_PREFIX = "orf-attention-notification";
const DESKTOP_ATTENTION_FLASH_COOLDOWN_MS = 12000;
const DESKTOP_RECOVERY_ROOT_CHECK_DELAY_MS = 4000;
const DESKTOP_RECOVERY_RELOAD_COOLDOWN_MS = 8000;
const DESKTOP_RECOVERY_STABLE_RESET_DELAY_MS = 30000;
const DESKTOP_RECOVERY_MAX_AUTOMATIC_RELOADS = 2;
const DESKTOP_CREDENTIALS_MAX_ACCOUNTS = 10;
const DESKTOP_CREDENTIALS_FILE_NAME = "saved-login-accounts.v1.json";
const DESKTOP_SETTINGS_FILE_NAME = "desktop-settings.v1.json";
const DESKTOP_STABLE_DATA_DIR_NAME = "ORF";
const DESKTOP_MAIN_WINDOW_SIZE = Object.freeze({
  height: 900,
  minHeight: 680,
  minWidth: 820,
  width: 1360,
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
  attentionState: createEmptyDesktopAttentionState(),
  clientUrl: null,
  isQuitting: false,
  lastAttentionFlashAt: 0,
  mainWindow: null,
  pendingChatNotificationTargetsByWebContents: new Map(),
  pendingDesktopTargetsByWebContents: new Map(),
  recoveryStateByWebContents: new Map(),
  seenAttentionToastIds: [],
  storagePaths: null,
  tray: null,
  unreadCount: 0,
};

function createEmptyDesktopAttentionState() {
  return {
    body: "",
    count: 0,
    latestEventId: null,
    latestTargetPath: null,
    level: "none",
    reason: null,
    title: "ORF",
    toast: null,
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
    icon: resolveDesktopIconPath(),
    frame: false,
    backgroundColor: "#f6f8fb",
    autoHideMenuBar: true,
    show: options.show !== false,
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
          overrideBrowserWindowOptions: chatImagePopoutBrowserWindowOptions(),
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
    desktopShellState.pendingChatNotificationTargetsByWebContents.delete(webContentsId);
    desktopShellState.pendingDesktopTargetsByWebContents.delete(webContentsId);
    clearDesktopRecoveryTimersByWebContentsId(webContentsId);
    desktopShellState.recoveryStateByWebContents.delete(webContentsId);
    if (desktopShellState.mainWindow === mainWindow) {
      desktopShellState.mainWindow = null;
    }
  });

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

function chatImagePopoutBrowserWindowOptions() {
  return {
    autoHideMenuBar: true,
    backgroundColor: "#f7f8fb",
    frame: false,
    minHeight: 360,
    minWidth: 520,
    resizable: true,
    show: true,
    title: "ORF 图片窗口",
    webPreferences: desktopBrowserWindowWebPreferences(),
  };
}

function driveFilePreviewPopoutBrowserWindowOptions() {
  return {
    autoHideMenuBar: true,
    backgroundColor: "#f7f8fb",
    frame: false,
    height: 820,
    minHeight: 640,
    minWidth: 900,
    resizable: true,
    show: true,
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
      launchAtLoginPromptSeen: parsed?.launchAtLoginPromptSeen === true,
    };
  } catch {
    return { launchAtLoginPromptSeen: false };
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
    launchAtLoginPromptSeen: nextSettings.launchAtLoginPromptSeen === true,
  }, null, 2)}\n`);
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
  const tray = new Tray(createTrayIconImage(desktopAttentionBadgeCount()));
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
    const targetPath = attentionNotificationTargetPathFromActivationArguments(value)
      ?? chatNotificationTargetPathFromActivationArguments(value);
    if (targetPath) return targetPath;
  }
  return null;
}

function isHiddenDesktopLaunch(commandLine) {
  return Array.isArray(commandLine) && commandLine.includes(DESKTOP_LAUNCH_AT_LOGIN_ARG);
}

function openChatTargetInWindow(targetWindow, targetPath) {
  openDesktopTargetInWindow(targetWindow, targetPath);
}

function openDesktopTargetInWindow(targetWindow, targetPath) {
  enqueueDesktopTarget(targetWindow, targetPath);
  if (isSafeChatTargetPath(targetPath)) {
    enqueueChatNotificationTarget(targetWindow, targetPath);
  }
  const sendOpenTarget = () => {
    if (!targetWindow.isDestroyed()) {
      targetWindow.webContents.send("orf:desktop-shell:open-pending");
      if (isSafeChatTargetPath(targetPath)) {
        targetWindow.webContents.send("orf:chat-notification:open-pending");
      }
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

function enqueueChatNotificationTarget(targetWindow, targetPath) {
  if (!isSafeChatTargetPath(targetPath) || targetWindow.isDestroyed()) return;
  const webContentsId = targetWindow.webContents.id;
  const pendingTargets = desktopShellState.pendingChatNotificationTargetsByWebContents.get(webContentsId) ?? [];
  pendingTargets.push(targetPath);
  desktopShellState.pendingChatNotificationTargetsByWebContents.set(
    webContentsId,
    pendingTargets.slice(-MAX_PENDING_CHAT_NOTIFICATION_TARGETS),
  );
}

function consumePendingChatNotificationTarget(webContents) {
  if (!webContents || webContents.isDestroyed()) return null;
  const webContentsId = webContents.id;
  const pendingTargets = desktopShellState.pendingChatNotificationTargetsByWebContents.get(webContentsId) ?? [];
  const targetPath = pendingTargets.shift() ?? null;
  if (pendingTargets.length > 0) {
    desktopShellState.pendingChatNotificationTargetsByWebContents.set(webContentsId, pendingTargets);
  } else {
    desktopShellState.pendingChatNotificationTargetsByWebContents.delete(webContentsId);
  }
  return isSafeChatTargetPath(targetPath) ? targetPath : null;
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
    body: unreadCount > 0 ? unreadDescription(unreadCount) : "",
    count: unreadCount,
    latestEventId: unreadCount > 0 ? "chat-unread" : null,
    latestTargetPath: unreadCount > 0 ? "/chat" : null,
    level: unreadCount > 0 ? "badge" : "none",
    reason: unreadCount > 0 ? "chat.unread" : null,
    title: unreadCount > 0 ? "聊天消息未读" : "ORF",
  });
}

function setDesktopAttentionState(input) {
  const previousState = desktopShellState.attentionState;
  const nextState = normalizeDesktopAttentionInput(input);
  desktopShellState.attentionState = nextState;
  desktopShellState.unreadCount = nextState.count;
  showDesktopAttentionToast(nextState.toast);
  updateDesktopUnreadState({
    attentionIncreased: nextState.count > previousState.count,
    levelIncreased: attentionLevelRank(nextState.level) > attentionLevelRank(previousState.level),
  });
}

function updateDesktopUnreadState(options = {}) {
  updateTrayUnreadState();
  const targetWindow = desktopShellState.mainWindow;
  if (process.platform !== "win32" || !targetWindow || targetWindow.isDestroyed()) return;

  const attentionState = desktopShellState.attentionState;
  const attentionCount = desktopAttentionBadgeCount();
  if (attentionCount > 0) {
    targetWindow.setOverlayIcon(createTaskbarUnreadOverlayImage(attentionCount), desktopAttentionDescription(attentionState));
    requestDesktopAttentionForState(options);
    return;
  }

  targetWindow.setOverlayIcon(null, "");
  targetWindow.flashFrame(false);
}

function updateTrayUnreadState() {
  const tray = desktopShellState.tray;
  if (!tray || tray.isDestroyed()) return;
  const attentionState = desktopShellState.attentionState;
  const attentionCount = desktopAttentionBadgeCount();
  const launchAtLoginState = desktopLaunchAtLoginState();
  const menuTemplate = [
    ...(attentionCount > 0 ? [{
      label: `打开待处理提醒（${desktopUnreadBadgeLabel(attentionCount)}）`,
      click: () => showMainWindow(attentionState.latestTargetPath ?? "/chat/system/personalNotifications"),
    }] : []),
    {
      label: "打开聊天",
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
  tray.setImage(createTrayIconImage(attentionCount));
  tray.setToolTip(attentionCount > 0 ? `${ORF_APP_NAME} - ${desktopAttentionDescription(attentionState)}` : ORF_APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
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

function desktopAttentionBadgeCount() {
  return normalizeDesktopUnreadInput(desktopShellState.attentionState?.count ?? desktopShellState.unreadCount);
}

function desktopAttentionDescription(attentionState) {
  const count = normalizeDesktopUnreadInput(attentionState?.count);
  if (count <= 0) return "";
  const label = desktopUnreadBadgeLabel(count);
  if (attentionState?.level === "urgent") return `${label} 条强提醒待处理`;
  if (typeof attentionState?.reason === "string" && attentionState.reason.startsWith("chat.")) {
    return unreadDescription(count);
  }
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
  const count = normalizeDesktopUnreadInput(input);
  const level = normalizeDesktopAttentionLevel(input.level, count);
  return {
    body: notificationText(input.body, 500) || (count > 0 ? desktopAttentionDescription({ count, level }) : ""),
    count,
    latestEventId: notificationText(input.latestEventId, 160) || null,
    latestTargetPath: isSafeDesktopTargetPath(input.latestTargetPath) ? input.latestTargetPath : null,
    level,
    reason: notificationText(input.reason, 160) || null,
    title: notificationText(input.title, 120) || "ORF",
    toast: normalizeDesktopAttentionToast(input.toast),
  };
}

function normalizeDesktopAttentionToast(input) {
  if (!input || typeof input !== "object" || !isSafeDesktopTargetPath(input.targetPath)) return null;
  const id = notificationText(input.id, 160);
  if (!id) return null;
  return {
    body: notificationText(input.body, 500) || "你有一条新的提醒",
    id,
    level: normalizeDesktopAttentionLevel(input.level, 1),
    targetPath: input.targetPath,
    title: notificationText(input.title, 120) || "ORF 提醒",
  };
}

function normalizeDesktopAttentionLevel(level, count) {
  const validLevel = level === "urgent" || level === "flash" || level === "toast" || level === "badge" || level === "none"
    ? level
    : null;
  if (count <= 0) return "none";
  return validLevel && validLevel !== "none" ? validLevel : "badge";
}

function showDesktopAttentionToast(toast) {
  if (!toast || hasSeenAttentionToast(toast.id)) return;
  const clientUrl = desktopShellState.clientUrl ?? resolveClientUrl();
  const payload = attentionNotificationPayload(toast, clientUrl);
  if (!payload || !Notification.isSupported()) return;
  rememberAttentionToastId(payload.id);

  const notification = new Notification(attentionNotificationOptions(payload));
  if (process.platform !== "win32" || typeof Notification.handleActivation !== "function") {
    notification.on("click", () => {
      showMainWindow(payload.targetPath);
    });
  }
  notification.show();
  if (attentionLevelRank(payload.level) >= attentionLevelRank("flash")) {
    requestDesktopAttentionForState({ forceFlash: true });
  }
}

function hasSeenAttentionToast(id) {
  return desktopShellState.seenAttentionToastIds.includes(id);
}

function rememberAttentionToastId(id) {
  desktopShellState.seenAttentionToastIds.push(id);
  if (desktopShellState.seenAttentionToastIds.length > MAX_SEEN_ATTENTION_TOAST_IDS) {
    desktopShellState.seenAttentionToastIds.splice(
      0,
      desktopShellState.seenAttentionToastIds.length - MAX_SEEN_ATTENTION_TOAST_IDS,
    );
  }
}

function attentionNotificationPayload(input, clientUrl) {
  if (!input || typeof input !== "object") return null;
  const id = notificationText(input.id, 160);
  const title = notificationText(input.title, 120);
  const body = notificationText(input.body, 500);
  const targetPath = notificationText(input.targetPath, 500);
  if (!id || !title || !body || !isSafeDesktopTargetPath(targetPath)) return null;

  const targetUrl = new URL(targetPath, clientUrl);
  if (targetUrl.origin !== clientUrl.origin) return null;

  return {
    body,
    id,
    level: normalizeDesktopAttentionLevel(input.level, 1),
    targetPath: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
    title,
  };
}

function attentionNotificationActivationArguments(targetPath) {
  const params = new URLSearchParams();
  params.set("targetPath", targetPath);
  return `${ATTENTION_NOTIFICATION_ACTIVATION_PREFIX}?${params.toString()}`;
}

function attentionNotificationTargetPathFromActivationArguments(value) {
  if (typeof value !== "string") return null;
  const queryStart = value.indexOf("?");
  if (queryStart < 0 || value.slice(0, queryStart) !== ATTENTION_NOTIFICATION_ACTIVATION_PREFIX) return null;
  const params = new URLSearchParams(value.slice(queryStart + 1));
  const targetPath = params.get("targetPath");
  return isSafeDesktopTargetPath(targetPath) ? targetPath : null;
}

function attentionNotificationOptions(payload) {
  if (process.platform === "win32") {
    return {
      toastXml: windowsAttentionNotificationToastXml(payload),
    };
  }
  return {
    title: payload.title,
    body: payload.body,
    icon: resolveDesktopIconPath(),
    silent: false,
  };
}

function windowsAttentionNotificationToastXml(payload) {
  return [
    `<toast launch="${escapeXmlAttribute(attentionNotificationActivationArguments(payload.targetPath))}">`,
    "<visual>",
    '<binding template="ToastGeneric">',
    `<text>${escapeXmlText(payload.title)}</text>`,
    `<text>${escapeXmlText(payload.body)}</text>`,
    "</binding>",
    "</visual>",
    "</toast>",
  ].join("");
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

function chatNotificationActivationArguments(targetPath) {
  const params = new URLSearchParams();
  params.set("targetPath", targetPath);
  return `${CHAT_NOTIFICATION_ACTIVATION_PREFIX}?${params.toString()}`;
}

function chatNotificationTargetPathFromActivationArguments(value) {
  if (typeof value !== "string") return null;
  const queryStart = value.indexOf("?");
  if (queryStart < 0 || value.slice(0, queryStart) !== CHAT_NOTIFICATION_ACTIVATION_PREFIX) return null;
  const params = new URLSearchParams(value.slice(queryStart + 1));
  const targetPath = params.get("targetPath");
  return isSafeChatTargetPath(targetPath) ? targetPath : null;
}

function chatNotificationOptions(payload) {
  if (process.platform === "win32") {
    return {
      toastXml: windowsChatNotificationToastXml(payload),
    };
  }
  return {
    title: payload.title,
    body: payload.body,
    icon: resolveDesktopIconPath(),
    silent: false,
  };
}

function windowsChatNotificationToastXml(payload) {
  return [
    `<toast launch="${escapeXmlAttribute(chatNotificationActivationArguments(payload.targetPath))}">`,
    "<visual>",
    '<binding template="ToastGeneric">',
    `<text>${escapeXmlText(payload.title)}</text>`,
    `<text>${escapeXmlText(payload.body)}</text>`,
    "</binding>",
    "</visual>",
    "</toast>",
  ].join("");
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function registerNativeNotificationBridge(clientUrl) {
  if (process.platform === "win32" && typeof Notification.handleActivation === "function") {
    Notification.handleActivation((details) => {
      const targetPath = attentionNotificationTargetPathFromActivationArguments(details?.arguments)
        ?? chatNotificationTargetPathFromActivationArguments(details?.arguments);
      if (targetPath) showMainWindow(targetPath);
    });
  }

  ipcMain.handle("orf:desktop-shell:consume-open-target", (event) => ({
    status: "success",
    targetPath: consumePendingDesktopTarget(event.sender),
  }));

  ipcMain.handle("orf:chat-notification:consume-open-target", (event) => ({
    status: "success",
    targetPath: consumePendingChatNotificationTarget(event.sender),
  }));

  ipcMain.handle("orf:chat-notification:show", (event, input) => {
    const payload = chatNotificationPayload(input, clientUrl);
    if (!payload) return { status: "not_sent", reason: "invalid_payload" };
    if (!Notification.isSupported()) return { status: "unsupported", reason: "notification_not_supported" };

    const notification = new Notification(chatNotificationOptions(payload));
    if (process.platform !== "win32" || typeof Notification.handleActivation !== "function") {
      notification.on("click", () => {
        showMainWindow(payload.targetPath);
      });
    }
    notification.show();
    requestDesktopAttention(BrowserWindow.fromWebContents(event.sender));
    return { status: "success" };
  });
}

function registerDesktopShellBridge() {
  ipcMain.handle("orf:desktop-shell:set-attention-state", (_event, input) => {
    setDesktopAttentionState(input);
    return { status: "success", data: desktopShellState.attentionState };
  });
  ipcMain.handle("orf:desktop-shell:set-chat-unread-count", (_event, input) => {
    const unreadCount = normalizeDesktopUnreadInput(input);
    setDesktopUnreadCount(unreadCount);
    return { status: "success", data: unreadCount };
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
    const sendProgress = createClientUpdateProgressEmitter(_event.sender, {
      assetName: payload.fileName,
      installId: payload.installId,
    });
    try {
      sendProgress({ downloadedBytes: 0, stage: "preparing" });
      const installerPath = await downloadClientUpdateInstaller(payload, sendProgress);
      sendProgress({ percent: 100, stage: "opening" });
      const openError = await shell.openPath(installerPath);
      if (openError) {
        sendProgress({ error: openError, stage: "failed" });
        return { status: "error", reason: "installer_open_failed", data: openError };
      }
      sendProgress({ percent: 100, stage: "complete" });
      return { status: "success", data: installerPath };
    } catch (error) {
      const message = readableErrorMessage(error);
      sendProgress({ error: message, stage: "failed" });
      return { status: "error", reason: "installer_download_failed", data: message };
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
    if (desktopShellState.tray && !desktopShellState.tray.isDestroyed()) {
      desktopShellState.tray.destroy();
    }
    desktopShellState.tray = null;
  });

  app.whenReady().then(() => {
    const clientUrl = resolveClientUrl();
    const startHidden = shouldStartHidden();
    desktopShellState.clientUrl = clientUrl;
    registerNativeNotificationBridge(clientUrl);
    registerNativeRuntimeBridge();
    registerDesktopShellBridge();
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
