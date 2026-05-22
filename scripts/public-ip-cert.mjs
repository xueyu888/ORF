#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, ".env");

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
  const publicIp = env.ORF_PUBLIC_IP ?? process.env.ORF_PUBLIC_IP;
  if (!publicIp || net.isIP(publicIp) === 0) {
    throw new Error("ORF_PUBLIC_IP is required. Run `npm run infra:public:env -- --public-ip <ip>` first.");
  }

  run("node", ["scripts/prepare-public-ip-infra.mjs"], { stdio: "inherit" });

  try {
    runDockerCompose(["up", "-d", "acme-http-gateway"]);

    if (process.argv.includes("--renew")) {
      runDockerCompose([
        "run",
        "--rm",
        "certbot",
        "renew",
        "--webroot",
        "--webroot-path",
        "/var/www/certbot",
      ]);
    } else {
      const args = [
        "run",
        "--rm",
        "certbot",
        "certonly",
        "--non-interactive",
        "--agree-tos",
        "--register-unsafely-without-email",
        "--preferred-profile",
        "shortlived",
        "--webroot",
        "--webroot-path",
        "/var/www/certbot",
        "--ip-address",
        publicIp,
        "--keep-until-expiring",
      ];

      if (process.argv.includes("--staging")) {
        args.splice(4, 0, "--staging");
      }

      runDockerCompose(args);
    }
  } finally {
    runDockerCompose(["rm", "-sf", "acme-http-gateway"], { allowFailure: true });
  }

  run("node", ["scripts/prepare-public-ip-infra.mjs"], { stdio: "inherit" });
  runDockerCompose(["exec", "-T", "public-gateway", "nginx", "-s", "reload"], { allowFailure: true });
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
