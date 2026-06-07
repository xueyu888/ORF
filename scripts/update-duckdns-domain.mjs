#!/usr/bin/env node

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, ".env");

async function main() {
  const env = readEnvFile(envFile);
  const domainValue = env.ORF_DUCKDNS_DOMAIN ?? process.env.ORF_DUCKDNS_DOMAIN;
  if (!domainValue) {
    throw new Error("ORF_DUCKDNS_DOMAIN is required in .env to update DuckDNS.");
  }
  const domain = normalizeDuckDnsDomain(domainValue);
  const token = env.ORF_DUCKDNS_TOKEN ?? process.env.ORF_DUCKDNS_TOKEN;
  const explicitIp = readArg("--ip") ?? env.ORF_PUBLIC_IP ?? process.env.ORF_PUBLIC_IP;

  if (!token) {
    throw new Error("ORF_DUCKDNS_TOKEN is required in .env to update DuckDNS.");
  }

  const subdomain = domain.slice(0, -".duckdns.org".length);
  const query = new URLSearchParams({
    domains: subdomain,
    token,
    verbose: "true",
  });
  if (explicitIp) {
    query.set("ip", explicitIp);
  }

  const body = await fetchText(`https://www.duckdns.org/update?${query.toString()}`);
  if (!body.startsWith("OK")) {
    throw new Error("DuckDNS domain update failed");
  }
  console.log(`Updated DuckDNS domain ${domain}.`);
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

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 20000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve(body.trim());
        } else {
          reject(new Error(`DuckDNS HTTP ${response.statusCode}`));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Timed out while updating DuckDNS"));
    });
    request.on("error", reject);
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
