import assert from "node:assert/strict";
import test from "node:test";
import { authServiceUnavailablePayload, isAuthServiceUnavailableError } from "../server/auth/errors";
import { authDependencyUnavailablePayload } from "../server/auth/routes";
import { createPgPoolConfig } from "../server/db/connectionOptions";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "../server/db/errors";
import {
  checkDatabaseHealth,
  createPgPoolConfig as createScriptPgPoolConfig,
  databaseDisplayUrl,
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

test("auth service unavailable errors are classified for 503 responses", () => {
  assert.equal(isAuthServiceUnavailableError(new Error("Ory login failed with 503")), true);
  assert.equal(isAuthServiceUnavailableError(new Error("fetch failed: ECONNREFUSED 127.0.0.1:4433")), true);
  assert.deepEqual(authServiceUnavailablePayload(), { error: "认证服务暂时不可用，请稍后重试。" });
  assert.equal(isAuthServiceUnavailableError(new Error("Ory login failed with 401")), false);
});

test("auth routes distinguish database outages from credential failures", () => {
  assert.deepEqual(authDependencyUnavailablePayload(new Error("connect ETIMEDOUT 203.0.113.10:54321")), databaseUnavailablePayload());
  assert.deepEqual(authDependencyUnavailablePayload(new Error("Ory login failed with 503")), authServiceUnavailablePayload());
  assert.equal(authDependencyUnavailablePayload(new Error("Ory login failed with 401")), null);
});
