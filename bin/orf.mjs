#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const generatedRequiredEnvDefaultComment = 'Added by orf from .env.example required default.';

if (shouldSyncRequiredEnvDefaults(command)) {
  syncRequiredEnvDefaults();
}

loadEnvFile(envFile);

const authBaseUrl = process.env.ORY_PUBLIC_URL ?? 'http://127.0.0.1:4433';
const storageBaseUrl = process.env.OBJECT_STORAGE_ENDPOINT ?? 'http://127.0.0.1:9000';
const localSettlementBaseUrl = process.env.ORF_LOCAL_SETTLEMENT_SERVICE_URL ?? 'http://127.0.0.1:8799';
const localSettlementSystemdUnit = process.env.ORF_LOCAL_SETTLEMENT_SYSTEMD_UNIT ?? 'orf-local-private-service.service';
let databaseToolsPromise;

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
    check: checkDatabaseServiceHealth,
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
  settlement: {
    optional: true,
    start: isLocalServiceUrl(localSettlementBaseUrl) ? startLocalSettlementService : undefined,
    startLabel: `systemctl --user start ${localSettlementSystemdUnit}`,
    url: `${trimSlash(localSettlementBaseUrl)}/health`,
    displayUrl: localSettlementBaseUrl,
  },
};

const statusChecks = {
  ...dependencyServices,
  ...appServices,
};

