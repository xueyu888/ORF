import pg from "pg";
import { createPgPoolConfig, loadEnvFile } from "./db-connection.mjs";

loadEnvFile();

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
