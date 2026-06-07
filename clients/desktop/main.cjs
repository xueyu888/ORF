const { app, BrowserWindow, Menu, shell } = require("electron");

const DEFAULT_ORF_CLIENT_URL = "https://orf-xueyu.duckdns.org:8443/";

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
    backgroundColor: "#f6f8fb",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
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

app.setName("ORF");
app.setAppUserModelId("org.duckdns.orfxueyu.orf");
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  const clientUrl = resolveClientUrl();
  createMainWindow(clientUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(clientUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
