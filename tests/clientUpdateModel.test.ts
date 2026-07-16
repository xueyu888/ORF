import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildClientUpdateDecision,
  compareReleaseVersions,
  isClientReleaseVersion,
  isTrustedClientUpdateUrl,
  selectClientUpdateAsset,
  selectClientUpdateMirrorFallbackUrl,
  toClientReleaseTag,
  type ClientReleaseInfo,
} from "../src/features/client-updates/clientUpdateModel";

const require = createRequire(import.meta.url);
const {
  desktopUpdateInstallerArgs,
  desktopUpdateInstallerLauncherScript,
  desktopUpdateLauncherExecutable,
  launchDesktopUpdateInstallerAfterExit,
} = require("../clients/desktop/update-installer.cjs") as {
  desktopUpdateInstallerArgs: readonly string[];
  desktopUpdateInstallerLauncherScript: (installerPath: string, processId: number) => string;
  desktopUpdateLauncherExecutable: string;
  launchDesktopUpdateInstallerAfterExit: (installerPath: string, processId: number, spawnProcess: (...args: unknown[]) => EventEmitter & { unref: () => void }) => Promise<void>;
};

const release: ClientReleaseInfo = {
  assets: [
    {
      downloadUrl: "https://github.com/xueyu888/ORF/releases/download/v0.0.2/ORF-0.0.2-win11-x64-setup.exe",
      name: "ORF-0.0.2-win11-x64-setup.exe",
    },
    {
      downloadUrl: "https://github.com/xueyu888/ORF/releases/download/v0.0.2/ORF-v0.0.2-android-preview.apk",
      name: "ORF-v0.0.2-android-preview.apk",
    },
  ],
  body: "release notes",
  htmlUrl: "https://github.com/xueyu888/ORF/releases/tag/v0.0.2",
  isDraft: false,
  isPrerelease: false,
  name: "ORF v0.0.2",
  publishedAt: "2026-06-07T08:00:00.000Z",
  tagName: "v0.0.2",
  version: "0.0.2",
};

test("client update version comparison handles tag prefixes and numeric segments", () => {
  assert.equal(compareReleaseVersions("v0.0.10", "0.0.2") > 0, true);
  assert.equal(compareReleaseVersions("v0.0.2", "0.0.2"), 0);
  assert.equal(compareReleaseVersions("0.0.2-beta.1", "0.0.2") < 0, true);
});

test("client update version tags are normalized before GitHub release lookup", () => {
  assert.equal(isClientReleaseVersion("v0.0.2"), true);
  assert.equal(isClientReleaseVersion("0.0.2-beta.1"), true);
  assert.equal(isClientReleaseVersion("latest"), false);
  assert.equal(isClientReleaseVersion("../v0.0.2"), false);
  assert.equal(toClientReleaseTag("0.0.2"), "v0.0.2");
  assert.equal(toClientReleaseTag("v0.0.2"), "v0.0.2");
});

test("client update selects platform-specific release assets", () => {
  assert.equal(selectClientUpdateAsset(release.assets, "desktop-windows")?.name, "ORF-0.0.2-win11-x64-setup.exe");
  assert.equal(selectClientUpdateAsset(release.assets, "android")?.name, "ORF-v0.0.2-android-preview.apk");
  assert.equal(selectClientUpdateAsset(release.assets, "web"), null);
});

test("client update decision requires a newer compatible release", () => {
  const available = buildClientUpdateDecision({
    currentVersion: "0.0.1",
    platform: "desktop-windows",
    release,
  });
  assert.equal(available.status, "available");

  const current = buildClientUpdateDecision({
    currentVersion: "0.0.2",
    platform: "desktop-windows",
    release,
  });
  assert.equal(current.status, "not_newer");

  const web = buildClientUpdateDecision({
    currentVersion: "0.0.1",
    platform: "web",
    release,
  });
  assert.equal(web.status, "unsupported_platform");
});

test("client update external URLs are restricted to ORF assets and GitHub mirrors", () => {
  assert.equal(isTrustedClientUpdateUrl("https://github.com/xueyu888/ORF/releases/tag/v0.0.2"), true);
  assert.equal(
    isTrustedClientUpdateUrl("https://github.com/xueyu888/ORF/releases/download/v0.0.2/ORF-0.0.2-win11-x64-setup.exe"),
    true,
  );
  assert.equal(
    isTrustedClientUpdateUrl("https://orf-xueyu.duckdns.org:8443/api/client-updates/assets/0.0.2/ORF-0.0.2-win11-x64-setup.exe"),
    true,
  );
  assert.equal(isTrustedClientUpdateUrl("https://github.com/xueyu888/Other/releases/tag/v0.0.2"), false);
  assert.equal(isTrustedClientUpdateUrl("https://orf-xueyu.duckdns.org:8443/api/auth/session"), false);
  assert.equal(isTrustedClientUpdateUrl("https://example.com/xueyu888/ORF/releases/tag/v0.0.2"), false);
});

