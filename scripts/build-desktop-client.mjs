import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import "./sync-client-versions.mjs";

const require = createRequire(import.meta.url);
const { encodeRgbaPng, readRgbaPng, resizeRgba } = require("../clients/desktop/rgba-png.cjs");

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orf-desktop-client-"));
const outputDir = path.resolve(repoRoot, "release/desktop");
const electronBuilderCli = path.resolve(repoRoot, "node_modules", "electron-builder", "cli.js");

const appPackage = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "clients/desktop/package.json"), "utf8"));
const iconRendererSource = path.resolve(repoRoot, "clients/desktop/icon-renderer.cjs");
const rgbaPngSource = path.resolve(repoRoot, "clients/desktop/rgba-png.cjs");
const installerIncludeSource = path.resolve(repoRoot, "clients/desktop/installer.nsh");
const mainSource = path.resolve(repoRoot, "clients/desktop/main.cjs");
const notificationRendererSource = path.resolve(repoRoot, "clients/desktop/notification-renderer.cjs");
const preloadSource = path.resolve(repoRoot, "clients/desktop/preload.cjs");
const updateInstallerSource = path.resolve(repoRoot, "clients/desktop/update-installer.cjs");
const desktopAppIconSource = path.resolve(repoRoot, "src/assets/brand/orf-app-icon.png");
const iconRendererTarget = path.resolve(tempRoot, "icon-renderer.cjs");
const rgbaPngTarget = path.resolve(tempRoot, "rgba-png.cjs");
const mainTarget = path.resolve(tempRoot, "main.cjs");
const notificationRendererTarget = path.resolve(tempRoot, "notification-renderer.cjs");
const preloadTarget = path.resolve(tempRoot, "preload.cjs");
const updateInstallerTarget = path.resolve(tempRoot, "update-installer.cjs");
const packageTarget = path.resolve(tempRoot, "package.json");
const configTarget = path.resolve(tempRoot, "electron-builder.json");
const appAssetsTargetDir = path.resolve(tempRoot, "assets");
const buildResourcesTargetDir = path.resolve(tempRoot, "buildResources");
const appIconTarget = path.resolve(appAssetsTargetDir, "icon.png");
const buildIconTarget = path.resolve(buildResourcesTargetDir, "icon.png");
const installerIncludeTarget = path.resolve(buildResourcesTargetDir, "installer.nsh");
const desktopIconSizePx = 256;

const builderConfig = {
  appId: "org.duckdns.orfxueyu.orf",
  productName: "ORF",
  copyright: "Copyright © 2026 ORF",
  electronVersion: rootElectronVersion(),
  directories: {
    buildResources: "buildResources",
    output: outputDir,
  },
  files: [
    "assets/icon.png",
    "icon-renderer.cjs",
    "main.cjs",
    "notification-renderer.cjs",
    "package.json",
    "preload.cjs",
    "rgba-png.cjs",
    "update-installer.cjs",
  ],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  win: {
    icon: "buildResources/icon.png",
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    artifactName: "ORF-${version}-win11-${arch}-setup.${ext}",
    forceCodeSigning: false,
  },
  linux: {
    icon: "buildResources/icon.png",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    include: "buildResources/installer.nsh",
    shortcutName: "ORF",
  },
};

function rootElectronVersion() {
  const rootPackage = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "package.json"), "utf8"));
  const configuredVersion = rootPackage.devDependencies?.electron;
  if (!configuredVersion) throw new Error("Missing electron devDependency in package.json");
  return configuredVersion.replace(/^[^\d]*/, "");
}

function prepareDesktopIcons() {
  if (!fs.existsSync(desktopAppIconSource)) {
    throw new Error(`Missing desktop app icon: ${desktopAppIconSource}. Run npm run client:icons:generate.`);
  }
  fs.mkdirSync(appAssetsTargetDir, { recursive: true });
  fs.mkdirSync(buildResourcesTargetDir, { recursive: true });
  const desktopIcon = createDesktopIconPng(desktopAppIconSource, desktopIconSizePx);
  fs.writeFileSync(appIconTarget, desktopIcon);
  fs.writeFileSync(buildIconTarget, desktopIcon);
}

function createDesktopIconPng(sourcePath, size) {
  const sourcePng = readRgbaPng(fs.readFileSync(sourcePath));
  return encodeRgbaPng(size, size, resizeRgba(sourcePng, size, size));
}

try {
  prepareDesktopIcons();
  fs.copyFileSync(installerIncludeSource, installerIncludeTarget);
  fs.copyFileSync(iconRendererSource, iconRendererTarget);
  fs.copyFileSync(rgbaPngSource, rgbaPngTarget);
  fs.copyFileSync(mainSource, mainTarget);
  fs.copyFileSync(notificationRendererSource, notificationRendererTarget);
  fs.copyFileSync(preloadSource, preloadTarget);
  fs.copyFileSync(updateInstallerSource, updateInstallerTarget);
  fs.writeFileSync(packageTarget, `${JSON.stringify(appPackage, null, 2)}\n`);
  fs.writeFileSync(configTarget, `${JSON.stringify(builderConfig, null, 2)}\n`);

  const result = spawnSync(process.execPath, [
    electronBuilderCli,
    "--projectDir",
    tempRoot,
    "--config",
    configTarget,
    ...process.argv.slice(2),
  ], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
