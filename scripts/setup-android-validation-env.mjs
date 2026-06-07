#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createAndroidClientEnv } from "./android-client-env.mjs";

const androidEnv = createAndroidClientEnv();
const sdkRoot = androidEnv.androidHome;
const avdName = process.env.ORF_ANDROID_AVD_NAME || "orf-client-api36";
const systemImage = process.env.ORF_ANDROID_SYSTEM_IMAGE || "system-images;android-36;google_apis;x86_64";

const javaHome = androidEnv.javaHome;
if (!javaHome) {
  fail("JAVA_HOME is not set and Java could not be resolved from PATH.");
}

const env = androidEnv.env;
const sdkmanager = androidEnv.paths.sdkmanager;
const avdmanager = androidEnv.paths.avdmanager;

assertExecutable(sdkmanager, "sdkmanager");
assertExecutable(avdmanager, "avdmanager");

console.log(`Android SDK: ${sdkRoot}`);
console.log(`JAVA_HOME: ${javaHome}`);
console.log(`AVD: ${avdName}`);

runBash(`yes | ${quote(sdkmanager)} --licenses >/dev/null`);
run(sdkmanager, [
  "platform-tools",
  "emulator",
  "platforms;android-36",
  "build-tools;36.0.0",
  systemImage,
]);

const avds = run("emulator", ["-list-avds"], { capture: true }).stdout.split(/\r?\n/).map((value) => value.trim());
if (!avds.includes(avdName)) {
  runBash(`printf 'no\\n' | ${quote(avdmanager)} create avd -n ${quote(avdName)} -k ${quote(systemImage)} --device pixel_6`);
} else {
  console.log(`${avdName} already exists.`);
}

console.log("Android validation environment is prepared.");
console.log("If /dev/kvm exists but the current user is not in group kvm, run: sudo usermod -aG kvm $USER");
console.log("Restart WSL after changing the kvm group membership.");

function assertExecutable(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found at ${filePath}. Install Android command-line tools first.`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed.`);
  }
  return { stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
}

function runBash(script) {
  const result = spawnSync("bash", ["-lc", script], { encoding: "utf8", env, stdio: "inherit" });
  if (result.status !== 0) {
    fail(`bash command failed: ${script}`);
  }
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
