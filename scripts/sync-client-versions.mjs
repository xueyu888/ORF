import fs from "node:fs";
import path from "node:path";

const rootPackagePath = path.resolve("package.json");
const desktopPackagePath = path.resolve("clients/desktop/package.json");
const androidBuildGradlePath = path.resolve("android/app/build.gradle");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function versionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error(`Unsupported client version: ${version}`);
  const [, major, minor, patch] = match.map(Number);
  return major * 10000 + minor * 100 + patch;
}

const rootPackage = readJson(rootPackagePath);
const version = rootPackage.version;
const code = versionCode(version);

const desktopPackage = readJson(desktopPackagePath);
desktopPackage.version = version;
writeJson(desktopPackagePath, desktopPackage);

const androidBuildGradle = fs.readFileSync(androidBuildGradlePath, "utf8")
  .replace(/versionCode \d+/, `versionCode ${code}`)
  .replace(/versionName "[^"]+"/, `versionName "${version}"`);
fs.writeFileSync(androidBuildGradlePath, androidBuildGradle);

console.log(`Synced client version ${version} (${code}).`);
