import assert from "node:assert/strict";
import test from "node:test";
import { isDatabaseUnavailableError } from "../server/db/errors";

test("database timeout wrapped by auth user lookup is classified as database unavailable", () => {
  const error = new Error(
    'Failed query: select "id" from "users" where "users"."ory_identity_id" = $1 limit $2\n' +
      "params: identity-id,1: Connection terminated due to connection timeout: Connection terminated unexpectedly",
  );

  assert.equal(isDatabaseUnavailableError(error), true);
});

test("database pool acquisition timeout is classified as database unavailable", () => {
  assert.equal(isDatabaseUnavailableError(new Error("timeout exceeded when trying to connect")), true);
});
