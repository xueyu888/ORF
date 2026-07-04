import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export function normalizeReleaseVersion(value) {
  return String(value ?? "").trim().replace(/^v/i, "");
}

export function toClientReleaseTag(version) {
  return `v${normalizeReleaseVersion(version)}`;
}

export function sanitizeAssetFileName(value) {
  const fileName = path.basename(String(value ?? "").trim());
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(fileName) || fileName.includes("..")) {
    throw new Error(`Release 资产文件名不合法: ${value}`);
  }
  return fileName;
}

export function contentTypeForClientUpdateAsset(fileName) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".apk")) return "application/vnd.android.package-archive";
  if (lowerName.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  return "application/octet-stream";
}

export function formatBytes(value) {
  if (!Number.isFinite(value)) return "unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function githubReleaseAssetUrl(repository, tagName, fileName) {
  const safeRepository = String(repository ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(safeRepository)) {
    throw new Error(`GitHub repository 不合法: ${repository}`);
  }
  return `https://github.com/${safeRepository}/releases/download/${encodeURIComponent(tagName)}/${encodeURIComponent(fileName)}`;
}

export function clientUpdateApiEndpoint(value, pathname) {
  const url = new URL(value);
  if (url.pathname === "/" || url.pathname === "") {
    return new URL(pathname, url).toString();
  }
  return url.toString();
}

