import assert from "node:assert/strict";
import test from "node:test";
import { authServiceUnavailablePayload, isAuthServiceUnavailableError } from "../server/auth/errors";
import { createPgPoolConfig } from "../server/db/connectionOptions";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "../server/db/errors";

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
  assert.ok(String(config.connectionString).includes("options=-csearch_path%3Dorf_current%2Cpublic"));
  assert.equal(String(config.connectionString).includes("sslmode"), false);
  assert.equal(String(config.connectionString).includes("sslrootcert"), false);
});

test("database unavailable errors are classified for 503 responses", () => {
  assert.equal(isDatabaseUnavailableError(new Error("connect ETIMEDOUT 182.150.118.137:54321")), true);
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
