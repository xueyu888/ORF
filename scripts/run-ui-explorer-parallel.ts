import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { writeMergedExplorerReport } from "../e2e/_explorer/reporter";
import type { ExplorerRunResult } from "../e2e/_explorer/types";

const rootDir = process.cwd();
const workerCount = positiveInt(process.env.UI_EXPLORER_WORKERS, Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length)));
const baseSeed = process.env.UI_EXPLORER_SEED ?? String(Date.now());
const perWorkerSteps = computePerWorkerSteps(workerCount);
const reportRoot = process.env.UI_EXPLORER_REPORT_DIR ?? ".artifacts/ui-explorer";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const shardRoot = path.join(reportRoot, `${runId}-parallel-shards-seed-${safeFilePart(baseSeed)}`);
const outputRoot = path.join("test-results", `ui-explorer-parallel-${runId}`);

async function main() {
  await fsp.mkdir(shardRoot, { recursive: true });
  await fsp.mkdir(outputRoot, { recursive: true });

  const server = await ensureBaseUrl();
  const children: ChildProcess[] = [];
  const abort = () => {
    for (const child of children) {
      child.kill("SIGTERM");
    }
    server.stop();
  };
  process.once("SIGINT", () => {
    abort();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    abort();
    process.exit(143);
  });

  try {
    console.log(
      `[ui-explorer:parallel] workers=${workerCount} stepsPerWorker=${perWorkerSteps} totalBudget=${workerCount * perWorkerSteps} baseURL=${server.baseURL}`,
    );
    const runs = Array.from({ length: workerCount }, (_, index) => runShard(index, server.baseURL, children));
    const shardReports = await Promise.all(runs);
    const results = shardReports.map((report) => JSON.parse(fs.readFileSync(report, "utf8")) as ExplorerRunResult);
    const merged = await writeMergedExplorerReport(results, {
      reportDir: reportRoot,
      seed: baseSeed,
      replayCommand: replayCommand(workerCount, perWorkerSteps, baseSeed),
      label: `${workerCount} workers`,
    });
    console.log(`[ui-explorer:parallel] merged JSON: ${merged.reportPath}`);
    console.log(`[ui-explorer:parallel] merged HTML: ${merged.htmlReportPath}`);
    if (merged.repeatableRegionReportPath && merged.repeatableRegionHtmlReportPath) {
      console.log(`[ui-explorer:parallel] repeatable-region JSON: ${merged.repeatableRegionReportPath}`);
      console.log(`[ui-explorer:parallel] repeatable-region HTML: ${merged.repeatableRegionHtmlReportPath}`);
    }
    console.log(
      `[ui-explorer:parallel] states=${merged.result.summary.discoveredStateCount} transitions=${merged.result.summary.discoveredTransitionCount} score=${merged.result.summary.discoveredSpaceExplorationScore.toFixed(2)} severe=${merged.result.summary.severeFailureCount}`,
    );
    if (merged.result.summary.severeFailureCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    server.stop();
  }
}

async function runShard(index: number, baseURL: string, children: ChildProcess[]) {
  const shardReportDir = path.join(shardRoot, `worker-${index + 1}`);
  const shardOutputDir = path.join(outputRoot, `worker-${index + 1}`);
  await fsp.mkdir(shardReportDir, { recursive: true });
  await fsp.mkdir(shardOutputDir, { recursive: true });
  const seed = `${baseSeed}-w${index + 1}`;
  const env = {
    ...process.env,
    PLAYWRIGHT_BASE_URL: baseURL,
    UI_EXPLORER_BASE_URL: baseURL,
    UI_EXPLORER_SEED: seed,
    UI_EXPLORER_STEPS: String(perWorkerSteps),
    UI_EXPLORER_REPORT_DIR: shardReportDir,
  };
  const args = [
    "playwright",
    "test",
    "--config=e2e/playwright.config.ts",
    "ui-random-explorer.spec.ts",
    "--workers=1",
    "--reporter=line",
    `--output=${shardOutputDir}`,
  ];
  const child = spawn("npx", args, { cwd: rootDir, env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  child.stdout?.on("data", (chunk) => prefixOutput(index, chunk));
  child.stderr?.on("data", (chunk) => prefixOutput(index, chunk));
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  if (code !== 0) {
    throw new Error(`UI explorer worker ${index + 1} failed with exit code ${code}.`);
  }
  const report = findLatestResultJson(shardReportDir);
  if (!report) {
    throw new Error(`UI explorer worker ${index + 1} did not produce result.json in ${shardReportDir}.`);
  }
  return report;
}

async function ensureBaseUrl() {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return {
      baseURL: process.env.PLAYWRIGHT_BASE_URL,
      stop: () => undefined,
    };
  }

  const port = positiveInt(process.env.UI_EXPLORER_PORT, 5673);
  const baseURL = `http://127.0.0.1:${port}`;
  const viteBin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  const detached = process.platform !== "win32";
  const child = spawn(viteBin, ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: rootDir,
    env: process.env,
    detached,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => prefixRaw("[vite] ", chunk));
  child.stderr?.on("data", (chunk) => prefixRaw("[vite] ", chunk));
  await waitForHttp(baseURL, 120_000);
  return {
    baseURL,
    stop: () => {
      if (!child.pid) {
        return;
      }
      try {
        if (detached) {
          process.kill(-child.pid, "SIGTERM");
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        // The server may already have exited.
      }
    },
  };
}

function computePerWorkerSteps(workers: number) {
  const totalSteps = positiveInt(process.env.UI_EXPLORER_TOTAL_STEPS, 0);
  if (totalSteps > 0) {
    return Math.max(1, Math.ceil(totalSteps / workers));
  }
  return positiveInt(process.env.UI_EXPLORER_STEPS, 1000);
}

async function waitForHttp(url: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canFetch(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function canFetch(url: string) {
  return new Promise<boolean>((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function findLatestResultJson(dir: string) {
  const files: string[] = [];
  walk(dir, (file) => {
    if (path.basename(file) === "result.json") {
      files.push(file);
    }
  });
  return files.sort((left, right) => fs.statSync(left).mtimeMs - fs.statSync(right).mtimeMs).at(-1) ?? null;
}

function walk(dir: string, visit: (file: string) => void) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      walk(file, visit);
    } else {
      visit(file);
    }
  }
}

function replayCommand(workers: number, steps: number, seed: string) {
  return [
    process.env.UI_EXPLORER_TEST_KIND ? `UI_EXPLORER_TEST_KIND=${shellQuote(process.env.UI_EXPLORER_TEST_KIND)}` : "",
    process.env.UI_EXPLORER_SAFETY_PROFILE ? `UI_EXPLORER_SAFETY_PROFILE=${shellQuote(process.env.UI_EXPLORER_SAFETY_PROFILE)}` : "",
    process.env.UI_EXPLORER_STATE_ABSTRACTOR_MODULE ? `UI_EXPLORER_STATE_ABSTRACTOR_MODULE=${shellQuote(process.env.UI_EXPLORER_STATE_ABSTRACTOR_MODULE)}` : "",
    process.env.UI_EXPLORER_STATE_ABSTRACTOR ? `UI_EXPLORER_STATE_ABSTRACTOR=${shellQuote(process.env.UI_EXPLORER_STATE_ABSTRACTOR)}` : "",
    process.env.UI_EXPLORER_MAX_DURATION_MS ? `UI_EXPLORER_MAX_DURATION_MS=${shellQuote(process.env.UI_EXPLORER_MAX_DURATION_MS)}` : "",
    `UI_EXPLORER_WORKERS=${workers}`,
    `UI_EXPLORER_STEPS=${steps}`,
    `UI_EXPLORER_SEED=${shellQuote(seed)}`,
    "npm run test:e2e:explorer:fast",
  ].filter(Boolean).join(" ");
}

function positiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function prefixOutput(index: number, chunk: Buffer) {
  prefixRaw(`[w${index + 1}] `, chunk);
}

function prefixRaw(prefix: string, chunk: Buffer) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length > 0) {
      console.log(`${prefix}${line}`);
    }
  }
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
}

function shellQuote(value: string) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

await main();