function clientUpdateTransferTimeoutMs() {
  const raw = Number(process.env.ORF_CLIENT_UPDATE_TRANSFER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30 * 60_000;
}

export async function publishClientUpdateReleaseToOrf(input) {
  const { release, secret, targetUrl } = input;
  if (!secret?.trim()) {
    throw new Error("缺少 ORF_CLIENT_UPDATE_PUBLISH_SECRET。");
  }
  if (!targetUrl?.trim()) {
    throw new Error("缺少 ORF 客户端主更新源发布地址。");
  }

  const releaseVersion = normalizeReleaseVersion(release.tagName);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (assets.length === 0) {
    throw new Error("客户端 Release 没有资产，无法同步 ORF 主更新源。");
  }

  await publishClientUpdateReleaseAssets({ assets, releaseVersion, secret, targetUrl });
  await publishClientUpdateReleaseManifest({ release, releaseVersion, secret, targetUrl });
}

async function publishClientUpdateReleaseManifest(input) {
  const { release, releaseVersion, secret, targetUrl } = input;
  const endpoint = clientUpdateApiEndpoint(targetUrl, `/api/client-updates/releases/${encodeURIComponent(releaseVersion)}/manifest`);
  const response = await fetch(endpoint, {
    body: JSON.stringify({
      release: {
        assets: release.assets.map((asset) => ({
          contentType: asset.contentType ?? contentTypeForClientUpdateAsset(asset.name),
          mirrorDownloadUrl: asset.mirrorDownloadUrl ?? asset.url ?? null,
          name: sanitizeAssetFileName(asset.name),
          size: asset.size ?? null,
        })),
        body: release.body ?? null,
        htmlUrl: release.url,
        isDraft: Boolean(release.isDraft),
        isPrerelease: Boolean(release.isPrerelease),
        name: release.name ?? null,
        publishedAt: release.publishedAt ?? null,
        tagName: toClientReleaseTag(releaseVersion),
        version: releaseVersion,
      },
    }),
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    method: "PUT",
    signal: AbortSignal.timeout(30_000),
  }).catch((error) => {
    throw new Error(`请求 ORF 发布清单接口失败: ${error instanceof Error ? error.message : String(error)}`);
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`ORF 发布清单同步失败: HTTP ${response.status}${bodyText ? `\n${bodyText}` : ""}`);
  }
  console.log(`已同步 ORF 客户端 ${releaseVersion} 发布清单。`);
}

async function publishClientUpdateReleaseAssets(input) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "orf-client-release-assets-"));
  try {
    for (const asset of input.assets) {
      const fileName = sanitizeAssetFileName(asset.name);
      const assetPath = asset.localPath ? path.resolve(asset.localPath) : await downloadReleaseAssetToTemp(asset, tempDir);
      await uploadClientUpdateAsset({
        asset,
        assetPath,
        fileName,
        releaseVersion: input.releaseVersion,
        secret: input.secret,
        targetUrl: input.targetUrl,
      });
      console.log(`已同步 ${fileName} (${formatBytes(asset.size)}) 到 ORF 主更新源。`);
    }
  } finally {
    await fs.promises.rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function downloadReleaseAssetToTemp(asset, tempDir) {
  const fileName = sanitizeAssetFileName(asset.name);
  if (!asset.url) {
    throw new Error(`Release 资产缺少下载地址: ${fileName}`);
  }

  const filePath = path.join(tempDir, fileName);
  const downloadedWithCurl = await downloadReleaseAssetWithCurl({
    fileName,
    targetPath: filePath,
    url: asset.url,
  });
  if (downloadedWithCurl) return filePath;

  const response = await fetch(asset.url, {
    headers: {
      "user-agent": "ORF Client Release Publisher",
    },
    signal: AbortSignal.timeout(clientUpdateTransferTimeoutMs()),
  }).catch((error) => {
    throw new Error(`下载 Release 资产失败: ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!response.ok || !response.body) {
    throw new Error(`下载 Release 资产失败: ${fileName}: HTTP ${response.status}`);
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filePath));
  return filePath;
}

async function downloadReleaseAssetWithCurl(input) {
  const curl = spawnSync("curl", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (curl.status !== 0) return false;

  const proxyUrl = releaseAssetDownloadProxyUrl(input.url);
  const args = [
    "--fail",
    "--location",
    "--show-error",
    "--silent",
    "--retry",
    "3",
    "--retry-delay",
    "2",
    "--connect-timeout",
    "20",
    "--max-time",
    String(Math.ceil(clientUpdateTransferTimeoutMs() / 1000)),
    "--user-agent",
    "ORF Client Release Publisher",
    "--output",
    input.targetPath,
  ];
  if (proxyUrl) {
    console.log(`通过代理 ${redactProxyUrl(proxyUrl)} 下载 GitHub Release 资产: ${input.fileName}`);
    args.push("--proxy", proxyUrl);
  }
  args.push(input.url);

  await new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`curl 下载 Release 资产失败: ${input.fileName}: ${signal ?? code}${stderr ? `\n${stderr.trim()}` : ""}`));
    });
  });
  return true;
}

function releaseAssetDownloadProxyUrl(assetUrl) {
  if (!isGitHubReleaseAssetUrl(assetUrl)) return null;
  return firstNonEmpty([
    process.env.ORF_GITHUB_RELEASE_ASSET_PROXY,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
    gitConfigValue("https.proxy"),
    gitConfigValue("http.proxy"),
  ]);
}

function isGitHubReleaseAssetUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "github.com" || hostname.endsWith(".github.com") || hostname === "githubusercontent.com" || hostname.endsWith(".githubusercontent.com");
  } catch {
    return false;
  }
}

function gitConfigValue(key) {
  const result = spawnSync("git", ["config", "--get", key], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : "";
}

function firstNonEmpty(values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) ?? null;
}

function redactProxyUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = url.username ? "***" : "";
      url.password = url.password ? "***" : "";
    }
    return url.toString();
  } catch {
    return value.replace(/\/\/([^:@\s]+):([^@\s]+)@/, "//***:***@");
  }
}

async function uploadClientUpdateAsset(input) {
  const endpoint = clientUpdateApiEndpoint(
    input.targetUrl,
    `/api/client-updates/assets/${encodeURIComponent(input.releaseVersion)}/${encodeURIComponent(input.fileName)}`,
  );
  const form = new FormData();
  const blob = await fs.openAsBlob(input.assetPath, {
    type: input.asset.contentType || contentTypeForClientUpdateAsset(input.fileName),
  });
  form.set("file", blob, input.fileName);

  const response = await fetch(endpoint, {
    body: form,
    headers: {
      authorization: `Bearer ${input.secret}`,
    },
    method: "POST",
    signal: AbortSignal.timeout(clientUpdateTransferTimeoutMs()),
  }).catch((error) => {
    throw new Error(`上传 ORF 主更新源资产失败: ${input.fileName}: ${error instanceof Error ? error.message : String(error)}`);
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`上传 ORF 主更新源资产失败: ${input.fileName}: HTTP ${response.status}${bodyText ? `\n${bodyText}` : ""}`);
  }
}
