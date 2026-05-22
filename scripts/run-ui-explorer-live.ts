import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "@playwright/test";
import { installUiExplorerScenario } from "../e2e/_explorer/authenticatedAppScenario";
import { runUiExplorer } from "../e2e/_explorer/explorerRunner";
import { LiveExplorerReporter, liveRunDir } from "../e2e/_explorer/liveReporter";
import { readExplorerConfig } from "../e2e/_explorer/safety";
import { loadStateAbstractorRegistration } from "../e2e/_explorer/stateAbstractorRegistry";

const rootDir = process.cwd();

async function main() {
  const server = await ensureBaseUrl();
  const config = readExplorerConfig(server.baseURL);
  if (!process.env.UI_EXPLORER_STEPS) {
    config.steps = 0;
  }
  if (!process.env.UI_EXPLORER_LIVE_REPEATABLE_REGION_TESTS) {
    config.runRepeatableRegionTests = false;
  }
  const runDir = liveRunDir(config.reportDir, config.seed);
  config.screenshotDir = path.join(runDir, "screenshots");

  const liveReporter = new LiveExplorerReporter(config, {
    runDir,
    flushIntervalMs: positiveInt(process.env.UI_EXPLORER_LIVE_FLUSH_INTERVAL_MS, 1000),
    resultFlushIntervalMs: positiveInt(process.env.UI_EXPLORER_LIVE_RESULT_FLUSH_INTERVAL_MS, 5000),
  });
  await liveReporter.initialize();
  const reportServer = await serveReport(runDir, positiveInt(process.env.UI_EXPLORER_LIVE_PORT, 5681));
  const reportUrl = `${reportServer.url}/report.html`;
  console.log(`[ui-explorer:live] report: ${reportUrl}`);
  if (shouldOpenLiveReport()) {
    openUrl(reportUrl);
    console.log("[ui-explorer:live] opened live report page.");
  }
  console.log(`[ui-explorer:live] artifacts: ${runDir}`);
  console.log("[ui-explorer:live] press Ctrl+C to stop and flush the latest result.");

  await loadStateAbstractorRegistration(process.env.UI_EXPLORER_STATE_ABSTRACTOR_MODULE);
  const showTestBrowser = process.env.UI_EXPLORER_SHOW_TEST_BROWSER === "1";
  if (process.env.UI_EXPLORER_HEADLESS === "0" && !showTestBrowser) {
    console.log("[ui-explorer:live] UI_EXPLORER_HEADLESS=0 is ignored; set UI_EXPLORER_SHOW_TEST_BROWSER=1 to debug the test browser.");
  }
  console.log(`[ui-explorer:live] test browser: ${showTestBrowser ? "visible" : "headless"}`);
  const browser = await chromium.launch({ headless: !showTestBrowser });
  const context = await browser.newContext({ baseURL: config.baseURL });
  await context.addInitScript(() => {
    (globalThis as typeof globalThis & { __name?: <T>(value: T) => T }).__name = (value) => value;
  });
  const page = await context.newPage();
  await installUiExplorerScenario(page, config.safetyProfile);

  const controller = new AbortController();
  let stopRequested = false;
  const requestStop = () => {
    if (stopRequested) {
      console.log("[ui-explorer:live] second stop signal received, exiting after current cleanup.");
      return;
    }
    stopRequested = true;
    console.log("[ui-explorer:live] stopping after the current step...");
    controller.abort();
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  try {
    const result = await runUiExplorer(page, config, { observer: liveReporter, signal: controller.signal });
    if (controller.signal.aborted) {
      await liveReporter.complete(result, "stopped");
    }
    if (result.summary.severeFailureCount > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    await liveReporter.markFailed(error);
    throw error;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    reportServer.close();
    server.stop();
  }
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
    stop: () => stopChild(child, detached),
  };
}

async function serveReport(runDir: string, requestedPort: number) {
  await fsp.mkdir(runDir, { recursive: true });
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/report.html" : url.pathname);
    const resolvedRunDir = path.resolve(runDir);
    const filePath = path.resolve(runDir, `.${pathname}`);
    if (filePath !== resolvedRunDir && !filePath.startsWith(`${resolvedRunDir}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const body = await fsp.readFile(filePath);
      response.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Cache-Control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  const port = await listen(server, requestedPort);
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}

function listen(server: http.Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
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

function stopChild(child: ChildProcess, detached: boolean) {
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
}

function shouldOpenLiveReport() {
  return process.env.UI_EXPLORER_LIVE_OPEN_REPORT !== "0" && process.env.CI !== "1" && process.env.CI !== "true";
}

function openUrl(url: string) {
  const candidates =
    process.platform === "win32"
      ? [{ command: "cmd", args: ["/c", "start", "", url] }]
      : process.platform === "darwin"
        ? [{ command: "open", args: [url] }]
        : process.env.WSL_DISTRO_NAME
          ? [
              { command: "explorer.exe", args: [url] },
              { command: "xdg-open", args: [url] },
            ]
          : [{ command: "xdg-open", args: [url] }];

  for (const candidate of candidates) {
    try {
      const child = spawn(candidate.command, candidate.args, { detached: true, stdio: "ignore" });
      child.on("error", () => undefined);
      child.unref();
      return;
    } catch {
      // Try the next platform opener.
    }
  }
}

function positiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function prefixRaw(prefix: string, chunk: Buffer) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length > 0) {
      console.log(`${prefix}${line}`);
    }
  }
}

function contentType(filePath: string) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (filePath.endsWith(".ndjson")) {
    return "application/x-ndjson; charset=utf-8";
  }
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  return "application/octet-stream";
}

await main();