async function main() {
  if (shouldValidateNodeDependencies(command) && !validateNodeDependencies()) {
    return;
  }

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
      stopDetached({ names: args.length > 0 ? args : undefined });
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
  orf up              Check locked dependencies and runtime services, then start backend and frontend
  orf down [service]  Stop background backend and frontend, or only backend/frontend
  orf restart         Restart background backend and frontend
  orf status          Check PostgreSQL, Ory, MinIO, settlement service, backend, and frontend health
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
  const names = options.names ?? Object.keys(appServices);
  const unknownNames = names.filter((name) => !appServices[name]);
  if (unknownNames.length > 0) {
    console.error(`Unknown ORF service: ${unknownNames.join(', ')}`);
    process.exitCode = 2;
    return;
  }
  for (const name of names) {
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
  const descriptor = openSync(file, 'r');
  try {
    const size = fstatSync(descriptor).size;
    const length = Math.min(size, 20000);
    const buffer = Buffer.alloc(length);
    readSync(descriptor, buffer, 0, length, size - length);
    console.log(buffer.toString('utf8'));
  } finally {
    closeSync(descriptor);
  }
}

async function prepareRuntimeDependencies() {
  for (const [name, service] of Object.entries(dependencyServices)) {
    const health = await checkServiceHealth(service);
    if (health.ok) {
      console.log(`${name} already healthy at ${service.displayUrl}`);
      continue;
    }

    if (!service.script && !service.start) {
      const log = service.optional ? console.warn : console.error;
      log(`${name} is not healthy: ${health.message}`);
      if (name === 'database') {
        console.error('Set DATABASE_URL or REMOTE_DATABASE_URL in .env, then run node scripts/verify-db.mjs.');
      } else {
        log(`${name} is configured as a shared/remote dependency at ${service.displayUrl}; not starting a local replacement.`);
      }
      if (service.optional) {
        console.warn(`${name} is optional for startup; continuing without it.`);
        continue;
      }
      process.exitCode = 1;
      return false;
    }

    const startLabel = service.script ? `npm run ${service.script}` : service.startLabel ?? `start ${name}`;
    console.log(`${name} is not healthy (${health.message}); running ${startLabel}`);
    const code = service.start ? await service.start() : await runNpmScriptCommand(service.script, []);
    if (code !== 0) {
      const log = service.optional ? console.warn : console.error;
      log(`${name} failed to start via ${startLabel}`);
      if (service.optional) {
        console.warn(`${name} is optional for startup; continuing without it.`);
        continue;
      }
      process.exitCode = code;
      return false;
    }

    const ready = await waitForServiceHealth(service, 30000);
    if (!ready.ok) {
      const log = service.optional ? console.warn : console.error;
      log(`${name} did not become healthy: ${ready.message}`);
      log(`Check ${startLabel} and ${service.displayUrl}`);
      if (service.optional) {
        console.warn(`${name} is optional for startup; continuing without it.`);
        continue;
      }
      process.exitCode = 1;
      return false;
    }
    console.log(`${name} ready at ${service.displayUrl}`);
  }

  return true;
}

function validateNodeDependencies() {
  const packagePath = resolve(rootDir, 'package.json');
  const lockPath = resolve(rootDir, 'package-lock.json');
  if (!existsSync(resolve(rootDir, 'node_modules')) || !existsSync(lockPath)) {
    console.error('Node dependencies are not installed. Run `npm ci` explicitly before starting ORF.');
    process.exitCode = 1;
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    const projectLock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const lockedRoot = projectLock.packages?.[''];
    for (const dependencyType of ['dependencies', 'devDependencies']) {
      const declared = packageJson[dependencyType] ?? {};
      if (JSON.stringify(declared) !== JSON.stringify(lockedRoot?.[dependencyType] ?? {})) {
        throw new Error(`package-lock.json does not match package.json ${dependencyType}`);
      }
      for (const dependencyName of Object.keys(declared)) {
        const lockedVersion = projectLock.packages?.[`node_modules/${dependencyName}`]?.version;
        const installedPackagePath = resolve(rootDir, 'node_modules', dependencyName, 'package.json');
        const installedVersion = existsSync(installedPackagePath)
          ? JSON.parse(readFileSync(installedPackagePath, 'utf8')).version
          : undefined;
        if (!lockedVersion || installedVersion !== lockedVersion) {
          throw new Error(`${dependencyName} must be ${lockedVersion ?? 'present in package-lock.json'}, found ${installedVersion ?? 'not installed'}`);
        }
      }
    }
  } catch (error) {
    console.error(`Node dependency state is invalid (${error?.message ?? String(error)}). Run \`npm ci\` explicitly.`);
    process.exitCode = 1;
    return false;
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

function shouldValidateNodeDependencies(commandName) {
  return new Set([
    'up',
    'start',
    'restart',
    'dev',
    'server',
    'backend',
    'web',
    'frontend',
    'build',
    'test',
    'e2e',
    'verify',
    'migrate',
  ]).has(commandName);
}

function syncRequiredEnvDefaults() {
  const requiredSection = readRequiredEnvSection(envExampleFile);
  const defaults = requiredSection.defaults;
  if (defaults.length === 0) {
    return;
  }

  const existingKeys = readEnvKeys(envFile);
  const missing = defaults.filter((entry) => !envKeySatisfied(entry.key, existingKeys));
  if (missing.length === 0) {
    return;
  }

  const current = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const next = insertRequiredEnvDefaults(current, requiredSection, missing);

  writeFileSync(envFile, next);
  console.log(`Added missing required .env values from .env.example: ${missing.map((entry) => entry.key).join(', ')}`);
}

function readRequiredEnvSection(file) {
  if (!existsSync(file)) {
    return { lines: [], defaults: [] };
  }

  const lines = [];
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

    lines.push(line);
  }

  const defaults = [];
  lines.forEach((line, index) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      defaults.push({ key: match[1], line, sectionIndex: index });
    }
  });

  return { lines, defaults };
}

function insertRequiredEnvDefaults(current, requiredSection, missing) {
  const lines = splitEnvLines(current);
  for (const entry of missing) {
    if (findEnvKeyLineIndex(lines, entry.key) !== -1) {
      continue;
    }

    const index = findRequiredEnvDefaultInsertionIndex(lines, requiredSection, entry);
    lines.splice(index, 0, `# ${generatedRequiredEnvDefaultComment}`, entry.line);
  }
  return joinEnvLines(lines);
}

