import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { authServiceUnavailablePayload, isAuthServiceUnavailableError } from "../server/auth/errors";
import { authDependencyUnavailablePayload } from "../server/auth/routes";
import { createPgPoolConfig } from "../server/db/connectionOptions";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "../server/db/errors";
import {
  DatabaseSchemaMismatchError,
  databaseSchemaMismatchPayload,
  isDatabaseSchemaMismatchError,
  validateObjectiveOwnedTaskSchema,
} from "../server/db/schemaGuard";
import {
  checkDatabaseHealth,
  createPgPoolConfig as createScriptPgPoolConfig,
  databaseDisplayUrl,
  loadEnvFile,
} from "../scripts/db-connection.mjs";

test("Postgres pool config strips SSL query parameters and applies timeout tuning", () => {
  const config = createPgPoolConfig(
    "postgresql://user:pass@example.com:5432/orf?sslmode=verify-full&sslrootcert=./certs/orf-postgres-root.crt&options=-csearch_path%3Dorf_current%2Cpublic",
    {
      max: 7,
      connectionTimeoutMillis: 3000,
      queryTimeoutMillis: 8000,
      idleTimeoutMillis: 9000,
    },
  );

  assert.equal(config.max, 7);
  assert.equal(config.connectionTimeoutMillis, 3000);
  assert.equal(config.query_timeout, 8000);
  assert.equal(config.statement_timeout, 8000);
  assert.equal(config.idleTimeoutMillis, 9000);
  assert.equal(config.allowExitOnIdle, true);
  assert.ok(String(config.connectionString).includes("options=-csearch_path%3Dorf_current%2Cpublic"));
  assert.equal(String(config.connectionString).includes("sslmode"), false);
  assert.equal(String(config.connectionString).includes("sslrootcert"), false);
});

test("ORF CLI database helper reports missing database configuration", async () => {
  const health = await checkDatabaseHealth({});

  assert.equal(health.ok, false);
  assert.equal(health.message, "missing DATABASE_URL or REMOTE_DATABASE_URL");
  assert.equal(databaseDisplayUrl({}), "DATABASE_URL");
});

