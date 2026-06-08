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