test("client update install falls back to trusted mirror only after native URL rejection", () => {
  const asset = {
    downloadUrl: "https://orf-xueyu.duckdns.org:8443/api/client-updates/assets/0.0.2/ORF-0.0.2-win11-x64-setup.exe",
    mirrorDownloadUrl: "https://github.com/xueyu888/ORF/releases/download/v0.0.2/ORF-0.0.2-win11-x64-setup.exe",
    name: "ORF-0.0.2-win11-x64-setup.exe",
  };

  assert.equal(
    selectClientUpdateMirrorFallbackUrl(asset, {
      attemptedUrl: asset.downloadUrl,
      reason: "invalid_payload",
    }),
    asset.mirrorDownloadUrl,
  );
  assert.equal(
    selectClientUpdateMirrorFallbackUrl(asset, {
      attemptedUrl: asset.downloadUrl,
      reason: "untrusted_url",
    }),
    asset.mirrorDownloadUrl,
  );
  assert.equal(
    selectClientUpdateMirrorFallbackUrl(asset, {
      attemptedUrl: asset.downloadUrl,
      reason: "installer_download_failed",
    }),
    null,
  );
  assert.equal(
    selectClientUpdateMirrorFallbackUrl({ ...asset, mirrorDownloadUrl: "https://example.com/ORF.exe" }, {
      attemptedUrl: asset.downloadUrl,
      reason: "invalid_payload",
    }),
    null,
  );
  assert.equal(
    selectClientUpdateMirrorFallbackUrl({ ...asset, mirrorDownloadUrl: asset.downloadUrl }, {
      attemptedUrl: asset.downloadUrl,
      reason: "invalid_payload",
    }),
    null,
  );
});

test("Win11 update waits for ORF to exit before showing the NSIS installer with progress", async () => {
  const child = new EventEmitter() as EventEmitter & { unref: () => void; unrefCalled?: boolean };
  child.unref = () => {
    child.unrefCalled = true;
  };
  let spawnCall: { args: string[]; file: string; options: Record<string, unknown> } | null = null;
  const spawnProcess = (file: unknown, args: unknown, options: unknown) => {
    spawnCall = { args: args as string[], file: String(file), options: options as Record<string, unknown> };
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  const installDir = mkdtempSync(path.join(tmpdir(), "orf-update-installer-test-"));
  const installerPath = path.join(installDir, "ORF-update.exe");
  const launcherPath = `${installerPath}.4242.handoff.js`;

  await launchDesktopUpdateInstallerAfterExit(installerPath, 4242, spawnProcess);

  assert.deepEqual(desktopUpdateInstallerArgs, ["--updated", "--force-run", "--keep-shortcuts"]);
  const launcherScript = desktopUpdateInstallerLauncherScript(installerPath, 4242);
  assert.deepEqual(spawnCall, {
    args: [
      "//Nologo",
      launcherPath,
    ],
    file: desktopUpdateLauncherExecutable,
    options: { detached: true, stdio: "ignore", windowsHide: true },
  });
  assert.match(launcherScript, /Win32_Process WHERE ProcessId =/);
  assert.match(launcherScript, /shell\.Run\(installerCommand, 1, false\)/);
  assert.doesNotMatch(launcherScript, /\/S/);
  assert.doesNotMatch(launcherScript, /PowerShell/i);
  assert.equal(child.unrefCalled, true);
  assert.equal(readFileSync(launcherPath, "utf8"), launcherScript);
  rmSync(installDir, { force: true, recursive: true });
});

test("Win11 visible installer preserves an unambiguous install scope and restarts completed updates", () => {
  const installerInclude = readFileSync(path.resolve("clients/desktop/installer.nsh"), "utf8");

  assert.match(installerInclude, /!macro customInstallMode/);
  assert.match(installerInclude, /\$hasPerUserInstallation == "1"[\s\S]*\$hasPerMachineInstallation == "0"[\s\S]*\$isForceCurrentInstall "1"/);
  assert.match(installerInclude, /\$hasPerMachineInstallation == "1"[\s\S]*\$hasPerUserInstallation == "0"[\s\S]*\$isForceMachineInstall "1"/);
  assert.match(installerInclude, /!macro customInstall[\s\S]*\$\{isUpdated\}[\s\S]*\$\{StdUtils\.ExecShellAsUser\}[\s\S]*"--updated"[\s\S]*!insertmacro quitSuccess/);
  assert.doesNotMatch(installerInclude, /!insertmacro StartApp/);
  assert.doesNotMatch(installerInclude, /customInstall[\s\S]*\$\{isForceRun\}/);
});
