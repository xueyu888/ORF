import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls, { type ConnectionOptions } from "node:tls";
import type { PoolConfig } from "pg";

type PostgresCredentials = {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
  ssl?: boolean | "require" | "allow" | "prefer" | "verify-full" | ConnectionOptions;
};

type PgPoolTuning = {
  max?: number;
  connectionTimeoutMillis?: number;
  queryTimeoutMillis?: number;
  idleTimeoutMillis?: number;
};

const SSL_QUERY_KEYS = ["sslmode", "sslcert", "sslkey", "sslrootcert"] as const;

function decodeValue(value: string): string | undefined {
  return value ? decodeURIComponent(value) : undefined;
}

function resolveFilePath(filePath: string): string {
  if (filePath === "~") {
    return os.homedir();
  }

  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return filePath;
}

function readSslFile(filePath: string | null, label: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const resolvedPath = resolveFilePath(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Database SSL ${label} file does not exist: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath, "utf8");
}

function tlsIdentityOptions(hostname: string): Pick<ConnectionOptions, "servername" | "checkServerIdentity"> {
  if (net.isIP(hostname) === 0) {
    return { servername: hostname };
  }

  return {
    checkServerIdentity: (_servername, cert) => tls.checkServerIdentity(hostname, cert),
  };
}

function sslOptions(url: URL): ConnectionOptions | undefined {
  const sslMode = url.searchParams.get("sslmode");
  const certPath = url.searchParams.get("sslcert");
  const keyPath = url.searchParams.get("sslkey");
  const rootCertPath = url.searchParams.get("sslrootcert");
  const hasSslConfig = Boolean(sslMode || certPath || keyPath || rootCertPath);

  if (!hasSslConfig || sslMode === "disable") {
    return undefined;
  }

  const ca = readSslFile(rootCertPath, "root certificate");
  const cert = readSslFile(certPath, "client certificate");
  const key = readSslFile(keyPath, "client key");
  const shouldVerify = sslMode === "verify-ca" || sslMode === "verify-full" || (!sslMode && Boolean(ca));

  return {
    ca,
    cert,
    key,
    rejectUnauthorized: shouldVerify,
    ...tlsIdentityOptions(url.hostname),
  };
}

function parsePostgresUrl(connectionString: string) {
  const url = new URL(connectionString);
  const ssl = sslOptions(url);

  return {
    url,
    ssl,
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    user: decodeValue(url.username),
    password: decodeValue(url.password),
    database: decodeValue(url.pathname.replace(/^\//, "")) ?? "",
  };
}

export function createPgPoolConfig(connectionString: string, tuning: PgPoolTuning = {}): PoolConfig {
  const parsed = parsePostgresUrl(connectionString);
  const cleanUrl = new URL(parsed.url);

  for (const key of SSL_QUERY_KEYS) {
    cleanUrl.searchParams.delete(key);
  }

  return {
    connectionString: cleanUrl.toString(),
    ssl: parsed.ssl,
    max: tuning.max,
    connectionTimeoutMillis: tuning.connectionTimeoutMillis,
    query_timeout: tuning.queryTimeoutMillis,
    statement_timeout: tuning.queryTimeoutMillis,
    idleTimeoutMillis: tuning.idleTimeoutMillis,
    allowExitOnIdle: true,
  };
}

export function createDrizzleCredentials(connectionString: string): PostgresCredentials {
  const parsed = parsePostgresUrl(connectionString);

  return {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl: parsed.ssl,
  };
}
