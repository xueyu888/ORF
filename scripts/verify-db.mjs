import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const envFile = ".env";

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

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.orf-team to .env first.");
}

const url = new URL(connectionString);
const rootCert = url.searchParams.get("sslrootcert");
const sslMode = url.searchParams.get("sslmode");
const ssl =
  sslMode && sslMode !== "disable"
    ? {
        ca: rootCert ? fs.readFileSync(path.resolve(rootCert), "utf8") : undefined,
        rejectUnauthorized: sslMode === "verify-ca" || sslMode === "verify-full",
        servername: url.hostname,
      }
    : undefined;

for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
  url.searchParams.delete(key);
}

const pool = new pg.Pool({ connectionString: url.toString(), ssl, max: 1 });

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
