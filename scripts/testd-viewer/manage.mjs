#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const cwd = process.cwd();
const command = process.argv[2] ?? "status";
const host = process.env.TESTD_VIEWER_HOST ?? "127.0.0.1";
const port = positiveInteger(process.env.TESTD_VIEWER_PORT, 5179);
const artifactDir = path.join(cwd, ".artifacts", "testd-viewer");
const pidPath = path.join(artifactDir, "viewer.pid");
const statePath = path.join(artifactDir, "viewer.state.json");
const logPath = path.join(artifactDir, "viewer.log");
const viewerEntry = path.join(cwd, "scripts", "serve-testd-reports.mjs");

if (command === "start") {
  await start();
} else if (command === "stop") {
  await stop();
} else if (command === "status") {
  await status();
} else {
  console.error("用法: node scripts/testd-viewer/manage.mjs <start|stop|status>");
  process.exit(2);
}

async function start() {
  await fsp.mkdir(artifactDir, { recursive: true });
  const current = await readManagedProcess();
  if (current.running) {
    console.log(`TestD 控制台已在运行: ${current.url}`);
    console.log(`PID: ${current.pid}`);
    console.log(`日志: ${relative(logPath)}`);
    return;
  }

  const health = await requestHealth();
  if (health.ok) {
    console.log(`TestD 控制台已可访问: ${health.url}`);
    console.log("当前进程不是由 start 脚本记录的；如需停止，请先确认对应 PID。");
    return;
  }

  const out = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [viewerEntry], {
    cwd,
    detached: true,
    env: {
      ...process.env,
      TESTD_VIEWER_HOST: host,
      TESTD_VIEWER_PORT: String(port),
    },
    stdio: ["ignore", out, out],
  });
  child.unref();
  fs.closeSync(out);

  await writeManagedProcess(child.pid);
  const ready = await waitForHealth(5000);
  if (!ready.ok) {
    const running = isProcessRunning(child.pid);
    console.error(`TestD 控制台启动后未通过健康检查: ${ready.reason}`);
    console.error(`PID: ${child.pid}${running ? "" : "（进程已退出）"}`);
    console.error(`日志: ${relative(logPath)}`);
    process.exit(running ? 1 : 2);
  }

  console.log(`TestD 控制台已启动: ${ready.url}`);
  console.log(`PID: ${child.pid}`);
  console.log(`日志: ${relative(logPath)}`);
}

async function stop() {
  const current = await readManagedProcess();
  if (!current.pid) {
    console.log("没有找到由 start 脚本记录的 TestD 控制台 PID。");
    const health = await requestHealth();
    if (health.ok) {
      console.log(`但端口上仍有服务可访问: ${health.url}`);
    }
    return;
  }

  if (!current.running) {
    await cleanupState();
    console.log(`已清理过期 PID: ${current.pid}`);
    return;
  }

  process.kill(current.pid, "SIGTERM");
  const stopped = await waitForStop(current.pid, 5000);
  if (!stopped) {
    console.error(`TestD 控制台未在 5 秒内退出，请手动确认 PID: ${current.pid}`);
    process.exit(1);
  }

  await cleanupState();
  console.log(`TestD 控制台已停止: PID ${current.pid}`);
}

async function status() {
  const current = await readManagedProcess();
  const health = await requestHealth();
  if (current.running) {
    console.log(`TestD 控制台运行中: ${current.url}`);
    console.log(`PID: ${current.pid}`);
    console.log(`日志: ${relative(logPath)}`);
    console.log(`健康检查: ${health.ok ? "通过" : `失败（${health.reason}）`}`);
    return;
  }

  if (current.pid) {
    console.log(`TestD 控制台未运行，记录的 PID 已失效: ${current.pid}`);
    return;
  }

  if (health.ok) {
    console.log(`TestD 控制台可访问，但不是由 start 脚本记录: ${health.url}`);
    return;
  }

  console.log(`TestD 控制台未运行: http://${host}:${port}`);
}

async function readManagedProcess() {
  const pid = await readPid();
  const state = await readState();
  return {
    pid,
    running: pid ? isProcessRunning(pid) : false,
    url: state.url ?? `http://${host}:${port}`,
  };
}

async function readPid() {
  try {
    const raw = await fsp.readFile(pidPath, "utf8");
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readState() {
  try {
    return JSON.parse(await fsp.readFile(statePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeManagedProcess(pid) {
  const state = {
    pid,
    host,
    port,
    url: `http://${host}:${port}`,
    startedAt: new Date().toISOString(),
    logPath: relative(logPath),
  };
  await fsp.writeFile(pidPath, `${pid}\n`);
  await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function cleanupState() {
  await Promise.all([
    fsp.rm(pidPath, { force: true }),
    fsp.rm(statePath, { force: true }),
  ]);
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === "ESRCH") {
      return false;
    }
    if (error && error.code === "EPERM") {
      return true;
    }
    throw error;
  }
}

async function waitForHealth(timeoutMs) {
  const startedAt = Date.now();
  let last = { ok: false, reason: "未开始检查" };
  while (Date.now() - startedAt < timeoutMs) {
    last = await requestHealth();
    if (last.ok) {
      return last;
    }
    await sleep(150);
  }
  return last;
}

async function waitForStop(pid, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await sleep(150);
  }
  return !isProcessRunning(pid);
}

function requestHealth() {
  const baseUrl = `http://${host}:${port}`;
  const healthUrl = `${baseUrl}/api/health`;
  return new Promise((resolve) => {
    const request = http.get(healthUrl, { timeout: 1000 }, (response) => {
      response.resume();
      resolve({ ok: response.statusCode === 200, url: baseUrl, healthUrl, reason: `HTTP ${response.statusCode}` });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, url: baseUrl, healthUrl, reason: "健康检查超时" });
    });
    request.on("error", (error) => {
      resolve({ ok: false, url: baseUrl, healthUrl, reason: error.message });
    });
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function relative(targetPath) {
  return path.relative(cwd, targetPath) || ".";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
