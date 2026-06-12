#!/usr/bin/env node

import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const defaultRepository = "xueyu888/ORF";

const options = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const releaseTag = options.tag ?? `v${packageJson.version}`;
const repository = options.repository ?? defaultRepository;

if (options.help) {
  printHelp();
  process.exit(0);
}

assertReleaseTag(releaseTag);
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

ensureLocalTagAtHead(releaseTag);

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
  "tagName,name,url,assets,publishedAt,isDraft,isPrerelease",
], { capture: true, throwOnError: true }));

console.log(`${release.name} ${release.url}`);
for (const asset of release.assets ?? []) {
  console.log(`- ${asset.name} (${formatBytes(asset.size)})`);
}

await broadcastClientUpdateRelease(release);

function parseArgs(args) {
  const parsed = { branch: null, broadcast: true, broadcastUrl: null, help: false, repository: null, tag: null, watch: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--watch") parsed.watch = true;
    else if (arg === "--no-watch") parsed.watch = false;
    else if (arg === "--no-broadcast") parsed.broadcast = false;
    else if (arg === "--broadcast-url") parsed.broadcastUrl = readValue(args, ++index, arg);
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
  npm run release:clients -- --tag v0.0.3
  npm run release:clients -- --tag v0.0.3 --watch

行为:
  - 要求工作区干净。
  - 使用 package.json 版本作为默认 tag，也可用 --tag 指定。
  - 使用 git push --no-verify 推送分支和 tag，避免发布时触发本地 testd pre-push 门禁。
  - 默认只触发 .github/workflows/release-clients.yml，不等待 GitHub Actions。
  - 加 --watch 时才等待工作流完成并核对 GitHub Release 资产。
  - --watch 确认 Release 资产后，会在配置 ORF_CLIENT_UPDATE_BROADCAST_SECRET 时调用 ORF 服务端广播在线客户端。
  - 可用 --no-broadcast 跳过发布后广播，或用 --broadcast-url 覆盖 ORF_CLIENT_UPDATE_BROADCAST_URL / ORF_APP_URL。
`);
}

function assertReleaseTag(tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    fail(`发布 tag 不合法: ${tag}`);
  }
}

function ensureLocalTagAtHead(tag) {
  const head = git(["rev-parse", "HEAD"], { capture: true }).trim();
  const existingTag = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}^{}`], { encoding: "utf8" });
  if (existingTag.status === 0) {
    const tagCommit = existingTag.stdout.trim();
    if (tagCommit !== head) {
      fail(`${tag} 已存在但不指向当前 HEAD: ${tagCommit}`);
    }
    console.log(`${tag} 已存在并指向当前 HEAD。`);
    return;
  }
  git(["tag", "-a", tag, "-m", `发布 ORF ${tag}`]);
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

function formatBytes(value) {
  if (!Number.isFinite(value)) return "unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function broadcastClientUpdateRelease(release) {
  if (!options.broadcast) {
    console.log("已按 --no-broadcast 跳过发布后在线客户端广播。");
    return;
  }

  const secret = process.env.ORF_CLIENT_UPDATE_BROADCAST_SECRET?.trim();
  const targetUrl = options.broadcastUrl ?? process.env.ORF_CLIENT_UPDATE_BROADCAST_URL ?? process.env.ORF_APP_URL;
  if (!secret || !targetUrl) {
    console.log("未配置 ORF_CLIENT_UPDATE_BROADCAST_SECRET 或 ORF_CLIENT_UPDATE_BROADCAST_URL/ORF_APP_URL，已跳过发布后在线客户端广播。");
    return;
  }

  const releaseVersion = normalizeReleaseVersion(release.tagName);
  logSection(`广播在线客户端更新 ${releaseVersion}`);
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
  console.log(`已广播 ORF 客户端 ${body.releaseVersion ?? releaseVersion}，在线用户 ${body.onlineUserCount ?? 0} 人${skipped}。`);
}

function clientUpdateBroadcastEndpoint(value) {
  const url = new URL(value);
  if (url.pathname === "/" || url.pathname === "") {
    return new URL("/api/client-updates/broadcast-release", url).toString();
  }
  return url.toString();
}

function normalizeReleaseVersion(value) {
  return String(value ?? "").trim().replace(/^v/i, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
