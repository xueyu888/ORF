import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import pg from "pg";

const sslQueryKeys = ["sslmode", "sslcert", "sslkey", "sslrootcert"];

export function loadEnvFile(envFile = ".env") {
  if (!fs.existsSync(envFile)) {
    return;
  }

  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    process.env[key] ??= value;
  }
}

export function createPgPoolConfig(connectionString, tuning = {}) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");
  const rootCertPath = url.searchParams.get("sslrootcert");
  const certPath = url.searchParams.get("sslcert");
  const keyPath = url.searchParams.get("sslkey");
  const hasSslConfig = Boolean(sslMode || rootCertPath || certPath || keyPath);
  const ssl =
    hasSslConfig && sslMode !== "disable"
      ? {
          ca: readSslFile(rootCertPath, "root certificate"),
          cert: readSslFile(certPath, "client certificate"),
          key: readSslFile(keyPath, "client key"),
          rejectUnauthorized: sslMode === "verify-ca" || sslMode === "verify-full" || (!sslMode && Boolean(rootCertPath)),
          ...tlsIdentityOptions(url.hostname),
        }
      : undefined;

  for (const key of sslQueryKeys) {
    url.searchParams.delete(key);
  }

  return {
    connectionString: url.toString(),
    ssl,
    max: tuning.max ?? 1,
    connectionTimeoutMillis: tuning.connectionTimeoutMillis,
    query_timeout: tuning.queryTimeoutMillis,
    statement_timeout: tuning.queryTimeoutMillis,
    idleTimeoutMillis: tuning.idleTimeoutMillis,
    allowExitOnIdle: true,
  };
}

export async function checkDatabaseHealth(env = process.env) {
  const started = Date.now();
  const connectionString = env.DATABASE_URL ?? env.REMOTE_DATABASE_URL;

  if (!connectionString) {
    return {
      ok: false,
      ms: 0,
      message: "missing DATABASE_URL or REMOTE_DATABASE_URL",
    };
  }

  let pool;
  try {
    pool = new pg.Pool(
      createPgPoolConfig(connectionString, {
        max: 1,
        connectionTimeoutMillis: 3000,
        queryTimeoutMillis: 3000,
        idleTimeoutMillis: 1000,
      }),
    );
    await pool.query("select 1");
    return {
      ok: true,
      ms: Date.now() - started,
      message: "ok",
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      message: error?.message ?? String(error),
    };
  } finally {
    await pool?.end().catch(() => {});
  }
}

export function databaseDisplayUrl(env = process.env) {
  const connectionString = env.DATABASE_URL ?? env.REMOTE_DATABASE_URL;
  if (!connectionString) {
    return "DATABASE_URL";
  }

  try {
    const url = new URL(connectionString);
    const user = url.username ? `${decodeURIComponent(url.username)}@` : "";
    return `${url.protocol}//${user}${url.host}${url.pathname}`;
  } catch {
    return "invalid database URL";
  }
}

function resolveFilePath(filePath) {
  if (filePath === "~") {
    return os.homedir();
  }

  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return filePath;
}

function readSslFile(filePath, label) {
  if (!filePath) {
    return undefined;
  }

  const resolvedPath = resolveFilePath(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Database SSL ${label} file does not exist: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath, "utf8");
}

function tlsIdentityOptions(hostname) {
  if (net.isIP(hostname) === 0) {
    return { servername: hostname };
  }

  return {
    checkServerIdentity: (_servername, cert) => tls.checkServerIdentity(hostname, cert),
  };
}
