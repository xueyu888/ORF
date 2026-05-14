import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import pg from "pg";

const envFile = ".env";
const sslQueryKeys = ["sslmode", "sslcert", "sslkey", "sslrootcert"];

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

function createPgPoolConfig(connectionString) {
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
    max: 1,
  };
}

if (fs.existsSync(envFile)) {
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

const connectionString = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or REMOTE_DATABASE_URL is required.");
}

const pool = new pg.Pool(createPgPoolConfig(connectionString));

try {
  const identity = await pool.query(
    "select current_user as user, current_database() as database, current_schema() as schema",
  );
  const users = await pool.query("select count(*)::int as count from users");

  await pool.query("create table if not exists _orf_team_verify (id text primary key)");
  await pool.query(
    "insert into _orf_team_verify (id) values ($1) on conflict (id) do update set id = excluded.id",
    ["ok"],
  );
  await pool.query("drop table _orf_team_verify");

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...identity.rows[0],
        users: users.rows[0].count,
        ddl: "create/drop table ok",
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
