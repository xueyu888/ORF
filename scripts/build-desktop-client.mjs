import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import "./sync-client-versions.mjs";

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orf-desktop-client-"));
const outputDir = path.resolve(repoRoot, "release/desktop");
const electronBuilderBin = path.resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);

const appPackage = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "clients/desktop/package.json"), "utf8"));
const mainSource = path.resolve(repoRoot, "clients/desktop/main.cjs");
const mainTarget = path.resolve(tempRoot, "main.cjs");
const packageTarget = path.resolve(tempRoot, "package.json");
const configTarget = path.resolve(tempRoot, "electron-builder.json");

const builderConfig = {
  appId: "org.duckdns.orfxueyu.orf",
  productName: "ORF",
  copyright: "Copyright © 2026 ORF",
  electronVersion: rootElectronVersion(),
  directories: {
    output: outputDir,
  },
  files: [
    "main.cjs",
    "package.json",
  ],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    artifactName: "ORF-${version}-win11-${arch}-setup.${ext}",
    forceCodeSigning: false,
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

try {
  fs.copyFileSync(mainSource, mainTarget);
  fs.writeFileSync(packageTarget, `${JSON.stringify(appPackage, null, 2)}\n`);
  fs.writeFileSync(configTarget, `${JSON.stringify(builderConfig, null, 2)}\n`);

  const result = spawnSync(electronBuilderBin, [
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
