import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { ORF_AUTH_SESSION_POLICY, ORY_SESSION_LIFESPAN_ENV_NAME } from "../src/domain/authSessionPolicy";
import { createPgPoolConfig } from "../server/db/connectionOptions";

const runtimeDir = path.resolve("ory/.runtime");
const certDir = path.join(runtimeDir, "certs");
const outputFile = path.join(runtimeDir, "ory.env");
const certParams = [
  ["sslcert", "client.crt"],
  ["sslkey", "client.key"],
  ["sslrootcert", "ca.crt"],
] as const;
const oryPoolParams = [
  ["max_conns", "ORY_DATABASE_POOL_MAX", "6"],
  ["max_idle_conns", "ORY_DATABASE_POOL_IDLE_MAX", "2"],
  ["max_conn_idle_time", "ORY_DATABASE_POOL_IDLE_TIME", "5m"],
  ["max_conn_lifetime", "ORY_DATABASE_POOL_CONN_LIFETIME", "30m"],
] as const;

const trimSlash = (value: string) => value.replace(/\/+$/, "");

function databaseUrlFromEnv() {
  const databaseUrl = process.env.ORY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("ORY_DATABASE_URL, DATABASE_URL, or REMOTE_DATABASE_URL is required for Ory");
  }

  return databaseUrl;
}

function databaseProbeUrlFromEnv(databaseUrl: string) {
  return process.env.ORY_DATABASE_PROBE_URL ?? databaseUrl;
}

async function assertOryMigrationPermission(connectionString: string) {
  const pool = new Pool(createPgPoolConfig(connectionString));
  const probeTable = `_orf_ory_migration_probe_${process.pid}`;

  try {
    await pool.query("begin");
    // Probe the configured search_path; deployments may intentionally avoid public.
    await pool.query(`create table ${probeTable} (id text primary key)`);
    await pool.query("rollback");
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);

    if (error && typeof error === "object" && "code" in error && error.code === "42501") {
      throw new Error(
        [
          "Ory is configured to use DATABASE_URL/REMOTE_DATABASE_URL, but this database user cannot run Ory migrations.",
          "Grant CREATE on the configured database schema to the database user, then run npm run ory:dev again.",
        ].join("\n"),
      );
    }

    throw error;
  } finally {
    await pool.end();
  }
}

function applyOryPoolParams(url: URL) {
  for (const [param, envName, defaultValue] of oryPoolParams) {
    const configured = process.env[envName] ?? url.searchParams.get(param) ?? defaultValue;
    url.searchParams.set(param, configured);
  }
}

function envLine(name: string, value: string) {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`Invalid newline in ${name}`);
  }
  return `${name}=${value}`;
}

function appendOryRuntimeEnv(lines: string[]) {
  const publicBaseUrl = trimSlash(process.env.ORY_KRATOS_PUBLIC_BASE_URL ?? process.env.ORY_PUBLIC_URL ?? "http://127.0.0.1:4433");
  const appUrl = trimSlash(process.env.ORY_KRATOS_UI_URL ?? process.env.ORF_APP_URL ?? "http://127.0.0.1:5173");
  const corsOrigins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    ...(process.env.ORY_KRATOS_CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
  const cookieSecret = process.env.ORY_COOKIE_SECRET;
  const cipherSecret = process.env.ORY_CIPHER_SECRET;

  lines.push(envLine("SERVE_PUBLIC_BASE_URL", `${publicBaseUrl}/`));
  lines.push(envLine("SERVE_ADMIN_BASE_URL", "http://127.0.0.1:4434/"));
  lines.push(envLine("SELFSERVICE_DEFAULT_BROWSER_RETURN_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_ALLOWED_RETURN_URLS_0", appUrl));
  lines.push(envLine("SELFSERVICE_FLOWS_ERROR_UI_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_FLOWS_SETTINGS_UI_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_FLOWS_RECOVERY_UI_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_FLOWS_VERIFICATION_UI_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_FLOWS_VERIFICATION_AFTER_DEFAULT_BROWSER_RETURN_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_FLOWS_LOGOUT_AFTER_DEFAULT_BROWSER_RETURN_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_FLOWS_LOGIN_UI_URL", `${appUrl}/auth`));
  lines.push(envLine("SELFSERVICE_FLOWS_REGISTRATION_UI_URL", `${appUrl}/auth`));
  lines.push(envLine(ORY_SESSION_LIFESPAN_ENV_NAME, ORF_AUTH_SESSION_POLICY.oryLifespan));

  corsOrigins.forEach((origin, index) => {
    lines.push(envLine(`SERVE_PUBLIC_CORS_ALLOWED_ORIGINS_${index}`, origin));
  });

  if (cookieSecret) {
    lines.push(envLine("SECRETS_COOKIE_0", cookieSecret));
  }
  if (cipherSecret) {
    lines.push(envLine("SECRETS_CIPHER_0", cipherSecret));
  }
}

async function main() {
  const databaseUrl = databaseUrlFromEnv();
  const url = new URL(databaseUrl);

  await assertOryMigrationPermission(databaseProbeUrlFromEnv(databaseUrl));

  fs.mkdirSync(certDir, { recursive: true });

  for (const [param, filename] of certParams) {
    const source = url.searchParams.get(param);
    if (!source) {
      continue;
    }

    const resolvedSource = source.startsWith("~/") ? path.join(process.env.HOME ?? "", source.slice(2)) : source;
    if (!fs.existsSync(resolvedSource)) {
      throw new Error(`Ory database SSL file does not exist: ${resolvedSource}`);
    }

    const target = path.join(certDir, filename);
    fs.copyFileSync(resolvedSource, target);
    fs.chmodSync(target, 0o644);
    url.searchParams.set(param, `/etc/ory/certs/${filename}`);
  }

  applyOryPoolParams(url);
  const lines = [envLine("DSN", url.toString())];
  appendOryRuntimeEnv(lines);
  fs.writeFileSync(outputFile, `${lines.join("\n")}\n`);
  fs.chmodSync(outputFile, 0o600);

  console.log(`Prepared Ory database environment at ${outputFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
