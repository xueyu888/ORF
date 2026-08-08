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
await checkWebPublicBoundary();
await checkHostFeedbackNotificationBoundary();
await checkHostCommentTargetBoundary();
await checkHostDriveFeedbackBoundary();
await checkFeedbackLegacyRemovalBoundary();
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
  if (source.includes("FeedbackCommandResult")) {
    errors.push("modules/feedback/src/public/server.ts must not export command result DTOs; expose them from contracts.");
  }
  if (source.includes("FeedbackImportActor")) {
    errors.push("modules/feedback/src/public/server.ts must not export import actor DTOs; expose them from contracts.");
  }
  const forbiddenServerProtocolExports = [
    "FeedbackNotificationDispatchDraft",
    "FeedbackNotificationPort",
    "FeedbackNotificationRecipientDirectory",
    "FeedbackReportAttachmentObjectRef",
    "FeedbackTargetTitleSync",
    "FeedbackTransitionNotificationDispatchFactory",
    "listFeedbackReportAttachmentObjectRefs",
  ];
  for (const name of forbiddenServerProtocolExports) {
    if (new RegExp(`\\b${name}\\b`).test(source)) {
      errors.push(`modules/feedback/src/public/server.ts must not export ${name}; keep internal server protocols inside the feedback module.`);
    }
  }
  const forbiddenTypeExports = [
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

async function checkWebPublicBoundary() {
  const publicWebPath = path.join(feedbackPackageDir, "src", "public", "web.ts");
  const source = await fs.readFile(publicWebPath, "utf8");
  const forbiddenRuntimeWebExports = [
    "buildFeedbackIssueCurrentViewCsv",
    "feedbackIssueCsvExportFileName",
    "buildFeedbackIssueListItems",
    "feedbackIssueAssigneeOptions",
    "feedbackIssueAuthorOptions",
    "feedbackIssueListDefaultPageLimit",
    "feedbackIssueLabelOptions",
    "feedbackIssueListCountsForFilters",
    "filterFeedbackIssueListItems",
    "clearStoredFeedbackIssueListFilterParams",
    "feedbackIssueListFilterParamsFromPreferenceRecord",
    "feedbackIssueListFilterPreferenceKey",
    "feedbackIssueListFilterPreferenceRecordFromSearchParams",
    "feedbackIssueListFilterQueryFromSearchParams",
    "feedbackIssueListUrlStateFromSearchParams",
    "parseStoredFeedbackIssueListFilterParams",
    "readStoredFeedbackIssueListFilterParams",
    "feedbackIssueListPageQuery",
    "mergeFeedbackIssueListReadModelPages",
    "feedbackIssueLabelIndexItems",
    "feedbackIssueLabels",
    "feedbackIssueRelationSummaries",
    "feedbackAssigneeOptionsFromUsers",
    "ensureFeedbackAssigneeOption",
    "mergeFeedbackAssigneeOptions",
    "useFeedbackAssigneeOptions",
    "useFeedbackIssueDetailReadModel",
    "useFeedbackIssueListReadModel",
    "useFeedbackIssueReadModel",
    "feedbackCauseGroupForCategory",
    "feedbackCauseGroupsForCategories",
    "feedbackMatchesCauseGroup",
    "teamFeedbackCauseOptions",
    "FeedbackDashboardSummary",
    "FeedbackDashboardSummaryItem",
    "FeedbackIssueReadModelData",
    "FeedbackReferenceCardQuery",
    "FeedbackSubscription",
    "FeedbackSubscriptionMode",
    "FeedbackWebActivityItem",
    "FeedbackWebCommentMessage",
    "FeedbackWebCommentThread",
    "FeedbackWebIssue",
    "FeedbackWebProject",
    "FeedbackWebRelation",
    "FeedbackWebSession",
    "FeedbackWebUserSummary",
    "canCreateTeamFeedback",
    "canImportExportTeamFeedback",
    "feedbackImpactLabel",
    "feedbackIssueBodyPreview",
    "feedbackIssueDisplayId",
    "feedbackIssueHref",
    "feedbackIssueIdFromHref",
    "feedbackIssueIdsFromText",
    "feedbackIssueMarkdownLabel",
    "feedbackIssueMarkdownLink",
    "feedbackLifecycleLabel",
    "feedbackPriorityLabel",
    "formatPastedFeedbackLinks",
    "isFeedbackIssueOpen",
  ];

  for (const name of forbiddenRuntimeWebExports) {
    if (new RegExp(`\\b${name}\\b`).test(source)) {
      errors.push(`modules/feedback/src/public/web.ts must not export ${name}; use contracts or @orf/feedback-module/testing as appropriate.`);
    }
  }

  if (/\bexport\s+function\s+isFeedbackPath\b/.test(source)) {
    errors.push("modules/feedback/src/public/web.ts must not export isFeedbackPath; use contracts for route path checks.");
  }

  const forbiddenPathExports = [
    "feedbackCreatePath",
    "feedbackIssuePath",
    "feedbackLabelsPath",
    "feedbackListPath",
    "feedbackRootPath",
    "isFeedbackPath",
  ];
  for (const block of exportBlocks(source)) {
    for (const name of forbiddenPathExports) {
      if (new RegExp(`\\b${name}\\b`).test(block.names)) {
        errors.push(`modules/feedback/src/public/web.ts must not export ${name}; use contracts for route path helpers.`);
      }
    }
  }
}

async function checkHostFeedbackNotificationBoundary() {
  const globalTypesPath = path.join(rootDir, "src", "types", "orf.ts");
  const globalTypesSource = await fs.readFile(globalTypesPath, "utf8");
  if (globalTypesSource.includes("@orf/feedback-module")) {
    errors.push("src/types/orf.ts must not import feedback module exports; keep feedback-owned contracts inside @orf/feedback-module/contracts.");
  }
  if (globalTypesSource.includes("FeedbackNotificationEventKind")) {
    errors.push("src/types/orf.ts must not add feedback notification kinds to the global NotificationKind union; register feedback kinds through the feedback notification provider.");
  }

  const attentionModelPath = path.join(rootDir, "src", "features", "attention", "attentionModel.ts");
  const attentionModelSource = await fs.readFile(attentionModelPath, "utf8");
  if (attentionModelSource.includes("feedbackNotificationEventKindValues") || attentionModelSource.includes("FeedbackNotificationEventKind")) {
    errors.push("src/features/attention/attentionModel.ts must not import feedback notification kind lists; consume generic attention fields from notifications.");
  }
}

async function checkHostCommentTargetBoundary() {
  const commentRoutesSource = await fs.readFile(path.join(rootDir, "server", "routes", "commentRoutes.ts"), "utf8");
  if (/\bz\.enum\(\s*\[\s*["']objective["']\s*,\s*["']result["']\s*,\s*["']task["']\s*,\s*["']subtask["']\s*,\s*["']feedback["']\s*\]\s*\)/.test(commentRoutesSource)) {
    errors.push("server/routes/commentRoutes.ts must not hardcode feedback in the comment target type schema; use the comment target registry.");
  }

  const notificationPublisherSource = await fs.readFile(path.join(rootDir, "server", "notifications", "publisher.ts"), "utf8");
  if (/\bvalue\s*===\s*["']feedback["']/.test(notificationPublisherSource)) {
    errors.push("server/notifications/publisher.ts must not hardcode feedback as a comment reply target; use the comment target registry.");
  }
}

async function checkHostDriveFeedbackBoundary() {
  const driveRepositoryPath = path.join(rootDir, "server", "repositories", "driveRepository.ts");
  const source = await fs.readFile(driveRepositoryPath, "utf8");
  if (/\b(?:FROM|JOIN)\s+feedback\b/i.test(source)) {
    errors.push("server/repositories/driveRepository.ts must not query the feedback table directly; resolve feedback contexts through the registered feedback reference provider.");
  }
  if (source.includes("feedbackReferenceRegistry")) {
    errors.push("server/repositories/driveRepository.ts must not import feedback-specific registries; use the drive-owned context provider registry.");
  }
}

async function checkFeedbackLegacyRemovalBoundary() {
  const forbiddenFiles = [
    "server/routes/feedbackRoutes.ts",
    "server/repositories/feedbackRepository.ts",
    "server/repositories/feedbackSubscriptionRepository.ts",
  ];
  for (const relativePath of forbiddenFiles) {
    if (await pathExists(path.join(rootDir, relativePath))) {
      errors.push(`${relativePath} must be removed; feedback is owned by modules/feedback and server/feedback adapters.`);
    }
  }

  const schemaSource = await fs.readFile(path.join(rootDir, "server", "db", "schema.ts"), "utf8");
  if (/\bpgTable\(\s*["']feedback["']/.test(schemaSource)) {
    errors.push("server/db/schema.ts must not define the feedback table; use the feedback module schema entry.");
  }
  if (/\bpgEnum\(\s*["']feedback_status["']/.test(schemaSource)) {
    errors.push("server/db/schema.ts must not define feedback_status; feedback uses feedback_stage and feedback_resolution.");
  }

  const checkedDirectories = [
    "server",
    "src",
    "docs/project",
    "docs/backend",
    "docs/frontend",
  ];
  const forbiddenPatterns = [
    { pattern: /\bPATCH\s+\/api\/feedback\/[^ \n]*\/status\b/, message: "must not document or implement the legacy feedback status API." },
    { pattern: /\bFeedbackStatus\b/, message: "must not use the legacy FeedbackStatus type." },
    { pattern: /\bnextFeedbackIssueStatus\b/, message: "must not use the legacy nextFeedbackIssueStatus helper." },
    { pattern: /\bfeedbackIssueLinkedFeedback\b/, message: "must not derive feedback relations from body text." },
    { pattern: /\bOrfState\.feedback\b/, message: "must not keep feedback in the global OrfState snapshot." },
    { pattern: /\bTaskManagementData\.feedback\b/, message: "must not keep full feedback collections in TaskManagementData." },
    { pattern: /\bfeedbackSubscriptionRepository\b/, message: "must not reference the old feedbackSubscriptionRepository." },
    { pattern: /\bserver\/routes\/feedbackRoutes\b/, message: "must not reference the old feedback route path." },
    { pattern: /\bserver\/repositories\/feedbackRepository\b/, message: "must not reference the old feedback repository path." },
  ];

  for (const relativePath of await listFilesByExtensions(checkedDirectories, new Set([".md", ".ts", ".tsx"]))) {
    const source = await fs.readFile(path.join(rootDir, relativePath), "utf8");
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(source)) {
        errors.push(`${relativePath} ${rule.message}`);
      }
    }
  }

  for (const relativePath of await listFilesByExtensions(["server/feedback", "modules/feedback/src"], new Set([".ts", ".tsx"]))) {
    const source = await fs.readFile(path.join(rootDir, relativePath), "utf8");
    if (/\bdestinationChannelIds\b/.test(source)) {
      errors.push(`${relativePath} must not route feedback notifications to project chat channels.`);
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
    if (specifier === "@orf/feedback-module/web" && !canImportFeedbackWeb(relativePath)) {
      errors.push(`${relativePath} imports @orf/feedback-module/web outside the feedback Web adapter boundary.`);
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

function canImportFeedbackWeb(relativePath) {
  return relativePath.startsWith("src/feedback/");
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
  return listFilesInDirectory(directory, sourceExtensions);
}

async function listFilesByExtensions(relativeDirectories, extensions) {
  const files = [];
  for (const relativeDirectory of relativeDirectories) {
    const absoluteFiles = await listFilesInDirectory(path.join(rootDir, relativeDirectory), extensions);
    files.push(...absoluteFiles.map((filePath) => slash(path.relative(rootDir, filePath))));
  }
  return files;
}

async function listFilesInDirectory(directory, extensions) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesInDirectory(fullPath, extensions));
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function slash(value) {
  return value.split(path.sep).join("/");
}

function legacyDeepImportKey(file, specifier) {
  return `${file}|${specifier}`;
}
