#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const testdRunId = process.env.TESTD_RUN_ID ?? createTestdRunId();
const extraArgs = process.argv.slice(2);
const requestedSuite = process.env.TESTD_SUITE;
const inferredSuite = requestedSuite ?? inferSuiteFromArgs(extraArgs);
const suites = inferredSuite ? suitesFor(inferredSuite) : ["isolated", "permissions", "settings"];

for (const suite of suites) {
  const exitCode = await runPlaywright(suite, extraArgs);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    break;
  }
}

function runPlaywright(suite, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/with-public-ca.mjs", "playwright", "test", ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TESTD_RUN_ID: testdRunId,
          TESTD_SUITE: suite,
        },
        stdio: "inherit",
      },
    );

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`testd ${suite} suite exited by signal ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function createTestdRunId() {
  return `td-${compactDate()}-${randomUUID().slice(0, 8)}`;
}

function compactDate() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function inferSuiteFromArgs(args) {
  const pathArgs = args.filter((arg) => arg.length > 0 && !arg.startsWith("-"));
  if (pathArgs.length === 0) {
    return undefined;
  }

  if (pathArgs.some((arg) => arg.includes("/permissions/") || arg.includes("\\permissions\\"))) {
    return "permissions";
  }

  if (pathArgs.some((arg) => arg.includes("/settings/") || arg.includes("\\settings\\"))) {
    return "settings";
  }

  return "isolated";
}

function suitesFor(suite) {
  if (suite === "all") {
    return ["isolated", "permissions", "settings"];
  }

  if (suite === "isolated" || suite === "permissions" || suite === "settings") {
    return [suite];
  }

  console.error(`Unsupported TESTD_SUITE: ${suite}`);
  process.exit(1);
}
