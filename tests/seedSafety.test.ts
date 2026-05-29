import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDemoSeedSafety,
  isLocalDatabaseUrl,
  namespacedSeedId,
  seedBootstrapAdmin,
  seedTeamId,
  seedUserIdForName,
} from "../scripts/seedSafety";

test("seed safety accepts local demo team seed", () => {
  assertDemoSeedSafety({
    connectionString: "postgresql://orf:secret@127.0.0.1:5432/orf",
    env: {},
    scriptName: "db:seed",
    targetTeamId: "team-demo-ai-app",
  });
});

test("seed safety rejects remote demo seed without explicit opt-in", () => {
  assert.throws(
    () =>
      assertDemoSeedSafety({
        connectionString: "postgresql://orf:secret@203.0.113.10:5432/orf",
        env: {},
        scriptName: "db:seed",
        targetTeamId: "team-demo-ai-app",
      }),
    /refuses to write seed data to a non-local database/,
  );
});

test("seed safety rejects business team seed without explicit opt-in", () => {
  assert.throws(
    () =>
      assertDemoSeedSafety({
        connectionString: "postgresql://orf:secret@127.0.0.1:5432/orf",
        env: {},
        scriptName: "db:seed",
        targetTeamId: "team-ai-app",
      }),
    /refuses to seed non-demo team/,
  );
});

test("seed safety keeps demo ids namespaced away from business ids", () => {
  const teamId = seedTeamId({});

  assert.equal(teamId, "team-demo-ai-app");
  assert.equal(namespacedSeedId(teamId, "obj-demo-settled-routing-quality"), "team-demo-ai-app-obj-demo-settled-routing-quality");
  assert.equal(seedUserIdForName(teamId, "Kai Wang"), "team-demo-ai-app-user-kai-wang");
  assert.equal(seedBootstrapAdmin(teamId).id, "team-demo-ai-app-user-xueyu");
  assert.equal(isLocalDatabaseUrl("postgresql://orf:secret@localhost:5432/orf"), true);
  assert.equal(isLocalDatabaseUrl("postgresql://orf:secret@203.0.113.10:5432/orf"), false);
});
