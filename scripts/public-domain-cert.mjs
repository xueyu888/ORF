#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, ".env");
const hookAuth = "python3 /opt/orf-certbot-hooks/duckdns-auth.py";
const hookCleanup = "python3 /opt/orf-certbot-hooks/duckdns-cleanup.py";

const composeFiles = [
  "-f",
  "docker-compose.ory.yml",
  "-f",
  "docker-compose.minio.yml",
  "-f",
  "docker-compose.public.yml",
];

function main() {
  const env = readEnvFile(envFile);
  const domainValue = env.ORF_DUCKDNS_DOMAIN ?? process.env.ORF_DUCKDNS_DOMAIN;
  if (!domainValue) {
    throw new Error("ORF_DUCKDNS_DOMAIN is required in .env to issue or renew the DuckDNS certificate.");
  }
  const domain = normalizeDuckDnsDomain(domainValue);
  const token = env.ORF_DUCKDNS_TOKEN ?? process.env.ORF_DUCKDNS_TOKEN ?? env.DUCKDNS_TOKEN ?? process.env.DUCKDNS_TOKEN;

  if (!token) {
    throw new Error("ORF_DUCKDNS_TOKEN is required in .env to issue or renew the DuckDNS certificate.");
  }

  run("node", ["scripts/prepare-public-ip-infra.mjs"], { stdio: "inherit" });

  if (process.argv.includes("--renew")) {
    runDockerCompose([
      "run",
      "--rm",
      "certbot",
      "renew",
      "--cert-name",
      domain,
      "--manual-auth-hook",
      hookAuth,
      "--manual-cleanup-hook",
      hookCleanup,
    ]);
  } else {
    const staging = process.argv.includes("--staging");
    const args = [
      "run",
      "--rm",
      "certbot",
      "certonly",
      "--non-interactive",
      "--agree-tos",
      "--authenticator",
      "manual",
      "--preferred-challenges",
      "dns",
      "--manual-auth-hook",
      hookAuth,
      "--manual-cleanup-hook",
      hookCleanup,
      "--domain",
      domain,
      "--cert-name",
      staging ? `${domain}-staging` : domain,
      "--keep-until-expiring",
    ];

    const email = env.ORF_LETSENCRYPT_EMAIL ?? process.env.ORF_LETSENCRYPT_EMAIL;
    if (email) {
      args.push("--email", email);
    } else {
      args.push("--register-unsafely-without-email");
    }

    if (staging) {
      args.push("--staging");
    }

    runDockerCompose(args);
  }

  makeLetsEncryptDirectoriesTraversable();
  run("node", ["scripts/prepare-public-ip-infra.mjs"], { stdio: "inherit" });
  runDockerCompose(["exec", "-T", "public-gateway", "nginx", "-s", "reload"], { allowFailure: true });
}

function normalizeDuckDnsDomain(value) {
  const domain = value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").toLowerCase();
  if (!domain.endsWith(".duckdns.org")) {
    throw new Error("ORF_DUCKDNS_DOMAIN must end with .duckdns.org");
  }
  return domain;
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

function runDockerCompose(args, options = {}) {
  run("docker", ["compose", ...composeFiles, ...args], options);
}

function makeLetsEncryptDirectoriesTraversable() {
  runDockerCompose([
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    "certbot",
    "-c",
    "find /etc/letsencrypt -type d -exec chmod a+rx {} +",
  ]);
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.stdio ?? "inherit",
    env: process.env,
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
