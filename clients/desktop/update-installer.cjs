const { spawn } = require("node:child_process");

const desktopUpdateInstallerArgs = Object.freeze([
  "/S",
  "--updated",
  "--force-run",
  "--keep-shortcuts",
]);

function launchDesktopUpdateInstaller(installerPath, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(installerPath, [...desktopUpdateInstallerArgs], {
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

module.exports = {
  desktopUpdateInstallerArgs,
  launchDesktopUpdateInstaller,
};
