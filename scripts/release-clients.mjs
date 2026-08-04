#!/usr/bin/env node

import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import {
  clientUpdateApiEndpoint,
  formatBytes,
  normalizeReleaseVersion,
  publishClientUpdateReleaseToOrf as publishReleaseToOrf,
} from "./client-update-publisher.mjs";

const defaultRepository = "xueyu888/ORF";

const options = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const releaseTag = options.tag ?? `v${packageJson.version}`;
const repository = options.repository ?? defaultRepository;
const releaseNotesMarker = "更新说明：";

if (options.help) {
  printHelp();
  process.exit(0);
}

const releaseNotes = resolveReleaseNotesOption(options);

assertReleaseTag(releaseTag);
if (options.broadcastOnly) {
  await broadcastClientUpdateRelease({ tagName: releaseTag }, { force: true });
  process.exit(0);
}

const branch = options.branch ?? git(["branch", "--show-current"], { capture: true }).trim();
if (!branch) {
  fail("当前不在命名分支上，无法安全发布客户端。");
}

const status = git(["status", "--porcelain"], { capture: true }).trim();
if (status) {
  fail(`工作区不干净，请先提交或清理后再发布。\n${status}`);
}

const pendingCommits = git(["log", "--reverse", "--oneline", `origin/${branch}..HEAD`], { capture: true }).trim();
if (pendingCommits) {
  logSection(`准备推送 ${branch} 的本地提交`);
  console.log(pendingCommits);
}

ensureLocalTagAtHead(releaseTag, releaseNotes);

logSection(`推送分支 ${branch}`);
git(["push", "--no-verify", "origin", branch]);

logSection(`推送发布 tag ${releaseTag}`);
git(["push", "--no-verify", "origin", releaseTag]);

if (!options.watch) {
  console.log(`已触发 Release 工作流。稍后可用 gh run list --repo ${repository} --workflow release-clients.yml 查看。`);
  console.log(`如果要等待并核对资产，运行: npm run release:clients -- --tag ${releaseTag} --watch`);
  if (options.broadcast) {
    console.log("当前未使用 --watch，发布脚本不会执行发布后在线客户端广播。");
  }
  process.exit(0);
}

const runId = waitForReleaseRun({ repository, tag: releaseTag });
logSection(`等待 GitHub Release 工作流完成: ${runId}`);
runGh(["run", "watch", runId, "--repo", repository, "--exit-status"], { stdio: "inherit" });

logSection(`核对 GitHub Release ${releaseTag}`);
const release = readJsonWithRetry(() => runGh([
  "release",
  "view",
  releaseTag,
  "--repo",
  repository,
  "--json",
  "tagName,name,url,assets,body,publishedAt,isDraft,isPrerelease",
], { capture: true, throwOnError: true }));

console.log(`${release.name} ${release.url}`);
for (const asset of release.assets ?? []) {
  console.log(`- ${asset.name} (${formatBytes(asset.size)})`);
}
assertReleaseBodyHasNotes(release, releaseTag);

await publishClientUpdateReleaseToOrf(release);
await broadcastClientUpdateRelease(release);

function parseArgs(args) {
  const parsed = {
    branch: null,
    broadcast: false,
    broadcastOnly: false,
    broadcastUrl: null,
    help: false,
    notes: null,
    notesFile: null,
    publishAssets: true,
    publishUrl: null,
    repository: null,
    tag: null,
    watch: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--watch") parsed.watch = true;
    else if (arg === "--no-watch") parsed.watch = false;
    else if (arg === "--broadcast") parsed.broadcast = true;
    else if (arg === "--broadcast-only") {
      parsed.broadcast = true;
      parsed.broadcastOnly = true;
    }
    else if (arg === "--no-broadcast") parsed.broadcast = false;
    else if (arg === "--no-publish-assets") parsed.publishAssets = false;
    else if (arg === "--notes") parsed.notes = readValue(args, ++index, arg);
    else if (arg === "--notes-file") parsed.notesFile = readValue(args, ++index, arg);
    else if (arg === "--broadcast-url") parsed.broadcastUrl = readValue(args, ++index, arg);
    else if (arg === "--publish-url") parsed.publishUrl = readValue(args, ++index, arg);
    else if (arg === "--branch") parsed.branch = readValue(args, ++index, arg);
    else if (arg === "--repo") parsed.repository = readValue(args, ++index, arg);
    else if (arg === "--tag") parsed.tag = readValue(args, ++index, arg);
    else fail(`未知参数: ${arg}`);
  }
  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value) fail(`${flag} 缺少参数值。`);
  return value;
}

