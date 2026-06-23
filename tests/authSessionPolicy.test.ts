import assert from "node:assert/strict";
import test from "node:test";
import { ORF_AUTH_SESSION_POLICY, ORY_SESSION_LIFESPAN_ENV_NAME } from "../src/domain/authSessionPolicy";

test("ORF auth session policy keeps Ory and ORF cookie lifetimes aligned", () => {
  assert.equal(ORF_AUTH_SESSION_POLICY.durationDays, 7);
  assert.equal(ORF_AUTH_SESSION_POLICY.oryLifespan, "168h");
  assert.equal(ORF_AUTH_SESSION_POLICY.maxAgeSeconds, 604800);
  assert.equal(ORY_SESSION_LIFESPAN_ENV_NAME, "SESSION_LIFESPAN");
});
