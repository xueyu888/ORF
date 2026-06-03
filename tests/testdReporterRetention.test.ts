import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pruneOldReports, reportRetentionDays } from "../testd/_framework/reporter";

test("testd report retention days defaults to seven and accepts non-negative integers", () => {
  assert.equal(reportRetentionDays({}), 7);
  assert.equal(reportRetentionDays({ TESTD_REPORT_RETENTION_DAYS: "" }), 7);
  assert.equal(reportRetentionDays({ TESTD_REPORT_RETENTION_DAYS: "-1" }), 7);
  assert.equal(reportRetentionDays({ TESTD_REPORT_RETENTION_DAYS: "not-a-number" }), 7);
  assert.equal(reportRetentionDays({ TESTD_REPORT_RETENTION_DAYS: "0" }), 0);
  assert.equal(reportRetentionDays({ TESTD_REPORT_RETENTION_DAYS: "3.9" }), 3);
});

test("testd report retention removes only report directories older than configured days", async () => {
  const reportRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orf-testd-reports-"));
  const now = new Date("2026-06-03T12:00:00.000Z");

  const oldReport = await createReportDir(reportRoot, "old-report", new Date("2026-05-25T12:00:00.000Z"));
  const recentReport = await createReportDir(reportRoot, "recent-report", new Date("2026-06-01T12:00:00.000Z"));
  const oldNonReport = await createPlainDir(reportRoot, "old-non-report", new Date("2026-05-25T12:00:00.000Z"));

  await pruneOldReports(reportRoot, now, { TESTD_REPORT_RETENTION_DAYS: "7" });

  assert.equal(await exists(oldReport), false);
  assert.equal(await exists(recentReport), true);
  assert.equal(await exists(oldNonReport), true);
});

async function createReportDir(root: string, name: string, mtime: Date) {
  const dir = path.join(root, name);
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, "summary.md"), "# summary\n");
  await fs.utimes(dir, mtime, mtime);
  return dir;
}

async function createPlainDir(root: string, name: string, mtime: Date) {
  const dir = path.join(root, name);
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, "note.txt"), "not a testd report\n");
  await fs.utimes(dir, mtime, mtime);
  return dir;
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