function printHelp() {
  console.log(`ORF 客户端 Release 发布脚本

用法:
  npm run release:clients -- --tag v0.0.3 --notes "修复工作日志入口，并优化客户端更新提示"
  npm run release:clients -- --tag v0.0.3 --notes-file release-notes/v0.0.3.md --watch --no-broadcast
  npm run release:clients -- --tag v0.0.3 --broadcast-only

行为:
  - 常规发布要求工作区干净；--broadcast-only 只通知已同步版本，不推送分支或 tag。
  - 使用 package.json 版本作为默认 tag，也可用 --tag 指定。
  - 新发布 tag 必须提供 --notes 或 --notes-file，说明本版本面向用户更新了什么。
  - 发布说明会写入 annotated tag，GitHub Release 和 ORF 主更新源共用这份说明。
  - 使用 git push --no-verify 推送分支和 tag，避免发布时触发本地 testd pre-push 门禁。
  - 默认只触发 .github/workflows/release-clients.yml，不等待 GitHub Actions。
  - 加 --watch 时才等待工作流完成并核对 GitHub Release 镜像资产。
  - --watch 核对 GitHub Release 镜像资产后，会在配置 ORF_CLIENT_UPDATE_PUBLISH_SECRET 时把安装包同步到 ORF 主更新源。
  - 发布脚本默认不广播，避免完整发布时在生产后端和 public-gateway 稳定前弹出更新提示。
  - 只发布客户端且确认后续不会重启生产服务时，可加 --broadcast 在资产同步后立即通知当前 SSE 实时连接客户端。
  - 完整发布必须等生产入口验证通过后，再运行 --broadcast-only 广播已同步的版本。
  - 可用 --no-publish-assets 跳过 ORF 主更新源同步，或用 --publish-url 覆盖 ORF_CLIENT_UPDATE_PUBLISH_URL / ORF_APP_URL。
  - 可用 --no-broadcast 明确保持不广播，或用 --broadcast-url 覆盖 ORF_CLIENT_UPDATE_BROADCAST_URL / ORF_APP_URL。
`);
}

function assertReleaseTag(tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    fail(`发布 tag 不合法: ${tag}`);
  }
}

function resolveReleaseNotesOption(input) {
  if (input.notes && input.notesFile) {
    fail("只能指定 --notes 或 --notes-file 其中一个。");
  }
  if (input.notesFile) {
    try {
      return normalizeReleaseNotesText(fs.readFileSync(input.notesFile, "utf8"));
    } catch (error) {
      fail(`读取发布说明文件失败: ${input.notesFile}\n${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (input.notes) {
    return normalizeReleaseNotesText(input.notes);
  }
  return null;
}

function normalizeReleaseNotesText(value) {
  const normalized = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return normalized || null;
}

function ensureLocalTagAtHead(tag, notes) {
  const head = git(["rev-parse", "HEAD"], { capture: true }).trim();
  const existingTag = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}^{}`], { encoding: "utf8" });
  if (existingTag.status === 0) {
    const tagCommit = existingTag.stdout.trim();
    if (tagCommit !== head) {
      fail(`${tag} 已存在但不指向当前 HEAD: ${tagCommit}`);
    }
    assertExistingTagHasReleaseNotes(tag, notes);
    console.log(`${tag} 已存在并指向当前 HEAD。`);
    return;
  }
  if (!notes) {
    fail(`发布客户端必须说明本版本更新了什么。请使用 --notes "..." 或 --notes-file <path> 后再发布 ${tag}。`);
  }
  git(["tag", "-a", tag, "-m", buildReleaseTagMessage(tag, notes)]);
}

function assertExistingTagHasReleaseNotes(tag, expectedNotes) {
  const tagType = git(["cat-file", "-t", `refs/tags/${tag}`], { capture: true }).trim();
  if (tagType !== "tag") {
    fail(`${tag} 已存在但不是 annotated tag，无法作为发布说明事实源。请确认删除并重建 tag，或改用带 release_notes 的 workflow_dispatch。`);
  }

  const actualNotes = extractReleaseNotesFromTag(tag);
  if (!actualNotes) {
    fail(`${tag} 已存在但没有 ${releaseNotesMarker}，无法保证发布说明包含“更新了什么”。请确认删除并重建 tag，或改用带 release_notes 的 workflow_dispatch。`);
  }
  if (expectedNotes && actualNotes !== expectedNotes) {
    fail(`${tag} 已存在，但 tag 内发布说明与当前 --notes/--notes-file 不一致。为避免重写发布历史，请先确认使用哪份说明。`);
  }
}

function buildReleaseTagMessage(tag, notes) {
  return `发布 ORF ${tag}\n\n${releaseNotesMarker}\n${notes}\n`;
}

function extractReleaseNotesFromTag(tag) {
  const message = git(["tag", "-l", tag, "--format=%(contents)"], { capture: true });
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const markerIndex = lines.findIndex((line) => line.trim() === releaseNotesMarker);
  if (markerIndex < 0) return null;
  return normalizeReleaseNotesText(lines.slice(markerIndex + 1).join("\n"));
}

function assertReleaseBodyHasNotes(release, tag) {
  const body = String(release.body ?? "");
  if (!body.includes(`ORF ${tag}`) || !body.includes("主要更新：")) {
    fail(`${tag} 的 GitHub Release 未包含完整版本信息和主要更新说明，已停止同步 ORF 主更新源。`);
  }
}

function waitForReleaseRun(input) {
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const runs = readJsonWithRetry(() => runGh([
      "run",
      "list",
      "--repo",
      input.repository,
      "--workflow",
      "release-clients.yml",
      "--branch",
      input.tag,
      "--limit",
      "5",
      "--json",
      "databaseId,status,event,headBranch,displayTitle,createdAt",
    ], { capture: true, throwOnError: true }), { attempts: 2 });
    const run = runs.find((candidate) => candidate.headBranch === input.tag && candidate.event === "push");
    if (run) return String(run.databaseId);
    console.log(`等待 Release 工作流出现... (${attempt}/18)`);
    sleep(5000);
  }
  fail(`没有找到 ${input.tag} 触发的 release-clients.yml 工作流。`);
}

