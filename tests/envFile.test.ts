import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEnvFile } from "../scripts/db-connection.mjs";

test("loadEnvFile ignores inline comments outside quoted values", () => {
  const dir = mkdtempSync(join(tmpdir(), "orf-env-"));
  const envFile = join(dir, ".env");
  const keys = [
    "ORF_TEST_ENV_NUMBER",
    "ORF_TEST_ENV_COMPACT_COMMENT",
    "ORF_TEST_ENV_QUOTED_HASH",
  ];

  try {
    for (const key of keys) {
      delete process.env[key];
    }

    writeFileSync(
      envFile,
      [
        "ORF_TEST_ENV_NUMBER=5 # Added by orf from .env.example required default.",
        "ORF_TEST_ENV_COMPACT_COMMENT=value#comment",
        'ORF_TEST_ENV_QUOTED_HASH="value # inside quotes"',
      ].join("\n"),
    );

    loadEnvFile(envFile);

    assert.equal(process.env.ORF_TEST_ENV_NUMBER, "5");
    assert.equal(process.env.ORF_TEST_ENV_COMPACT_COMMENT, "value");
    assert.equal(process.env.ORF_TEST_ENV_QUOTED_HASH, "value # inside quotes");
  } finally {
    for (const key of keys) {
      delete process.env[key];
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
