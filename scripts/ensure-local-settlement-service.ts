import "dotenv/config";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const port = positiveInteger(process.env.ORF_LOCAL_SETTLEMENT_PORT, 8799);
const healthUrl = `http://${localHealthHost(process.env.ORF_LOCAL_SETTLEMENT_HOST)}:${port}/health`;
const startupTimeoutMs = 10_000;
const pollIntervalMs = 250;
const storageDir = process.env.ORF_LOCAL_SETTLEMENT_HOME ?? path.join(os.homedir(), ".orf", "local-settlement");
const logPath = process.env.ORF_LOCAL_SETTLEMENT_LOG ?? path.join(storageDir, "local-settlement.log");

if (await isLocalSettlementHealthy()) {
  console.log(`[local-settlement] already running at ${healthUrl}`);
  process.exit(0);
}

await mkdir(path.dirname(logPath), { recursive: true });
const log = openSync(logPath, "a");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "settlement:local"], {
  detached: true,
  env: process.env,
  stdio: ["ignore", log, log],
});
child.unref();

console.log(`[local-settlement] starting in background, log: ${logPath}`);
await waitForLocalSettlement();
console.log(`[local-settlement] ready at ${healthUrl}`);

async function waitForLocalSettlement() {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await isLocalSettlementHealthy()) {
      return;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`Local settlement service did not become healthy at ${healthUrl}. See ${logPath}`);
}

async function isLocalSettlementHealthy() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

function localHealthHost(host: string | undefined) {
  if (!host || host === "0.0.0.0") return "127.0.0.1";
  if (host === "::") return "[::1]";
  return host;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
