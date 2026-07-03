import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  compareReleaseVersions,
  isClientReleaseVersion,
  normalizeReleaseVersion,
  toClientReleaseTag,
  type ClientReleaseAsset,
  type ClientReleaseInfo,
} from "../../src/features/client-updates/clientUpdateModel";
import { env } from "../env";

export type StoredClientUpdateAsset = {
  contentLength: number;
  contentType: string;
  filePath: string;
  stream: Readable;
};

type ClientUpdateReleaseManifest = {
  releases: ClientReleaseInfo[];
  updatedAt: string;
};

const clientUpdateAssetFileNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
const clientUpdateManifestFileName = "releases.json";

export function isClientUpdateAssetFileName(value: string) {
  return clientUpdateAssetFileNamePattern.test(value) && !value.includes("..");
}

export function buildClientUpdateAssetDownloadUrl(version: string, assetName: string) {
  const baseUrl = env.ORF_CLIENT_UPDATE_DOWNLOAD_BASE_URL ?? env.ORF_APP_URL;
  return new URL(
    `/api/client-updates/assets/${encodeURIComponent(normalizeReleaseVersion(version))}/${encodeURIComponent(assetName)}`,
    baseUrl,
  ).toString();
}

export async function listStoredClientUpdateReleases() {
  const manifest = await readClientUpdateReleaseManifest();
  return manifest.releases.map(normalizeStoredClientRelease).sort(compareClientReleaseDesc);
}

export async function getStoredClientUpdateReleaseByVersion(version: string) {
  const normalizedVersion = normalizeReleaseVersion(version);
  const releases = await listStoredClientUpdateReleases();
  return releases.find((release) => release.version === normalizedVersion) ?? null;
}

export async function upsertStoredClientUpdateRelease(input: ClientReleaseInfo) {
  const release = normalizeStoredClientRelease(input);
  const manifest = await readClientUpdateReleaseManifest();
  const releases = manifest.releases
    .map(normalizeStoredClientRelease)
    .filter((item) => item.version !== release.version);
  releases.push(release);
  await writeClientUpdateReleaseManifest({
    releases: releases.sort(compareClientReleaseDesc),
    updatedAt: new Date().toISOString(),
  });
  return release;
}

export async function getStoredClientUpdateAsset(input: {
  contentType?: string | null;
  fileName: string;
  version: string;
}): Promise<StoredClientUpdateAsset | null> {
  const filePath = clientUpdateAssetPath(input.version, input.fileName);
  const stat = await fs.stat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat?.isFile()) return null;
  return {
    contentLength: stat.size,
    contentType: input.contentType || contentTypeForClientUpdateAsset(input.fileName),
    filePath,
    stream: createReadStream(filePath),
  };
}

export async function storeClientUpdateAssetFile(input: {
  body: Readable;
  fileName: string;
  version: string;
}) {
  const filePath = clientUpdateAssetPath(input.version, input.fileName);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `${input.fileName}.${process.pid}.${Date.now()}.upload`);
  try {
    await pipeline(input.body, createWriteStream(tempPath));
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
  const stat = await fs.stat(filePath);
  return {
    contentLength: stat.size,
    filePath,
  };
}

function normalizeStoredClientRelease(input: ClientReleaseInfo): ClientReleaseInfo {
  const version = normalizeReleaseVersion(input.version || input.tagName);
  if (!isClientReleaseVersion(version)) {
    throw new Error(`Invalid client release version in ORF release manifest: ${input.version || input.tagName}`);
  }

  return {
    assets: input.assets.filter(isValidStoredAsset).map((asset) => normalizeStoredAsset(version, asset)),
    body: input.body ?? null,
    htmlUrl: input.htmlUrl,
    isDraft: Boolean(input.isDraft),
    isPrerelease: Boolean(input.isPrerelease),
    name: input.name ?? null,
    publishedAt: input.publishedAt ?? null,
    tagName: toClientReleaseTag(version),
    version,
  };
}

function normalizeStoredAsset(version: string, asset: ClientReleaseAsset): ClientReleaseAsset {
  return {
    contentType: asset.contentType ?? null,
    downloadUrl: buildClientUpdateAssetDownloadUrl(version, asset.name),
    mirrorDownloadUrl: asset.mirrorDownloadUrl ?? asset.downloadUrl ?? null,
    name: asset.name,
    size: asset.size ?? null,
  };
}

function isValidStoredAsset(asset: ClientReleaseAsset) {
  return isClientUpdateAssetFileName(asset.name);
}

async function readClientUpdateReleaseManifest(): Promise<ClientUpdateReleaseManifest> {
  const filePath = clientUpdateReleaseManifestPath();
  const raw = await fs.readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!raw) {
    return { releases: [], updatedAt: new Date(0).toISOString() };
  }
  const parsed = JSON.parse(raw) as Partial<ClientUpdateReleaseManifest>;
  return {
    releases: Array.isArray(parsed.releases) ? parsed.releases : [],
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
  };
}

async function writeClientUpdateReleaseManifest(manifest: ClientUpdateReleaseManifest) {
  const filePath = clientUpdateReleaseManifestPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rename(tempPath, filePath);
}

function clientUpdateReleaseManifestPath() {
  return safeClientUpdateAssetPath(clientUpdateManifestFileName);
}

function clientUpdateAssetPath(version: string, fileName: string) {
  const normalizedVersion = normalizeReleaseVersion(version);
  if (!isClientReleaseVersion(normalizedVersion)) {
    throw new Error(`Invalid client update asset version: ${version}`);
  }
  if (!isClientUpdateAssetFileName(fileName)) {
    throw new Error(`Invalid client update asset file name: ${fileName}`);
  }
  return safeClientUpdateAssetPath(normalizedVersion, fileName);
}

function safeClientUpdateAssetPath(...segments: string[]) {
  const root = path.resolve(env.ORF_CLIENT_UPDATE_ASSET_DIR);
  const filePath = path.resolve(root, ...segments);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Client update asset path escaped storage root");
  }
  return filePath;
}

function contentTypeForClientUpdateAsset(fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".apk")) return "application/vnd.android.package-archive";
  if (lowerName.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  return "application/octet-stream";
}

function compareClientReleaseDesc(left: ClientReleaseInfo, right: ClientReleaseInfo) {
  const versionOrder = compareReleaseVersions(right.version, left.version);
  if (versionOrder !== 0) return versionOrder;
  return releasePublishedAtMs(right) - releasePublishedAtMs(left);
}

function releasePublishedAtMs(release: ClientReleaseInfo) {
  const timestamp = Date.parse(release.publishedAt ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
