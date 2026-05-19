#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runDir = resolve(rootDir, '.orf', 'run');
const logDir = resolve(rootDir, '.orf', 'logs');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const services = {
  backend: {
    script: 'server:dev',
    url: 'http://127.0.0.1:8787/health',
    displayUrl: 'http://127.0.0.1:8787',
  },
  frontend: {
    script: 'dev',
    url: 'http://127.0.0.1:5173/health',
    displayUrl: 'http://127.0.0.1:5173',
  },
};

const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);

async function main() {
  switch (command) {
    case 'help':
    case '-h':
    case '--help':
      printHelp();
      return;
    case 'status':
      await printStatus();
      return;
    case 'up':
    case 'start':
      await startDetached();
      return;
    case 'down':
    case 'stop':
      stopDetached();
      return;
    case 'restart':
      stopDetached({ quiet: true });
      await startDetached();
      return;
    case 'dev':
      await startForeground(['backend', 'frontend']);
      return;
    case 'server':
    case 'backend':
      await runNpmScript('server:dev', args);
      return;
    case 'web':
    case 'frontend':
      await runNpmScript('dev', args);
      return;
    case 'build':
      await runNpmScript('build', args);
      return;
    case 'test':
      await runNpmScript('test', args);
      return;
    case 'e2e':
      await runNpmScript('test:e2e', args);
      return;
    case 'verify':
      await runNpmScript('verify', args);
      return;
    case 'migrate':
      await runNpmScript('db:migrate', args);
      return;
    case 'seed':
      await runNpmScript('db:seed', args);
      return;
    case 'logs':
      printLogs(args[0]);
      return;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run `orf help` for available commands.');
      process.exitCode = 1;
  }
}

function printHelp() {
  console.log(`ORF command line

Usage:
  orf up              Start backend and frontend in the background
  orf down            Stop background backend and frontend
  orf restart         Restart background backend and frontend
  orf status          Check backend/frontend health
  orf dev             Run backend and frontend in the foreground
  orf backend         Run only the Fastify backend in the foreground
  orf frontend        Run only the Vite frontend in the foreground
  orf logs [service]  Show log paths, or print one service log

Checks:
  orf build           Run npm run build
  orf test            Run npm test
  orf e2e             Run npm run test:e2e
  orf verify          Run npm run verify

Database:
  orf migrate         Run npm run db:migrate
  orf seed            Run npm run db:seed
`);
}

async function printStatus() {
  const rows = await Promise.all(
    Object.entries(services).map(async ([name, service]) => {
      const health = await checkHealth(service.url);
      const pid = readPid(name);
      return { name, service, health, pid };
    }),
  );

  console.log('ORF status');
  for (const row of rows) {
    const pidText = row.pid && isAlive(row.pid) ? ` pid=${row.pid}` : '';
    const healthText = row.health.ok ? `ok ${row.health.ms}ms` : `down ${row.health.message}`;
    console.log(`  ${row.name.padEnd(8)} ${healthText}${pidText} ${row.service.displayUrl}`);
  }
}

async function startDetached() {
  ensureRunDirs();

  for (const [name, service] of Object.entries(services)) {
    const health = await checkHealth(service.url);
    const pid = readPid(name);
    if (health.ok) {
      console.log(`${name} already healthy at ${service.displayUrl}`);
      continue;
    }
    if (pid && isAlive(pid)) {
      console.log(`${name} process is running (pid ${pid}); waiting for health`);
      continue;
    }

    removePid(name);
    const child = spawnDetached(name, service.script);
    writePid(name, child.pid);
    console.log(`started ${name} pid=${child.pid}`);
  }

  const results = await Promise.all(
    Object.entries(services).map(async ([name, service]) => ({
      name,
      service,
      health: await waitForHealth(service.url, 30000),
    })),
  );

  for (const result of results) {
    if (result.health.ok) {
      console.log(`${result.name} ready at ${result.service.displayUrl}`);
    } else {
      console.error(`${result.name} did not become healthy: ${result.health.message}`);
      console.error(`See ${logPath(result.name)}`);
      process.exitCode = 1;
    }
  }
}

function stopDetached(options = {}) {
  ensureRunDirs();
  let stopped = 0;
  for (const name of Object.keys(services)) {
    const pid = readPid(name);
    if (!pid) {
      continue;
    }
    if (isAlive(pid)) {
      killProcessTree(pid);
      stopped += 1;
      if (!options.quiet) {
        console.log(`stopped ${name} pid=${pid}`);
      }
    }
    removePid(name);
  }

  if (!options.quiet && stopped === 0) {
    console.log('no ORF background services were recorded as running');
  }
}

async function startForeground(names) {
  const children = names.map((name) => {
    const service = services[name];
    const child = spawn(npmCmd, ['run', service.script], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code, signal) => {
      for (const peer of children) {
        if (peer !== child && !peer.killed) {
          peer.kill(signal ?? 'SIGTERM');
        }
      }
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 0);
      }
    });
    return child;
  });

  const stop = () => {
    for (const child of children) {
      child.kill('SIGTERM');
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function spawnDetached(name, script) {
  ensureRunDirs();
  const out = openSync(logPath(name), 'a');
  const child = spawn(npmCmd, ['run', script], {
    cwd: rootDir,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  closeSync(out);
  child.unref();
  return child;
}

async function runNpmScript(script, scriptArgs) {
  await new Promise((resolvePromise) => {
    const child = spawn(npmCmd, ['run', script, '--', ...scriptArgs], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exitCode = code ?? 0;
      }
      resolvePromise();
    });
  });
}

function printLogs(serviceName) {
  ensureRunDirs();
  if (!serviceName) {
    for (const name of Object.keys(services)) {
      console.log(`${name}: ${logPath(name)}`);
    }
    return;
  }
  if (!services[serviceName]) {
    console.error(`Unknown service: ${serviceName}`);
    process.exitCode = 1;
    return;
  }
  const file = logPath(serviceName);
  if (!existsSync(file)) {
    console.error(`No log file found: ${file}`);
    process.exitCode = 1;
    return;
  }
  const text = readFileSync(file, 'utf8');
  console.log(text.slice(-20000));
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = { ok: false, message: 'not checked' };
  while (Date.now() < deadline) {
    latest = await checkHealth(url);
    if (latest.ok) {
      return latest;
    }
    await sleep(500);
  }
  return latest;
}

async function checkHealth(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body,
      ms: Date.now() - started,
      message: response.ok ? 'ok' : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      message: error?.name === 'AbortError' ? 'timeout' : error?.message ?? String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function ensureRunDirs() {
  mkdirSync(runDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
}

function logPath(name) {
  return resolve(logDir, `${name}.log`);
}

function pidPath(name) {
  return resolve(runDir, `${name}.pid`);
}

function readPid(name) {
  const file = pidPath(name);
  if (!existsSync(file)) {
    return undefined;
  }
  const pid = Number(readFileSync(file, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function writePid(name, pid) {
  writeFileSync(pidPath(name), `${pid}\n`);
}

function removePid(name) {
  rmSync(pidPath(name), { force: true });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessTree(pid) {
  try {
    if (process.platform === 'win32') {
      process.kill(pid, 'SIGTERM');
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already stopped.
    }
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
