#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  contentTypeForClientUpdateAsset,
  formatBytes,
  githubReleaseAssetUrl,
  normalizeReleaseVersion,
  publishClientUpdateReleaseToOrf,
  sanitizeAssetFileName,
  toClientReleaseTag,
} from "./client-update-publisher.mjs";

const defaultRepository = "xueyu888/ORF";
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (!options.tag) {
  fail("必须指定 --tag。");
}
if (!options.assetsDir) {
  fail("必须指定 --assets-dir。");
}

const releaseTag = toClientReleaseTag(options.tag);
const releaseVersion = normalizeReleaseVersion(releaseTag);
const repository = options.repository ?? process.env.GITHUB_REPOSITORY ?? defaultRepository;
const publishUrl =
  options.publishUrl ??
  process.env.ORF_CLIENT_UPDATE_PUBLISH_URL ??
  process.env.ORF_APP_URL;
const publishSecret = process.env.ORF_CLIENT_UPDATE_PUBLISH_SECRET?.trim();

if (!publishUrl) {
  fail("缺少 ORF_CLIENT_UPDATE_PUBLISH_URL 或 ORF_APP_URL。");
}
if (!publishSecret) {
  fail("缺少 ORF_CLIENT_UPDATE_PUBLISH_SECRET。");
}

const assets = collectReleaseAssets(options.assetsDir, { repository, releaseTag });
if (assets.length === 0) {
  fail(`没有在 ${options.assetsDir} 找到客户端发布资产。`);
}

console.log(`准备同步 ORF 主更新源 ${releaseVersion}`);
for (const asset of assets) {
  console.log(`- ${asset.name} (${formatBytes(asset.size)})`);
}

await publishClientUpdateReleaseToOrf({
  release: {
    assets,
    body: options.notesFile ? fs.readFileSync(options.notesFile, "utf8") : null,
    isDraft: false,
    isPrerelease: releaseVersion.includes("-"),
    name: `ORF ${releaseTag}`,
    publishedAt: new Date().toISOString(),
    tagName: releaseTag,
    url: options.releaseUrl ?? `https://github.com/${repository}/releases/tag/${encodeURIComponent(releaseTag)}`,
  },
  secret: publishSecret,
  targetUrl: publishUrl,
});

function parseArgs(args) {
  const parsed = {
    assetsDir: null,
    help: false,
    notesFile: null,
    publishUrl: null,
    releaseUrl: null,
    repository: null,
    tag: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--assets-dir") parsed.assetsDir = readValue(args, ++index, arg);
    else if (arg === "--notes-file") parsed.notesFile = readValue(args, ++index, arg);
    else if (arg === "--publish-url") parsed.publishUrl = readValue(args, ++index, arg);
    else if (arg === "--release-url") parsed.releaseUrl = readValue(args, ++index, arg);
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

function collectReleaseAssets(assetsDir, input) {
  const root = path.resolve(assetsDir);
  const files = listFiles(root)
    .filter((filePath) => isClientUpdateAsset(filePath))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));

  return files.map((filePath) => {
    const name = sanitizeAssetFileName(path.basename(filePath));
    const stat = fs.statSync(filePath);
    return {
      contentType: contentTypeForClientUpdateAsset(name),
      localPath: filePath,
      mirrorDownloadUrl: githubReleaseAssetUrl(input.repository, input.releaseTag, name),
      name,
      size: stat.size,
      url: githubReleaseAssetUrl(input.repository, input.releaseTag, name),
    };
  });
}

function listFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(filePath);
    if (entry.isFile()) return [filePath];
    return [];
  });
}

function isClientUpdateAsset(filePath) {
  const lowerName = path.basename(filePath).toLowerCase();
  return lowerName.endsWith(".exe") || lowerName.endsWith(".apk");
}

function printHelp() {
  console.log(`ORF 客户端主更新源发布脚本

用法:
  node scripts/publish-client-update-to-orf.mjs --tag v0.0.3 --assets-dir release-assets --notes-file release-notes.md

行为:
  - 从本地/CI 产物目录读取 .exe 和 .apk。
  - 先上传安装包到 ORF 主更新源，再写入发布清单。
  - GitHub Release URL 只写入 mirrorDownloadUrl，作为镜像页和兜底下载地址。
  - 发布地址取 ORF_CLIENT_UPDATE_PUBLISH_URL / ORF_APP_URL，也可用 --publish-url 覆盖。
  - 必须配置 ORF_CLIENT_UPDATE_PUBLISH_SECRET。
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
