#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, ".env");
const logFile = path.join(rootDir, ".artifacts", "public-domain-cert-renew.log");
const markerStart = "# ORF public domain certificate renewal: begin";
const markerEnd = "# ORF public domain certificate renewal: end";

function main() {
  const env = readEnvFile(envFile);
  if (!env.ORF_DUCKDNS_TOKEN) {
    throw new Error("ORF_DUCKDNS_TOKEN is required in .env before installing renewal.");
  }

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const current = readCrontab();
  const cleaned = removeExistingBlock(current);
  const nodePath = process.execPath;
  const pathEnv = [
    path.dirname(nodePath),
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ].join(":");
  const renewalCommand = [
    `cd ${shellQuote(rootDir)}`,
    "&&",
    `{ ${shellQuote(nodePath)} scripts/update-duckdns-domain.mjs && ${shellQuote(nodePath)} scripts/public-domain-cert.mjs --renew; }`,
    `>> ${shellQuote(logFile)} 2>&1`,
  ].join(" ");
  const block = [
    markerStart,
    `SHELL=/bin/bash`,
    `PATH=${pathEnv}`,
    `17 3 * * * ${renewalCommand}`,
    markerEnd,
  ].join("\n");
  const next = `${cleaned.trim() ? `${cleaned.trim()}\n\n` : ""}${block}\n`;

  childProcess.execFileSync("crontab", ["-"], { input: next });
  console.log("Installed ORF public domain certificate renewal cron job.");
}

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

function readCrontab() {
  const result = childProcess.spawnSync("crontab", ["-l"], { encoding: "utf8" });
  if (result.status === 0) {
    return result.stdout;
  }
  if (/no crontab for/i.test(result.stderr ?? "")) {
    return "";
  }
  throw new Error(result.stderr || "Failed to read crontab");
}

function removeExistingBlock(value) {
  const lines = value.split(/\r?\n/);
  const output = [];
  let skipping = false;
  for (const line of lines) {
    if (line.trim() === markerStart) {
      skipping = true;
      continue;
    }
    if (line.trim() === markerEnd) {
      skipping = false;
      continue;
    }
    if (!skipping) {
      output.push(line);
    }
  }
  return output.join("\n");
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