function readJsonWithRetry(factory, options = {}) {
  const attempts = options.attempts ?? 4;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return JSON.parse(factory());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) sleep(3000 * attempt);
    }
  }
  throw lastError;
}

function git(args, options = {}) {
  return run("git", args, options);
}

function runGh(args, options = {}) {
  return run("gh", args, options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : options.stdio ?? "inherit",
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const message = `${command} ${args.join(" ")} 执行失败${detail ? `\n${detail}` : ""}`;
    if (options.throwOnError) {
      throw new Error(message);
    }
    fail(message);
  }
  return result.stdout ?? "";
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function logSection(label) {
  console.log(`\n== ${label} ==`);
}

async function publishClientUpdateReleaseToOrf(release) {
  if (!options.publishAssets) {
    console.log("已按 --no-publish-assets 跳过 ORF 主更新源同步。");
    return;
  }

  const secret = process.env.ORF_CLIENT_UPDATE_PUBLISH_SECRET?.trim();
  const targetUrl =
    options.publishUrl ??
    process.env.ORF_CLIENT_UPDATE_PUBLISH_URL ??
    process.env.ORF_APP_URL;
  if (!secret || !targetUrl) {
    console.log("未配置 ORF_CLIENT_UPDATE_PUBLISH_SECRET 或 ORF_CLIENT_UPDATE_PUBLISH_URL/ORF_APP_URL，已跳过 ORF 主更新源同步。");
    return;
  }

  const releaseVersion = normalizeReleaseVersion(release.tagName);
  logSection(`同步 ORF 主更新源 ${releaseVersion}`);
  try {
    await publishReleaseToOrf({ release, secret, targetUrl });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

async function broadcastClientUpdateRelease(release, settings = {}) {
  if (!settings.force && !options.broadcast) {
    console.log("当前未请求广播，已跳过发布后在线客户端广播。");
    return;
  }

  const secret = process.env.ORF_CLIENT_UPDATE_BROADCAST_SECRET?.trim();
  const targetUrl = options.broadcastUrl ?? process.env.ORF_CLIENT_UPDATE_BROADCAST_URL ?? process.env.ORF_APP_URL;
  if (!secret || !targetUrl) {
    const message = "未配置 ORF_CLIENT_UPDATE_BROADCAST_SECRET 或 ORF_CLIENT_UPDATE_BROADCAST_URL/ORF_APP_URL";
    if (settings.force) {
      fail(`${message}，无法执行单独广播。`);
    }
    console.log(`${message}，已跳过发布后在线客户端广播。`);
    return;
  }

  const releaseVersion = normalizeReleaseVersion(release.tagName);
  logSection(`广播 SSE 实时连接客户端更新 ${releaseVersion}`);
  const endpoint = clientUpdateBroadcastEndpoint(targetUrl);
  const response = await fetch(endpoint, {
    body: JSON.stringify({ version: releaseVersion }),
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    throw new Error(`请求 ORF 发布广播接口失败: ${error instanceof Error ? error.message : String(error)}`);
  });

  const bodyText = await response.text();
  if (!response.ok) {
    fail(`发布后在线客户端广播失败: HTTP ${response.status}${bodyText ? `\n${bodyText}` : ""}`);
  }

  const body = bodyText ? JSON.parse(bodyText) : {};
  const skipped = body.skipped ? "，同版本自动广播已处理过" : "";
  const realtimeRecipientUserCount = body.realtimeRecipientUserCount ?? body.onlineUserCount ?? 0;
  console.log(`已广播 ORF 客户端 ${body.releaseVersion ?? releaseVersion}，SSE 即时触达 ${realtimeRecipientUserCount} 人${skipped}。`);
  if (body.coverage) {
    console.log(
      `发布覆盖基线：最近 2 分钟活跃 ${body.coverage.recentActiveUserCount ?? 0} 人，` +
      `有效账号 ${body.coverage.activeAccountCount ?? 0} 人；` +
      `已检查 ${body.coverage.checkedUserCount ?? 0} 人，已展示 ${body.coverage.promptedUserCount ?? 0} 人，` +
      `开始安装 ${body.coverage.installStartedUserCount ?? 0} 人，已运行新版 ${body.coverage.activatedUserCount ?? 0} 人，` +
      `Android 推送尝试 ${body.coverage.androidPushAttemptedUserCount ?? 0} 人。`,
    );
  }
}

function clientUpdateBroadcastEndpoint(value) {
  return clientUpdateApiEndpoint(value, "/api/client-updates/broadcast-release");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
