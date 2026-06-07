import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import "./sync-client-versions.mjs";

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orf-desktop-client-"));
const outputDir = path.resolve(repoRoot, "release/desktop");
const electronBuilderCli = path.resolve(repoRoot, "node_modules", "electron-builder", "cli.js");

const appPackage = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "clients/desktop/package.json"), "utf8"));
const mainSource = path.resolve(repoRoot, "clients/desktop/main.cjs");
const preloadSource = path.resolve(repoRoot, "clients/desktop/preload.cjs");
const androidLauncherIconSource = path.resolve(repoRoot, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png");
const mainTarget = path.resolve(tempRoot, "main.cjs");
const preloadTarget = path.resolve(tempRoot, "preload.cjs");
const packageTarget = path.resolve(tempRoot, "package.json");
const configTarget = path.resolve(tempRoot, "electron-builder.json");
const appAssetsTargetDir = path.resolve(tempRoot, "assets");
const buildResourcesTargetDir = path.resolve(tempRoot, "buildResources");
const appIconTarget = path.resolve(appAssetsTargetDir, "icon.png");
const buildIconTarget = path.resolve(buildResourcesTargetDir, "icon.png");
const winIconTarget = path.resolve(buildResourcesTargetDir, "icon.ico");

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
    "main.cjs",
    "package.json",
    "preload.cjs",
  ],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  win: {
    icon: "buildResources/icon.ico",
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
  if (!fs.existsSync(androidLauncherIconSource)) {
    throw new Error(`Missing Android launcher icon: ${androidLauncherIconSource}`);
  }
  fs.mkdirSync(appAssetsTargetDir, { recursive: true });
  fs.mkdirSync(buildResourcesTargetDir, { recursive: true });
  fs.copyFileSync(androidLauncherIconSource, appIconTarget);
  fs.copyFileSync(androidLauncherIconSource, buildIconTarget);
  writePngIco(androidLauncherIconSource, winIconTarget);
}

function writePngIco(pngPath, icoPath) {
  const png = fs.readFileSync(pngPath);
  const { height, width } = readPngDimensions(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = iconDirectorySizeByte(width);
  entry[1] = iconDirectorySizeByte(height);
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  fs.writeFileSync(icoPath, Buffer.concat([header, entry, png]));
}

function readPngDimensions(png) {
  const signature = "89504e470d0a1a0a";
  if (png.subarray(0, 8).toString("hex") !== signature || png.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("Desktop icon source must be a PNG file.");
  }
  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16),
  };
}

function iconDirectorySizeByte(size) {
  if (size === 256) return 0;
  if (size > 0 && size < 256) return size;
  throw new Error(`Desktop icon PNG dimension must be 1-256 pixels, got ${size}.`);
}

try {
  prepareDesktopIcons();
  fs.copyFileSync(mainSource, mainTarget);
  fs.copyFileSync(preloadSource, preloadTarget);
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
