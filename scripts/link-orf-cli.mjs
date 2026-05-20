#!/usr/bin/env node

import { chmodSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binTarget = resolve(rootDir, "bin", "orf.mjs");
const localBinDir = resolve(homedir(), ".local", "bin");
const commandPath = resolve(localBinDir, process.platform === "win32" ? "orf.cmd" : "orf");

mkdirSync(localBinDir, { recursive: true });
chmodSync(binTarget, 0o755);

if (existsSync(commandPath)) {
  const stat = lstatSync(commandPath);
  const pointsToTarget = stat.isSymbolicLink() && resolve(dirname(commandPath), readlinkSync(commandPath)) === binTarget;
  if (!pointsToTarget) {
    rmSync(commandPath, { force: true });
  }
}

if (!existsSync(commandPath)) {
  if (process.platform === "win32") {
    writeFileSync(commandPath, `@echo off\r\nnode "${binTarget}" %*\r\n`);
  } else {
    symlinkSync(binTarget, commandPath);
  }
}

const pathEntries = (process.env.PATH ?? "").split(delimiter).map((entry) => resolve(entry || "."));
console.log(`linked orf -> ${commandPath}`);
if (!pathEntries.includes(localBinDir)) {
  console.log(`${localBinDir} is not currently in PATH. Add it to your shell profile to run \`orf\` directly.`);
}
