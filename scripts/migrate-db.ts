import "dotenv/config";
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { createPgPoolConfig } from "../server/db/connectionOptions";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or REMOTE_DATABASE_URL is required");
}

const pool = new Pool(createPgPoolConfig(databaseUrl));
const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });

async function main() {
  await pool.query(`
    create table if not exists "__drizzle_migrations" (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);

  const applied = await pool.query<{ hash: string }>(`select hash from "__drizzle_migrations"`);
  const appliedHashes = new Set(applied.rows.map((row) => row.hash));
  const pending = migrations.filter((migration) => !appliedHashes.has(migration.hash));

  for (const migration of pending) {
    await pool.query("begin");
    try {
      for (const statement of migration.sql) {
        const sql = statement.trim();
        if (sql) {
          await pool.query(sql);
        }
      }

      await pool.query(`insert into "__drizzle_migrations" (hash, created_at) values ($1, $2)`, [
        migration.hash,
        migration.folderMillis,
      ]);
      await pool.query("commit");
      console.log(`Applied migration ${migration.folderMillis}`);
    } catch (error) {
      await pool.query("rollback").catch(() => undefined);
      throw error;
    }
  }

  console.log(`Database migrations complete. Pending applied: ${pending.length}.`);
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
