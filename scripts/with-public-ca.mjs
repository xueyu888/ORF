#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, ".env");
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/with-public-ca.mjs <command> [args...]");
  process.exit(1);
}

const env = { ...process.env };
const fileEnv = readEnvFile(envFile);
const publicCaCert = env.ORF_PUBLIC_CA_CERT ?? fileEnv.ORF_PUBLIC_CA_CERT;
const localBin = path.join(rootDir, "node_modules", ".bin");

if (!env.NODE_EXTRA_CA_CERTS && publicCaCert && fs.existsSync(publicCaCert)) {
  env.NODE_EXTRA_CA_CERTS = publicCaCert;
}

env.PATH = [localBin, env.PATH].filter(Boolean).join(path.delimiter);

const child = spawn(args[0], args.slice(1), {
  cwd: rootDir,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

function readEnvFile(file) {
  if (!fs.existsSync(file)) {
    return {};
  }

  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    values[match[1]] = unquoteEnvValue(match[2]);
  }
  return values;
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return value;
}
