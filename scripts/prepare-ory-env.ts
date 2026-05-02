import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { createPgPoolConfig } from "../server/db/connectionOptions";

const runtimeDir = path.resolve("ory/.runtime");
const certDir = path.join(runtimeDir, "certs");
const outputFile = path.join(runtimeDir, "ory.env");
const certParams = [
  ["sslcert", "client.crt"],
  ["sslkey", "client.key"],
  ["sslrootcert", "ca.crt"],
] as const;

const databaseUrl = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or REMOTE_DATABASE_URL is required for Ory");
}

const oryDatabaseUrl = databaseUrl;

async function assertOryMigrationPermission(connectionString: string) {
  const pool = new Pool(createPgPoolConfig(connectionString));
  const probeTable = `public._orf_ory_migration_probe_${process.pid}`;

  try {
    await pool.query("begin");
    await pool.query(`create table ${probeTable} (id text primary key)`);
    await pool.query("rollback");
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);

    if (error && typeof error === "object" && "code" in error && error.code === "42501") {
      throw new Error(
        [
          "Ory is configured to use DATABASE_URL/REMOTE_DATABASE_URL, but this database user cannot run Ory migrations.",
          "Grant CREATE on the public schema to the database user, then run npm run ory:dev again:",
          "GRANT USAGE, CREATE ON SCHEMA public TO <database_user>;",
        ].join("\n"),
      );
    }

    throw error;
  } finally {
    await pool.end();
  }
}

async function main() {
  const url = new URL(oryDatabaseUrl);

  await assertOryMigrationPermission(oryDatabaseUrl);

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

  fs.writeFileSync(outputFile, `DSN=${url.toString()}\n`);
  fs.chmodSync(outputFile, 0o600);

  console.log(`Prepared Ory database environment at ${outputFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
