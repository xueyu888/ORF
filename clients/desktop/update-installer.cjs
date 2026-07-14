const { spawn } = require("node:child_process");
const fs = require("node:fs");

const desktopUpdateInstallerArgs = Object.freeze([
  "--updated",
  "--force-run",
  "--keep-shortcuts",
]);
const desktopUpdateLauncherExecutable = "wscript.exe";
const desktopUpdateLauncherDelayMs = 800;
const desktopUpdateLauncherPollIntervalMs = 100;
const desktopUpdateLauncherMaxPolls = 300;

function desktopUpdateInstallerLauncherScript(installerPath, currentProcessId) {
  const processId = Number(currentProcessId);
  if (!Number.isInteger(processId) || processId <= 0) {
    throw new Error("Invalid ORF process id for update handoff");
  }
  const installerCommand = [quoteWindowsCommandArgument(installerPath), ...desktopUpdateInstallerArgs].join(" ");
  return [
    "(function () {",
    `  var processId = ${processId};`,
    `  var installerCommand = ${JSON.stringify(installerCommand)};`,
    '  var locator = new ActiveXObject("WbemScripting.SWbemLocator");',
    '  var service = locator.ConnectServer(".", "root\\\\cimv2");',
    '  var shell = new ActiveXObject("WScript.Shell");',
    '  var fileSystem = new ActiveXObject("Scripting.FileSystemObject");',
    "  function processIsRunning() {",
    '    var query = "SELECT ProcessId FROM Win32_Process WHERE ProcessId = " + processId;',
    "    return !new Enumerator(service.ExecQuery(query)).atEnd();",
    "  }",
    "  var pollCount = 0;",
    `  while (processIsRunning() && pollCount < ${desktopUpdateLauncherMaxPolls}) {`,
    `    WScript.Sleep(${desktopUpdateLauncherPollIntervalMs});`,
    "    pollCount += 1;",
    "  }",
    `  WScript.Sleep(${desktopUpdateLauncherDelayMs});`,
    "  shell.Run(installerCommand, 1, false);",
    "  try { fileSystem.DeleteFile(WScript.ScriptFullName, true); } catch (error) {}",
    "})();",
  ].join("\r\n");
}

function launchDesktopUpdateInstallerAfterExit(
  installerPath,
  currentProcessId = process.pid,
  spawnProcess = spawn,
) {
  const launcherScript = desktopUpdateInstallerLauncherScript(installerPath, currentProcessId);
  const launcherPath = `${installerPath}.${currentProcessId}.handoff.js`;
  fs.writeFileSync(launcherPath, launcherScript, "utf8");
  return new Promise((resolve, reject) => {
    const child = spawnProcess(desktopUpdateLauncherExecutable, [
      "//Nologo",
      launcherPath,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    const handleSpawnError = (error) => {
      removeLauncherFile(launcherPath);
      reject(error);
    };
    child.once("error", handleSpawnError);
    child.once("spawn", () => {
      child.removeListener("error", handleSpawnError);
      child.on("error", () => undefined);
      child.unref();
      resolve();
    });
  });
}

function quoteWindowsCommandArgument(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error("Missing update installer path");
  return `"${normalized.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/, "$1$1")}"`;
}

function removeLauncherFile(launcherPath) {
  try {
    fs.rmSync(launcherPath, { force: true });
  } catch {
    // A failed handoff must preserve the original installer and report the spawn error.
  }
}

module.exports = {
  desktopUpdateInstallerArgs,
  desktopUpdateInstallerLauncherScript,
  desktopUpdateLauncherExecutable,
  launchDesktopUpdateInstallerAfterExit,
};
