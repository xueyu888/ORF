#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { checkDatabaseHealth, databaseDisplayUrl } from '../scripts/db-connection.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runDir = resolve(rootDir, '.orf', 'run');
const logDir = resolve(rootDir, '.orf', 'logs');
const envFile = resolve(rootDir, '.env');
const envExampleFile = resolve(rootDir, '.env.example');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);
const requiredEnvSectionHeader = '# Required project configuration.';
const optionalEnvSectionHeader = '# Optional configuration.';

if (shouldSyncRequiredEnvDefaults(command)) {
  syncRequiredEnvDefaults();
}

dotenv.config({ path: envFile, quiet: true });

const authBaseUrl = process.env.ORY_PUBLIC_URL ?? 'http://127.0.0.1:4433';
const storageBaseUrl = process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://127.0.0.1:9000';

const appServices = {
  backend: {
    script: 'server:dev',
    url: 'http://127.0.0.1:8787/health',
    check: checkBackendHealth,
    displayUrl: 'http://127.0.0.1:8787',
  },
  frontend: {
    script: 'dev',
    url: 'http://127.0.0.1:5173/health',
    displayUrl: 'http://127.0.0.1:5173',
  },
};

const dependencyServices = {
  database: {
    check: checkDatabaseHealth,
    displayUrl: databaseDisplayUrl(),
  },
  auth: {
    script: isLocalServiceUrl(authBaseUrl) ? 'ory:dev' : undefined,
    url: `${trimSlash(authBaseUrl)}/health/ready`,
    displayUrl: authBaseUrl,
  },
  storage: {
    script: isLocalServiceUrl(storageBaseUrl) ? 'storage:dev' : undefined,
    url: `${trimSlash(storageBaseUrl)}/minio/health/live`,
    displayUrl: storageBaseUrl,
  },
};

