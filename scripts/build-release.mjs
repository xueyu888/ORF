#!/usr/bin/env node

import childProcess from "node:child_process";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = path.join(rootDir, ".artifacts");
const releasesDir = path.join(artifactsDir, "releases");
const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
const gitCommit = run("git", ["rev-parse", "HEAD"], { capture: true }).trim();
const gitDirty = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { capture: true }).trim().length > 0;
const allowDirty = process.argv.includes("--allow-dirty");
const requestedReleaseId = readArg("--release-id");
const releaseId = requestedReleaseId
  ? `${requestedReleaseId}${gitDirty && !requestedReleaseId.includes("dirty") ? "-dirty" : ""}`
  : defaultReleaseId(packageJson.version, gitCommit, gitDirty);
const releaseDir = path.join(releasesDir, releaseId);
const stageDir = path.join(artifactsDir, `release-build-${process.pid}`);
const archivePath = path.join(releasesDir, `orf-${releaseId}.tar.gz`);

assertReleaseId(releaseId);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function defaultReleaseId(version, commit, dirty) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${version}-${commit.slice(0, 12)}${dirty ? "-dirty" : ""}-${timestamp}`;
}

function assertReleaseId(value) {
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/.test(value)) {
    throw new Error(`Invalid release id: ${value}`);
  }
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}`);
  return options.capture ? result.stdout : "";
}

async function pathExists(filePath) {
  return stat(filePath).then(() => true, (error) => {
    if (error?.code === "ENOENT") return false;
    throw error;
  });
}

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function collectFileHashes(directory, prefix = "") {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await collectFileHashes(absolutePath, relativePath));
    else if (entry.isFile()) result[relativePath] = await sha256(absolutePath);
    else throw new Error(`Release artifact cannot contain special file: ${relativePath}`);
  }
  return result;
}

async function main() {
  if (gitDirty && !allowDirty) {
    throw new Error("Refusing to publish a release from a dirty worktree. Commit the intended scope first, or use --allow-dirty only for local artifact validation.");
  }
  if (await pathExists(releaseDir) || await pathExists(archivePath)) {
    throw new Error(`Release id is immutable and already exists: ${releaseId}`);
  }

  await rm(stageDir, { force: true, recursive: true });
  await mkdir(stageDir, { recursive: true });
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
  run(process.execPath, ["scripts/build-server.mjs", "--out-dir", path.relative(rootDir, path.join(stageDir, "server"))]);
  run(process.execPath, ["scripts/build-web.mjs", "--out-dir", path.relative(rootDir, path.join(stageDir, "web"))]);

  await rename(path.join(stageDir, "server", "orf-server.mjs"), path.join(stageDir, "server.mjs"));
  await rename(path.join(stageDir, "server", "orf-server.mjs.map"), path.join(stageDir, "server.mjs.map"));
  await rename(path.join(stageDir, "server", "migrate.mjs"), path.join(stageDir, "migrate.mjs"));
  await rename(path.join(stageDir, "server", "migrate.mjs.map"), path.join(stageDir, "migrate.mjs.map"));
  await rm(path.join(stageDir, "server"), { recursive: true });
  await cp(path.join(rootDir, "drizzle"), path.join(stageDir, "drizzle"), { recursive: true });
  const backgroundSourceRoot = path.join(rootDir, "public", "settings", "backgrounds");
  const backgroundTargetRoot = path.join(stageDir, "public", "settings", "backgrounds");
  for (const scene of await readdir(backgroundSourceRoot, { withFileTypes: true })) {
    if (!scene.isDirectory()) continue;
    const sourceDirectory = path.join(backgroundSourceRoot, scene.name, "default");
    if (!await pathExists(sourceDirectory)) continue;
    await cp(sourceDirectory, path.join(backgroundTargetRoot, scene.name, "default"), { recursive: true });
  }

  const manifest = {
    formatVersion: 1,
    releaseId,
    applicationVersion: packageJson.version,
    gitCommit,
    gitDirty,
    builtAt: new Date().toISOString(),
    node: process.version,
    files: await collectFileHashes(stageDir),
  };
  await writeFile(path.join(stageDir, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(releasesDir, { recursive: true });
  await rename(stageDir, releaseDir);
  run("tar", ["-czf", archivePath, "-C", releaseDir, "."]);
  await writeFile(`${archivePath}.sha256`, `${await sha256(archivePath)}  ${path.basename(archivePath)}\n`);
  console.log(`Immutable release directory: ${path.relative(rootDir, releaseDir)}`);
  console.log(`Deployable archive: ${path.relative(rootDir, archivePath)}`);
}

try {
  await main();
} finally {
  await rm(stageDir, { force: true, recursive: true });
}
