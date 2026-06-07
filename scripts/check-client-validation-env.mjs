#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createAndroidClientEnv, resolveAndroidCommand } from "./android-client-env.mjs";

const strict = process.argv.includes("--strict");
const androidEnv = createAndroidClientEnv();
const androidHome = androidEnv.androidHome;
const javaHome = androidEnv.javaHome;
const commandEnv = androidEnv.env;
const checks = [];

addCheck("node", true, process.version);
addCommandCheck("npm", ["--version"], { required: true });
addCommandCheck("git", ["--version"], { required: true });
addCommandCheck("gh", ["--version"], { required: false, firstLineOnly: true });

const isWsl = os.release().toLowerCase().includes("microsoft") || fs.existsSync("/proc/sys/fs/binfmt_misc/WSLInterop");
addCheck("wsl", isWsl, isWsl ? os.release() : "not running inside WSL");

const kvmExists = fs.existsSync("/dev/kvm");
const groupNames = commandOutput("id", ["-nG"]);
const hasKvmGroup = /\bkvm\b/.test(groupNames);
addCheck("android.kvm.device", kvmExists, kvmExists ? "/dev/kvm exists" : "/dev/kvm missing");
addCheck("android.kvm.group", hasKvmGroup, hasKvmGroup ? "current user is in kvm group" : `groups: ${groupNames || "unknown"}`, isWsl && kvmExists);

addCommandCheck("java", ["-version"], { required: true, stderr: true, firstLineOnly: true });
addCheck("java.home", Boolean(javaHome), process.env.JAVA_HOME ? javaHome : javaHome ? `derived ${javaHome}` : "JAVA_HOME not set", false);
addCheck("android.sdk.home", Boolean(androidHome), process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ? androidHome : androidHome ? `default ${androidHome}` : "ANDROID_HOME/ANDROID_SDK_ROOT not set");
addCommandCheck("adb", ["version"], { required: true, firstLineOnly: true });
addCommandCheck("emulator", ["-version"], { required: true, firstLineOnly: true });
addCommandCheck("sdkmanager", ["--version"], { required: true, firstLineOnly: true });

if (commandExists("adb")) {
  addSection("adb.devices", commandOutput("adb", ["devices"]).trim() || "no adb output");
}

if (commandExists("emulator")) {
  addSection("android.avd", commandOutput("emulator", ["-list-avds"]).trim() || "no AVD configured");
}

printChecks();

const strictFailures = checks.filter((check) => check.required && !check.ok);
if (strict && strictFailures.length > 0) {
  process.exitCode = 1;
}

function addCommandCheck(name, args, options = {}) {
  if (!commandExists(name)) {
    addCheck(name, false, `${name} not found in PATH`, options.required);
    return;
  }
  const result = runCommand(name, args);
  const output = options.stderr ? result.stderr || result.stdout : result.stdout || result.stderr;
  const detail = options.firstLineOnly ? firstLine(output) : output.trim();
  addCheck(name, result.status === 0, detail || `exit ${result.status}`, options.required);
}

function addCheck(name, ok, detail, required = false) {
  checks.push({ detail, name, ok, required });
}

function addSection(name, detail) {
  checks.push({ detail, name, ok: true, required: false, section: true });
}

function commandExists(name) {
  return Boolean(resolveCommand(name));
}

function commandOutput(command, args, options = {}) {
  const result = runCommand(command, args);
  const value = options.stderr ? result.stderr || result.stdout : result.stdout || result.stderr;
  return value ?? "";
}

function runCommand(command, args) {
  const commandPath = resolveCommand(command) ?? command;
  const result = spawnSync(commandPath, args, { encoding: "utf8", env: commandEnv });
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function resolveCommand(name) {
  const shellResult = spawnSync("bash", ["-lc", `command -v ${shellQuote(name)}`], { encoding: "utf8", env: commandEnv });
  if (shellResult.status === 0 && shellResult.stdout.trim()) {
    return shellResult.stdout.trim().split(/\r?\n/)[0];
  }
  return resolveAndroidCommand(name, androidEnv);
}

function firstLine(value) {
  return value.trim().split(/\r?\n/)[0] ?? "";
}

function printChecks() {
  console.log("ORF client validation environment");
  for (const check of checks) {
    const marker = check.ok ? "OK" : check.required ? "MISS" : "WARN";
    console.log(`[${marker}] ${check.name}: ${singleLine(check.detail)}`);
  }
  if (!strict) {
    console.log("Run with --strict to return a non-zero exit code when required Android emulator tools are missing.");
  }
}

function singleLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