const statusChecks = {
  ...dependencyServices,
  ...appServices,
};

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
      if (!(await prepareRuntimeDependencies())) {
        return;
      }
      await startForeground(['backend', 'frontend']);
      return;
    case 'server':
    case 'backend':
      if (!(await prepareRuntimeDependencies())) {
        return;
      }
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
      if (!validateDatabaseEnv()) {
        return;
      }
      await runNpmScript('db:migrate', args);
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
  orf up              Check PostgreSQL, start Ory, MinIO, backend, and frontend
  orf down            Stop background backend and frontend
  orf restart         Restart background backend and frontend
  orf status          Check PostgreSQL, Ory, MinIO, backend, and frontend health
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
`);
}

async function printStatus() {
  const rows = await Promise.all(
    Object.entries(statusChecks).map(async ([name, service]) => {
      const health = await checkServiceHealth(service);
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
  if (!(await prepareRuntimeDependencies())) {
    return;
  }

  for (const [name, service] of Object.entries(appServices)) {
    const health = await checkServiceHealth(service);
    const pid = readPid(name);
    if (health.ok) {
      console.log(`${name} already healthy at ${service.displayUrl}`);
      continue;
    }
    if (pid && isAlive(pid)) {
      console.log(`${name} process is running (pid ${pid}) but health check failed (${health.message}); restarting`);
      killProcessTree(pid);
      removePid(name);
      await sleep(500);
    }

    removePid(name);
    const child = spawnDetached(name, service.script);
    writePid(name, child.pid);
    console.log(`started ${name} pid=${child.pid}`);
  }

  const results = await Promise.all(
    Object.entries(appServices).map(async ([name, service]) => ({
      name,
      service,
      health: await waitForServiceHealth(service, 30000),
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
  for (const name of Object.keys(appServices)) {
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
    const service = appServices[name];
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
    for (const name of Object.keys(appServices)) {
      console.log(`${name}: ${logPath(name)}`);
    }
    return;
  }
  if (!appServices[serviceName]) {
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

async function prepareRuntimeDependencies() {
  for (const [name, service] of Object.entries(dependencyServices)) {
    const health = await checkServiceHealth(service);
    if (health.ok) {
      console.log(`${name} already healthy at ${service.displayUrl}`);
      continue;
    }

    if (!service.script) {
      console.error(`${name} is not healthy: ${health.message}`);
      if (name === 'database') {
        console.error('Set DATABASE_URL or REMOTE_DATABASE_URL in .env, then run node scripts/verify-db.mjs.');
      } else {
        console.error(`${name} is configured as a shared/remote dependency at ${service.displayUrl}; not starting a local replacement.`);
      }
      process.exitCode = 1;
      return false;
    }

    console.log(`${name} is not healthy (${health.message}); running npm run ${service.script}`);
    const code = await runNpmScriptCommand(service.script, []);
    if (code !== 0) {
      console.error(`${name} failed to start via npm run ${service.script}`);
      process.exitCode = code;
      return false;
    }

    const ready = await waitForHealth(service.url, 30000);
    if (!ready.ok) {
      console.error(`${name} did not become healthy: ${ready.message}`);
      console.error(`Check npm run ${service.script} and ${service.displayUrl}`);
      process.exitCode = 1;
      return false;
    }
    console.log(`${name} ready at ${service.displayUrl}`);
  }

  return true;
}

function validateDatabaseEnv() {
  if (process.env.DATABASE_URL || process.env.REMOTE_DATABASE_URL) {
    return true;
  }

  console.error('Missing required ORF environment: DATABASE_URL or REMOTE_DATABASE_URL is required.');
  console.error('Create .env from .env.example, set the database URL, then run node scripts/verify-db.mjs.');
  process.exitCode = 1;
  return false;
}

function shouldSyncRequiredEnvDefaults(commandName) {
  return new Set(['up', 'start', 'restart', 'dev', 'server', 'backend']).has(commandName);
}

function syncRequiredEnvDefaults() {
  const defaults = readRequiredEnvDefaults(envExampleFile);
  if (defaults.length === 0) {
    return;
  }

  const existingKeys = readEnvKeys(envFile);
  const missing = defaults.filter((entry) => !envKeySatisfied(entry.key, existingKeys));
  if (missing.length === 0) {
    return;
  }

  const current = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  let next = current;
  if (next.length > 0 && !next.endsWith('\n')) {
    next += '\n';
  }
  if (next.trim().length > 0) {
    next += '\n';
  }
  next += '# Added by orf from .env.example required defaults.\n';
  next += missing.map((entry) => entry.line).join('\n');
  next += '\n';

  writeFileSync(envFile, next);
  console.log(`Added missing required .env values from .env.example: ${missing.map((entry) => entry.key).join(', ')}`);
}

function readRequiredEnvDefaults(file) {
  if (!existsSync(file)) {
    return [];
  }

  const defaults = [];
  let inRequiredSection = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === requiredEnvSectionHeader) {
      inRequiredSection = true;
      continue;
    }
    if (trimmed === optionalEnvSectionHeader && inRequiredSection) {
      break;
    }
    if (!inRequiredSection) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      defaults.push({ key: match[1], line });
    }
  }
  return defaults;
}

function readEnvKeys(file) {
  if (!existsSync(file)) {
    return new Set();
  }

  const keys = new Set();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function envKeySatisfied(key, keys) {
  if (key === 'DATABASE_URL' && keys.has('REMOTE_DATABASE_URL')) {
    return true;
  }
  return keys.has(key);
}

async function checkServiceHealth(service) {
  if (service.check) {
    return await service.check();
  }
  return await checkHealth(service.url);
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

async function waitForServiceHealth(service, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = { ok: false, message: 'not checked' };
  while (Date.now() < deadline) {
    latest = await checkServiceHealth(service);
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

async function checkBackendHealth() {
  const baseHealth = await checkHealth(appServices.backend.url);
  if (!baseHealth.ok) {
    return baseHealth;
  }

  const authHealth = await checkHealth(`${trimSlash(appServices.backend.displayUrl)}/health/auth`);
  if (!authHealth.ok) {
    return {
      ...authHealth,
      ms: baseHealth.ms + authHealth.ms,
      message: `auth probe ${authHealth.message}`,
    };
  }

  return {
    ok: true,
    status: baseHealth.status,
    body: baseHealth.body,
    ms: baseHealth.ms + authHealth.ms,
    message: 'ok',
  };
}

async function runNpmScriptCommand(script, scriptArgs) {
  return await new Promise((resolvePromise) => {
    const child = spawn(npmCmd, ['run', script, '--', ...scriptArgs], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        resolvePromise(1);
      } else {
        resolvePromise(code ?? 0);
      }
    });
  });
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

function trimSlash(value) {
  return value.replace(/\/+$/, '');
}

function isLocalServiceUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
  } catch {
    return false;
  }
}

if (!bootstrapPublicCa()) {
  main().catch((error) => {
    console.error(error?.stack ?? error?.message ?? String(error));
    process.exitCode = 1;
  });
}

function bootstrapPublicCa() {
  if (process.env.ORF_SKIP_PUBLIC_CA_BOOTSTRAP === '1' || process.env.NODE_EXTRA_CA_CERTS) {
    return false;
  }

  const publicCaCert = process.env.ORF_PUBLIC_CA_CERT;
  if (!publicCaCert || !existsSync(publicCaCert)) {
    return false;
  }

  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: publicCaCert,
      ORF_SKIP_PUBLIC_CA_BOOTSTRAP: '1',
    },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  return true;
}
