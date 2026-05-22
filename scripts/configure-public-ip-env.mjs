#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, ".env");

const generatedSecrets = new Set([
  "MINIO_ROOT_PASSWORD",
  "OBJECT_STORAGE_SECRET_KEY",
  "ORY_COOKIE_SECRET",
  "ORY_CIPHER_SECRET",
]);

const weakValues = new Set([
  "",
  "replace-me",
  "replace-with-strong-local-secret",
  "orf-dev-minio-secret",
  "PLEASE-CHANGE-ME-ORF-DEV-COOKIE-SECRET",
  "32-LONG-SECRET-NOT-SECURE-AT-ALL",
]);

async function main() {
  const publicIp = await resolvePublicIp();
  const externalOryPort = readArg("--ory-port") ?? "18443";
  const externalStoragePort = readArg("--storage-port") ?? "19443";

  if (net.isIP(publicIp) === 0) {
    throw new Error(`Invalid public IP: ${publicIp}`);
  }

  const env = readEnvFile(envFile);
  const next = new Map(env.entries);

  set(next, "ORF_PUBLIC_IP", publicIp);
  set(next, "ORY_PUBLIC_EXTERNAL_PORT", externalOryPort);
  set(next, "OBJECT_STORAGE_EXTERNAL_PORT", externalStoragePort);
  set(next, "ORY_PUBLIC_URL", `https://${publicIp}:${externalOryPort}`);
  set(next, "OBJECT_STORAGE_DRIVER", "s3");
  set(next, "OBJECT_STORAGE_ENDPOINT", `https://${publicIp}:${externalStoragePort}`);
  set(next, "ORF_PUBLIC_CA_CERT", path.join(rootDir, "infra", "public-ip", "bootstrap-certs", "fullchain.pem"));
  set(next, "OBJECT_STORAGE_REGION", env.values.OBJECT_STORAGE_REGION ?? "us-east-1");
  set(next, "OBJECT_STORAGE_BUCKET", env.values.OBJECT_STORAGE_BUCKET ?? "orf-comment-attachments");
  set(next, "OBJECT_STORAGE_ACCESS_KEY", env.values.OBJECT_STORAGE_ACCESS_KEY && !weakValues.has(env.values.OBJECT_STORAGE_ACCESS_KEY) ? env.values.OBJECT_STORAGE_ACCESS_KEY : "orf-app");
  set(next, "OBJECT_STORAGE_FORCE_PATH_STYLE", "true");
  set(next, "OBJECT_STORAGE_UPLOAD_MAX_BYTES", env.values.OBJECT_STORAGE_UPLOAD_MAX_BYTES ?? "10485760");
  set(next, "MINIO_ROOT_USER", env.values.MINIO_ROOT_USER && env.values.MINIO_ROOT_USER !== "orf-dev-minio" ? env.values.MINIO_ROOT_USER : "orf-root");

  for (const name of generatedSecrets) {
    const current = env.values[name];
    set(next, name, isUsableSecret(name, current) ? current : randomSecret(name));
  }

  writeEnvFile(envFile, env.lines, next);
  console.log(`Configured public IP endpoints in .env for ${publicIp}.`);
  console.log("Generated or preserved strong Ory and MinIO secrets; values were not printed.");
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

async function resolvePublicIp() {
  const explicit = readArg("--public-ip") ?? process.env.ORF_PUBLIC_IP ?? process.env.PUBLIC_IP;
  if (explicit) {
    return explicit.trim();
  }
  try {
    return await fetchText("https://api.ipify.org");
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(`Could not auto-detect public IP.${detail} Pass it explicitly with --public-ip <ip>.`);
  }
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 5000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve(body.trim());
        } else {
          reject(new Error(`Failed to detect public IP: HTTP ${response.statusCode}`));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Timed out while detecting public IP"));
    });
    request.on("error", reject);
  });
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) {
    return { lines: [], entries: [], values: {} };
  }

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const entries = [];
  const values = {};

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const name = match[1];
    const value = unquoteEnvValue(match[2]);
    entries.push([name, value]);
    values[name] = value;
  }

  return { lines, entries, values };
}

function set(map, name, value) {
  map.set(name, value);
}

function writeEnvFile(file, lines, values) {
  const pending = new Map(values);
  const output = [];
  let changedAny = false;

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      output.push(line);
      continue;
    }

    const name = match[1];
    if (!pending.has(name)) {
      output.push(line);
      continue;
    }

    const value = pending.get(name);
    output.push(`${name}=${quoteEnvValue(value)}`);
    pending.delete(name);
    changedAny = true;
  }

  if (pending.size > 0) {
    if (output.length > 0 && output[output.length - 1] !== "") {
      output.push("");
    }
    output.push("# Public IP shared infrastructure.");
    for (const [name, value] of pending) {
      output.push(`${name}=${quoteEnvValue(value)}`);
    }
    changedAny = true;
  }

  if (!changedAny && fs.existsSync(file)) {
    return;
  }

  fs.writeFileSync(file, `${output.join("\n").replace(/\n+$/, "")}\n`, { mode: 0o600 });
}

function quoteEnvValue(value) {
  if (/^[A-Za-z0-9_./:@%+,\-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
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

function randomSecret(name) {
  if (name === "ORY_CIPHER_SECRET") {
    return crypto.randomBytes(24).toString("base64url").slice(0, 32);
  }

  const bytes = name.startsWith("ORY_") ? 48 : 32;
  return crypto.randomBytes(bytes).toString("base64url");
}

function isUsableSecret(name, value) {
  if (!value || weakValues.has(value)) {
    return false;
  }

  if (name === "ORY_CIPHER_SECRET") {
    return value.length <= 32;
  }

  return true;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
