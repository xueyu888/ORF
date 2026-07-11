#!/usr/bin/env node

import path from "node:path";
import { mkdir, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = path.join(rootDir, ".artifacts");
const outputDir = resolveOutputDir(readArg("--out-dir") ?? ".artifacts/server");
const stageDir = path.join(artifactsDir, `server-build-${process.pid}`);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function resolveOutputDir(value) {
  const resolved = path.resolve(rootDir, value);
  if (resolved !== artifactsDir && !resolved.startsWith(`${artifactsDir}${path.sep}`)) {
    throw new Error(`Server build output must stay inside .artifacts: ${resolved}`);
  }
  return resolved;
}

async function bundle(entryPoint, outfile) {
  await build({
    absWorkingDir: rootDir,
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    platform: "node",
    target: "node22",
    outfile,
    sourcemap: "linked",
    sourcesContent: false,
    legalComments: "none",
    banner: {
      js: 'import { createRequire as __orfCreateRequire } from "node:module"; const require = __orfCreateRequire(import.meta.url);',
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
}

async function main() {
  await rm(stageDir, { force: true, recursive: true });
  await mkdir(stageDir, { recursive: true });
  await Promise.all([
    bundle("server/index.ts", path.join(stageDir, "orf-server.mjs")),
    bundle("scripts/migrate-db.ts", path.join(stageDir, "migrate.mjs")),
  ]);
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(path.dirname(outputDir), { recursive: true });
  await rename(stageDir, outputDir);
  console.log(`Server runtime artifacts published to ${path.relative(rootDir, outputDir)}.`);
}

try {
  await main();
} finally {
  await rm(stageDir, { force: true, recursive: true });
}
