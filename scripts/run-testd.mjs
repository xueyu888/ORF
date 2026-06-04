#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const testdRunId = process.env.TESTD_RUN_ID ?? createTestdRunId();
const extraArgs = process.argv.slice(2);
const requestedSuite = process.env.TESTD_SUITE;
const inferredSuite = requestedSuite ?? inferSuiteFromArgs(extraArgs);
const suites = inferredSuite ? suitesFor(inferredSuite) : ["isolated", "permissions", "settings"];
let currentChild;
let currentChildExited = true;
let terminating = false;
let terminationSignal;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    handleTerminationSignal(signal);
  });
}

for (const suite of suites) {
  if (terminating) {
    break;
  }

  const exitCode = await runPlaywright(suite, extraArgs);
  if (terminating) {
    process.exitCode = signalExitCode(terminationSignal ?? "SIGINT");
    break;
  }
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
    currentChild = child;
    currentChildExited = false;

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      currentChildExited = true;
      currentChild = undefined;
      if (signal) {
        console.error(`testd ${suite} suite exited by signal ${signal}`);
        resolve(signalExitCode(signal));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function createTestdRunId() {
  return `td-${compactDate()}-${randomUUID().slice(0, 8)}`;
}

function handleTerminationSignal(signal) {
  if (terminating) {
    console.error(`testd runner 再次收到 ${signal}，强制停止当前 Playwright 子进程...`);
    if (currentChild && !currentChildExited) {
      currentChild.kill("SIGKILL");
    } else {
      process.exit(signalExitCode(terminationSignal ?? signal));
    }
    return;
  }

  terminating = true;
  terminationSignal = signal;
  process.exitCode = signalExitCode(signal);
  console.error(`testd runner 收到 ${signal}，等待当前 Playwright 用例清理后退出...`);
  if (currentChild && !currentChildExited && shouldForwardSignalToChild()) {
    currentChild.kill(signal);
  }
}

function shouldForwardSignalToChild() {
  return process.stdin.isTTY !== true;
}

function signalExitCode(signal) {
  if (signal === "SIGINT") {
    return 130;
  }
  if (signal === "SIGTERM") {
    return 143;
  }
  if (signal === "SIGHUP") {
    return 129;
  }
  return 1;
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
