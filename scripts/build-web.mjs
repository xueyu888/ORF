#!/usr/bin/env node

import childProcess from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = path.join(rootDir, ".artifacts");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const outputDir = resolveOutputDir(readArg("--out-dir") ?? "dist");
const retainPrevious = process.argv.includes("--retain-previous");
const stageDir = path.join(artifactsDir, `web-build-${path.basename(outputDir)}-${process.pid}`);
const manifestPath = path.join(".vite", "manifest.json");

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function resolveOutputDir(value) {
  const resolved = path.resolve(rootDir, value);
  const webOutputDir = path.join(rootDir, "dist");
  const isArtifactOutput = resolved.startsWith(`${artifactsDir}${path.sep}`);
  if (resolved !== webOutputDir && !isArtifactOutput) {
    throw new Error(`Unsafe web build output directory: ${resolved}`);
  }
  return resolved;
}

function normalizedRelativePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isServerOnlyArtifact(relativePath) {
  return relativePath.startsWith("settings/") || relativePath.startsWith(".orf/");
}

async function walkFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(normalizedRelativePath(relativePath));
    } else {
      throw new Error(`Web build output may not contain symbolic links or special files: ${relativePath}`);
    }
  }
  return files;
}

async function assertPublicOnlyBuild(directory) {
  const serverOnlyArtifacts = (await walkFiles(directory)).filter(isServerOnlyArtifact);
  if (serverOnlyArtifacts.length > 0) {
    throw new Error(`Web build contains server-only settings artifacts:\n${serverOnlyArtifacts.slice(0, 20).join("\n")}`);
  }
}

function collectManifestAssetFiles(manifest) {
  const files = new Set();
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidates = [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.startsWith("assets/")) {
        files.add(candidate);
      }
    }
  }
  return files;
}

async function previousCurrentAssetFiles() {
  if (!retainPrevious) {
    return new Set();
  }
  try {
    const manifest = JSON.parse(await readFile(path.join(outputDir, manifestPath), "utf8"));
    return collectManifestAssetFiles(manifest);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return new Set();
    }
    throw error;
  }
}

async function retainPreviousAssets() {
  const files = await previousCurrentAssetFiles();
  let retained = 0;
  for (const relativePath of files) {
    const sourcePath = path.join(outputDir, relativePath);
    const targetPath = path.join(stageDir, relativePath);
    try {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
      retained += 1;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "EEXIST")) {
        continue;
      }
      throw error;
    }
  }
  return retained;
}

async function copyFileAtomically(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  try {
    await copyFile(sourcePath, tempPath);
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function removeEmptyDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await removeEmptyDirectories(path.join(directory, entry.name));
    }
  }
  if (directory !== outputDir && (await readdir(directory).catch(() => [])).length === 0) {
    await rm(directory, { recursive: true, force: true });
  }
}

async function syncStageToOutput() {
  await mkdir(outputDir, { recursive: true });
  const desiredFiles = new Set(await walkFiles(stageDir));
  const entryFile = "index.html";

  for (const relativePath of desiredFiles) {
    if (relativePath !== entryFile) {
      await copyFileAtomically(path.join(stageDir, relativePath), path.join(outputDir, relativePath));
    }
  }
  await copyFileAtomically(path.join(stageDir, entryFile), path.join(outputDir, entryFile));

  for (const relativePath of await walkFiles(outputDir)) {
    if (!desiredFiles.has(relativePath)) {
      await rm(path.join(outputDir, relativePath), { force: true });
    }
  }
  await removeEmptyDirectories(outputDir);
}

async function build() {
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(artifactsDir, { recursive: true });

  const result = childProcess.spawnSync(
    process.execPath,
    [viteBin, "build", "--outDir", stageDir, "--emptyOutDir"],
    { cwd: rootDir, env: process.env, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`Vite build failed with exit code ${result.status ?? "unknown"}`);
  }

  await assertPublicOnlyBuild(stageDir);
  const retainedAssetCount = await retainPreviousAssets();
  if (!retainPrevious) {
    await rm(path.join(stageDir, ".vite"), { recursive: true, force: true });
  }
  await syncStageToOutput();
  await assertPublicOnlyBuild(outputDir);
  console.log(`Web build published to ${path.relative(rootDir, outputDir)}; retained ${retainedAssetCount} assets from the previous build.`);
}

try {
  await build();
} finally {
  await rm(stageDir, { recursive: true, force: true });
}
