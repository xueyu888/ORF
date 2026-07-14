const { spawn } = require("node:child_process");

const desktopUpdateInstallerArgs = Object.freeze([
  "--updated",
  "--force-run",
  "--keep-shortcuts",
]);
const desktopUpdateLauncherExecutable = "powershell.exe";
const desktopUpdateLauncherDelayMs = 800;

function desktopUpdateInstallerLauncherScript(installerPath, currentProcessId) {
  const processId = Number(currentProcessId);
  if (!Number.isInteger(processId) || processId <= 0) {
    throw new Error("Invalid ORF process id for update handoff");
  }
  const installerPathLiteral = powershellSingleQuotedLiteral(installerPath);
  const installerArgs = desktopUpdateInstallerArgs
    .map((argument) => powershellSingleQuotedLiteral(argument))
    .join(", ");
  return [
    "$ErrorActionPreference = 'Stop'",
    `Wait-Process -Id ${processId} -ErrorAction SilentlyContinue`,
    `Start-Sleep -Milliseconds ${desktopUpdateLauncherDelayMs}`,
    `Start-Process -FilePath ${installerPathLiteral} -ArgumentList @(${installerArgs})`,
  ].join("; ");
}

function launchDesktopUpdateInstallerAfterExit(
  installerPath,
  currentProcessId = process.pid,
  spawnProcess = spawn,
) {
  const launcherScript = desktopUpdateInstallerLauncherScript(installerPath, currentProcessId);
  return new Promise((resolve, reject) => {
    const child = spawnProcess(desktopUpdateLauncherExecutable, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      launcherScript,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    const handleSpawnError = (error) => reject(error);
    child.once("error", handleSpawnError);
    child.once("spawn", () => {
      child.removeListener("error", handleSpawnError);
      child.on("error", () => undefined);
      child.unref();
      resolve();
    });
  });
}

function powershellSingleQuotedLiteral(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error("Missing update installer path");
  return `'${normalized.replace(/'/g, "''")}'`;
}

module.exports = {
  desktopUpdateInstallerArgs,
  desktopUpdateInstallerLauncherScript,
  desktopUpdateLauncherExecutable,
  launchDesktopUpdateInstallerAfterExit,
};
