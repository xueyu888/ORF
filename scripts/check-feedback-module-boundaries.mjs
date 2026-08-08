#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feedbackPackageDir = path.join(rootDir, "modules", "feedback");
const expectedExports = new Map([
  ["./contracts", "./src/public/contracts.ts"],
  ["./server", "./src/public/server.ts"],
  ["./web", "./src/public/web.ts"],
  ["./testing", "./src/public/testing.ts"],
]);
const allowedFeedbackSpecifiers = new Set(
  [...expectedExports.keys()].map((key) => `@orf/feedback-module/${key.slice("./".length)}`),
);
const legacyBaseline = await readJson(path.join(rootDir, "scripts", "feedback-module-boundary-baseline.json"));
const allowedLegacyDeepImports = new Set(
  (legacyBaseline.legacyDeepImports ?? []).map((entry) => legacyDeepImportKey(entry.file, entry.specifier)),
);
const seenLegacyDeepImports = new Set();
const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const ignoredDirectories = new Set([
  ".artifacts",
  ".git",
  ".orf",
  "android",
  "dist",
  "ios",
  "node_modules",
  "public",
]);

const errors = [];

await checkPackageExports();
await checkServerPublicBoundary();
await checkTsconfigPaths();
await scanSourceImports();

if (errors.length > 0) {
  console.error("Feedback module boundary check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Feedback module boundary check passed.");

async function checkPackageExports() {
  const packageJson = await readJson(path.join(feedbackPackageDir, "package.json"));
  const exportsMap = packageJson.exports ?? {};

  if (Object.hasOwn(exportsMap, ".")) {
    errors.push("modules/feedback/package.json must not export a default '.' entry.");
  }

  for (const [subpath, target] of expectedExports) {
    if (exportsMap[subpath] !== target) {
      errors.push(`modules/feedback/package.json export ${subpath} must be ${target}.`);
    }
  }

  for (const subpath of Object.keys(exportsMap)) {
    if (!expectedExports.has(subpath)) {
      errors.push(`modules/feedback/package.json has unsupported export ${subpath}.`);
    }
  }
}

async function checkServerPublicBoundary() {
  const publicServerPath = path.join(feedbackPackageDir, "src", "public", "server.ts");
  const source = await fs.readFile(publicServerPath, "utf8");
  if (source.includes("feedbackDatabaseSchema") || source.includes("../infrastructure/database/schema")) {
    errors.push("modules/feedback/src/public/server.ts must not export feedback database schema or table objects.");
  }
  if (source.includes("FeedbackWriteActor")) {
    errors.push("modules/feedback/src/public/server.ts must not export write-model actor types; expose a narrower protocol-owned actor type instead.");
  }
  const forbiddenTypeExports = [
    {
      names: ["FeedbackTargetTitleSync", "FeedbackTransitionNotificationDispatchFactory"],
      specifier: "../server/writeModel",
    },
    {
      names: ["FeedbackNotificationDispatchDraft", "FeedbackNotificationPort"],
      specifier: "../server/notificationDispatch",
    },
    {
      names: ["FeedbackNotificationRecipientDirectory"],
      specifier: "../server/subscriptions",
    },
    {
      names: ["FeedbackReportAttachmentObjectRef"],
      specifier: "../server/reportAttachmentContent",
    },
    {
      names: ["FeedbackBackupAttachmentFile", "FeedbackImportActor"],
      specifier: "../server/transfer",
    },
    {
      names: ["FeedbackReadModelViewer"],
      specifier: "../server/readModel",
    },
  ];
  for (const block of exportBlocks(source)) {
    for (const rule of forbiddenTypeExports) {
      if (block.specifier !== rule.specifier) {
        continue;
      }
      for (const name of rule.names) {
        if (new RegExp(`\\b${name}\\b`).test(block.names)) {
          errors.push(`modules/feedback/src/public/server.ts must export ${name} from a protocol file, not ${rule.specifier}.`);
        }
      }
    }
  }
}

async function checkTsconfigPaths() {
  const tsconfig = await readJson(path.join(rootDir, "tsconfig.json"));
  const paths = tsconfig.compilerOptions?.paths ?? {};

  for (const [subpath, target] of expectedExports) {
    const alias = `@orf/feedback-module/${subpath.slice("./".length)}`;
    const expectedTarget = target.replace(/^\.\//, "modules/feedback/");
    const actualTargets = paths[alias];
    if (!Array.isArray(actualTargets) || actualTargets.length !== 1 || actualTargets[0] !== expectedTarget) {
      errors.push(`tsconfig path ${alias} must point only to ${expectedTarget}.`);
    }
  }
}

async function scanSourceImports() {
  for (const filePath of await listSourceFiles(rootDir)) {
    const relativePath = slash(path.relative(rootDir, filePath));
    const source = await fs.readFile(filePath, "utf8");
    for (const specifier of moduleSpecifiers(source)) {
      checkSpecifier(relativePath, specifier);
    }
  }

  for (const key of allowedLegacyDeepImports) {
    if (!seenLegacyDeepImports.has(key)) {
      errors.push(`legacy feedback deep import baseline is stale: ${key}`);
    }
  }
}

function checkSpecifier(relativePath, specifier) {
  if (specifier === "@orf/feedback-module") {
    errors.push(`${relativePath} imports @orf/feedback-module default entry; use one of contracts/server/web/testing.`);
    return;
  }

  if (specifier.startsWith("@orf/feedback-module/")) {
    if (!allowedFeedbackSpecifiers.has(specifier)) {
      errors.push(`${relativePath} imports unsupported feedback module subpath ${specifier}.`);
      return;
    }
    if (specifier === "@orf/feedback-module/server" && !canImportFeedbackServer(relativePath)) {
      errors.push(`${relativePath} imports @orf/feedback-module/server outside the composition root or feedback adapter boundaries.`);
      return;
    }
    if (specifier === "@orf/feedback-module/testing" && !canImportFeedbackTesting(relativePath)) {
      errors.push(`${relativePath} imports @orf/feedback-module/testing outside tests.`);
    }
    return;
  }

  if (!specifier.startsWith(".")) {
    return;
  }

  const resolved = slash(path.relative(rootDir, path.resolve(rootDir, path.dirname(relativePath), specifier)));
  if (resolved.startsWith("modules/feedback/src/") && !relativePath.startsWith("modules/feedback/")) {
    const key = legacyDeepImportKey(relativePath, specifier);
    if (allowedLegacyDeepImports.has(key)) {
      seenLegacyDeepImports.add(key);
      return;
    }
    errors.push(`${relativePath} imports feedback internals through ${specifier}; use @orf/feedback-module/* exports.`);
  }
}

function canImportFeedbackTesting(relativePath) {
  return relativePath.startsWith("tests/") || relativePath.startsWith("testd/");
}

function canImportFeedbackServer(relativePath) {
  return relativePath === "server/app.ts" ||
    relativePath.startsWith("server/feedback/") ||
    relativePath === "server/readModels/feedbackIssueReadModel.ts";
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const pattern = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/gs;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1] ?? match[2]);
  }
  return specifiers;
}

function exportBlocks(source) {
  const blocks = [];
  const pattern = /\bexport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    blocks.push({ names: match[1] ?? "", specifier: match[2] ?? "" });
  }
  return blocks;
}

async function listSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function slash(value) {
  return value.split(path.sep).join("/");
}

function legacyDeepImportKey(file, specifier) {
  return `${file}|${specifier}`;
}