function findRequiredEnvDefaultInsertionIndex(lines, requiredSection, entry) {
  for (let index = entry.sectionIndex - 1; index >= 0; index -= 1) {
    const anchor = findEnvAnchorLineIndex(lines, requiredSection.lines[index]);
    if (anchor !== -1) {
      return anchor + 1;
    }
  }

  for (let index = entry.sectionIndex + 1; index < requiredSection.lines.length; index += 1) {
    const anchor = findEnvAnchorLineIndex(lines, requiredSection.lines[index]);
    if (anchor !== -1) {
      return anchor;
    }
  }

  if (lines.length > 0 && lines.at(-1).trim() !== '') {
    lines.push('');
  }
  return lines.length;
}

function findEnvAnchorLineIndex(lines, exampleLine) {
  if (exampleLine.trim() === '') {
    return -1;
  }

  const assignment = parseEnvAssignmentKey(exampleLine);
  if (assignment) {
    const assignmentIndex = findEnvKeyLineIndex(lines, assignment);
    if (assignmentIndex !== -1) {
      return assignmentIndex;
    }
    if (assignment === 'DATABASE_URL') {
      const remoteDatabaseUrlIndex = findEnvKeyLineIndex(lines, 'REMOTE_DATABASE_URL');
      if (remoteDatabaseUrlIndex !== -1) {
        return remoteDatabaseUrlIndex;
      }
    }
    return -1;
  }

  return lines.findIndex((line) => line.trim() === exampleLine.trim());
}

function splitEnvLines(text) {
  if (text.length === 0) {
    return [];
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines;
}

function joinEnvLines(lines) {
  if (lines.length === 0) {
    return '';
  }
  return `${lines.join('\n')}\n`;
}

function findEnvKeyLineIndex(lines, key) {
  return lines.findIndex((line) => parseEnvAssignmentKey(line) === key);
}

function parseEnvAssignmentKey(line) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1];
}

function readEnvKeys(file) {
  if (!existsSync(file)) {
    return new Set();
  }

  const keys = new Set();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const key = parseEnvAssignmentKey(line);
    if (key) {
      keys.add(key);
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

function loadEnvFile(file) {
  if (!existsSync(file)) {
    return;
  }

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const key = parseEnvAssignmentKey(line);
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    process.env[key] = parseEnvValue(line.slice(separatorIndex + 1));
  }
}

function parseEnvValue(value) {
  const trimmed = stripInlineEnvComment(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function stripInlineEnvComment(value) {
  let quote;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '#') {
      return value.slice(0, index);
    }
  }
  return value;
}

async function checkDatabaseServiceHealth() {
  try {
    const { checkDatabaseHealth } = await loadDatabaseTools();
    return await checkDatabaseHealth();
  } catch (error) {
    return {
      ok: false,
      ms: 0,
      message: `database checker unavailable: ${error?.message ?? String(error)}`,
    };
  }
}

async function loadDatabaseTools() {
  databaseToolsPromise ??= import('../scripts/db-connection.mjs');
  return await databaseToolsPromise;
}

function databaseDisplayUrl() {
  const connectionString = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;
  if (!connectionString) {
    return 'DATABASE_URL';
  }

  try {
    const url = new URL(connectionString);
    const user = url.username ? `${decodeURIComponent(url.username)}@` : '';
    return `${url.protocol}//${user}${url.host}${url.pathname}`;
  } catch {
    return 'invalid database URL';
  }
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

async function startLocalSettlementService() {
  return await runCommand('systemctl', ['--user', 'start', localSettlementSystemdUnit], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });
}

async function runNpmScriptCommand(script, scriptArgs) {
  return await runNpmCommand(['run', script, '--', ...scriptArgs]);
}

async function runNpmCommand(npmArgs) {
  return await runCommand(npmCmd, npmArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });
}

async function runCommand(commandName, commandArgs, options) {
  return await new Promise((resolvePromise) => {
    const child = spawn(commandName, commandArgs, options);
    child.on('error', (error) => {
      console.error(`${commandName} failed to start: ${error?.message ?? String(error)}`);
      resolvePromise(1);
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
