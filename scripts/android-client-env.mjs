import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function createAndroidClientEnv(baseEnv = process.env) {
  const androidHome = resolveAndroidHome(baseEnv);
  const javaHome = baseEnv.JAVA_HOME || resolveJavaHome(baseEnv);
  const env = {
    ...baseEnv,
    ...(androidHome ? { ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome } : {}),
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    PATH: [
      androidHome ? path.join(androidHome, "platform-tools") : "",
      androidHome ? path.join(androidHome, "emulator") : "",
      androidHome ? path.join(androidHome, "cmdline-tools", "latest", "bin") : "",
      baseEnv.PATH ?? "",
    ].filter(Boolean).join(path.delimiter),
  };
  return {
    androidHome,
    env,
    javaHome,
    paths: {
      avdmanager: androidHome ? path.join(androidHome, "cmdline-tools", "latest", "bin", "avdmanager") : "",
      sdkmanager: androidHome ? path.join(androidHome, "cmdline-tools", "latest", "bin", "sdkmanager") : "",
    },
  };
}

export function resolveAndroidCommand(name, androidEnv = createAndroidClientEnv()) {
  const shellResult = spawnSync("bash", ["-lc", `command -v ${shellQuote(name)}`], {
    encoding: "utf8",
    env: androidEnv.env,
  });
  if (shellResult.status === 0 && shellResult.stdout.trim()) {
    return shellResult.stdout.trim().split(/\r?\n/)[0];
  }
  const androidSdkCandidates = {
    adb: "platform-tools/adb",
    emulator: "emulator/emulator",
    sdkmanager: "cmdline-tools/latest/bin/sdkmanager",
  };
  const relativePath = androidSdkCandidates[name];
  if (!androidEnv.androidHome || !relativePath) return null;
  const candidate = path.join(androidEnv.androidHome, relativePath);
  return fs.existsSync(candidate) ? candidate : null;
}

export function resolveAndroidHome(env = process.env) {
  const configured = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || "";
  if (configured) return configured;
  const defaultSdkRoot = path.join(os.homedir(), "Android", "Sdk");
  return fs.existsSync(defaultSdkRoot) ? defaultSdkRoot : "";
}

export function resolveJavaHome(env = process.env) {
  const result = spawnSync("bash", ["-lc", "readlink -f $(command -v java)"], {
    encoding: "utf8",
    env,
  });
  if (result.status !== 0 || !result.stdout.trim()) return "";
  return path.dirname(path.dirname(result.stdout.trim()));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
