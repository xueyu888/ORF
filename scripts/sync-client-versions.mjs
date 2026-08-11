import fs from "node:fs";
import path from "node:path";

const rootPackagePath = path.resolve("package.json");
const desktopPackagePath = path.resolve("clients/desktop/package.json");
const androidBuildGradlePath = path.resolve("android/app/build.gradle");
const androidVersionSegmentBase = 1_000;
const androidVersionCodeLimit = 2_100_000_000;

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
  if ([major, minor, patch].some((segment) => segment >= androidVersionSegmentBase)) {
    throw new Error(`Android client version segments must stay below ${androidVersionSegmentBase}: ${version}`);
  }
  const code = major * androidVersionSegmentBase ** 2 + minor * androidVersionSegmentBase + patch;
  if (code < 1 || code > androidVersionCodeLimit) {
    throw new Error(`Android versionCode is outside the supported range: ${code}`);
  }
  return code;
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