test("ORF CLI env loader matches dotenv quote handling", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "orf-env-"));
  const envFile = path.join(directory, ".env");
  const doubleQuotedKey = `ORF_TEST_DOUBLE_QUOTED_${process.pid}`;
  const singleQuotedKey = `ORF_TEST_SINGLE_QUOTED_${process.pid}`;

  delete process.env[doubleQuotedKey];
  delete process.env[singleQuotedKey];
  fs.writeFileSync(
    envFile,
    [
      `${doubleQuotedKey}="postgresql://user:pass@example.com:5432/orf?sslmode=verify-full&options=-csearch_path%3Dorf_current%2Cpublic"`,
      `${singleQuotedKey}='value with spaces'`,
      "",
    ].join("\n"),
  );

  try {
    loadEnvFile(envFile);

    assert.equal(
      process.env[doubleQuotedKey],
      "postgresql://user:pass@example.com:5432/orf?sslmode=verify-full&options=-csearch_path%3Dorf_current%2Cpublic",
    );
    assert.equal(process.env[singleQuotedKey], "value with spaces");
  } finally {
    delete process.env[doubleQuotedKey];
    delete process.env[singleQuotedKey];
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test("ORF CLI database helper strips secrets from display URL", () => {
  const displayUrl = databaseDisplayUrl({
    DATABASE_URL:
      "postgresql://orf_user:secret-pass@example.com:5432/orf?sslmode=verify-full&sslrootcert=./certs/orf-postgres-root.crt",
  });

  assert.equal(displayUrl, "postgresql://orf_user@example.com:5432/orf");
  assert.equal(displayUrl.includes("secret-pass"), false);
});

test("ORF CLI database helper uses the same SSL query handling as verification scripts", () => {
  const config = createScriptPgPoolConfig(
    "postgresql://user:pass@example.com:5432/orf?sslmode=verify-full&sslrootcert=./certs/orf-postgres-root.crt&options=-csearch_path%3Dorf_current%2Cpublic",
    {
      connectionTimeoutMillis: 1234,
      queryTimeoutMillis: 5678,
      idleTimeoutMillis: 9012,
    },
  );

  assert.equal(config.max, 1);
  assert.equal(config.connectionTimeoutMillis, 1234);
  assert.equal(config.query_timeout, 5678);
  assert.equal(config.statement_timeout, 5678);
  assert.equal(config.idleTimeoutMillis, 9012);
  assert.equal(config.allowExitOnIdle, true);
  assert.ok(String(config.connectionString).includes("options=-csearch_path%3Dorf_current%2Cpublic"));
  assert.equal(String(config.connectionString).includes("sslmode"), false);
  assert.equal(String(config.connectionString).includes("sslrootcert"), false);
});

test("database unavailable errors are classified for 503 responses", () => {
  assert.equal(isDatabaseUnavailableError(new Error("connect ETIMEDOUT 203.0.113.10:54321")), true);
  assert.equal(isDatabaseUnavailableError(new Error("remaining connection slots are reserved")), true);
  assert.deepEqual(databaseUnavailablePayload(), { error: "数据服务暂时不可用，请稍后重试。" });
  assert.equal(isDatabaseUnavailableError(new Error("invalid input syntax for type uuid")), false);
});

test("objective-owned task schema guard accepts migrated task ownership contract", () => {
  assert.deepEqual(
    validateObjectiveOwnedTaskSchema({
      columns: [
        { columnName: "linked_objective_id", isNullable: "NO" },
        { columnName: "linked_result_id", isNullable: "YES" },
      ],
      constraints: [
        {
          constraintName: "tasks_linked_result_id_results_id_fk",
          definition: "FOREIGN KEY (linked_result_id) REFERENCES results(id) ON DELETE SET NULL",
        },
      ],
    }),
    [],
  );
});

test("objective-owned task schema guard rejects stale result-owned task schema", () => {
  const details = validateObjectiveOwnedTaskSchema({
    columns: [
      { columnName: "linked_objective_id", isNullable: "NO" },
      { columnName: "linked_result_id", isNullable: "NO" },
    ],
    constraints: [
      {
        constraintName: "tasks_linked_result_id_results_id_fk",
        definition: "FOREIGN KEY (linked_result_id) REFERENCES results(id) ON DELETE CASCADE",
      },
    ],
  });
  const error = new DatabaseSchemaMismatchError(details);

  assert.deepEqual(details, ["tasks.linked_result_id must be nullable.", "tasks.linked_result_id foreign key must use ON DELETE SET NULL."]);
  assert.equal(isDatabaseSchemaMismatchError(error), true);
  assert.equal(error.statusCode, 503);
  assert.deepEqual(databaseSchemaMismatchPayload(error), {
    error: "数据库结构未完成迁移，请先对当前运行时 DATABASE_URL 执行 npm run db:migrate。",
    details,
  });
});

test("auth service unavailable errors are classified for 503 responses", () => {
  assert.equal(isAuthServiceUnavailableError(new Error("Ory login failed with 503")), true);
  assert.equal(isAuthServiceUnavailableError(new Error("fetch failed: ECONNREFUSED 127.0.0.1:4433")), true);
  assert.deepEqual(authServiceUnavailablePayload(), { error: "认证服务暂时不可用，请稍后重试。" });
  assert.equal(isAuthServiceUnavailableError(new Error("Ory login failed with 400")), false);
  assert.equal(isAuthServiceUnavailableError(new Error("Ory login failed with 401")), false);
});

test("auth routes distinguish database outages from credential failures", () => {
  assert.deepEqual(authDependencyUnavailablePayload(new Error("connect ETIMEDOUT 203.0.113.10:54321")), databaseUnavailablePayload());
  assert.deepEqual(authDependencyUnavailablePayload(new Error("Ory login failed with 503")), authServiceUnavailablePayload());
  assert.equal(authDependencyUnavailablePayload(new Error("Ory login failed with 400")), null);
  assert.equal(authDependencyUnavailablePayload(new Error("Ory login failed with 401")), null);
});
