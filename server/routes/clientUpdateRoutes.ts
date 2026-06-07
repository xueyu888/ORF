import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  compareReleaseVersions,
  isClientReleaseVersion,
  normalizeReleaseVersion,
  selectClientUpdateAsset,
  toClientReleaseTag,
} from "../../src/features/client-updates/clientUpdateModel";

const githubRepository = process.env.ORF_CLIENT_UPDATE_GITHUB_REPOSITORY ?? process.env.GITHUB_REPOSITORY_FULL_NAME ?? "xueyu888/ORF";
const githubApiUrl = process.env.ORF_CLIENT_UPDATE_GITHUB_API_URL ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
const githubToken = process.env.ORF_CLIENT_UPDATE_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
const clientUpdateCacheMs = 60 * 1000;

type ClientUpdateReleaseResponse = {
  release: {
    assets: Array<{
      contentType?: string | null;
      downloadUrl: string;
      name: string;
      size?: number | null;
    }>;
    body?: string | null;
    htmlUrl: string;
    isDraft: boolean;
    isPrerelease: boolean;
    name?: string | null;
    publishedAt?: string | null;
    tagName: string;
    version: string;
  };
};

type GitHubRelease = {
  assets?: Array<{
    browser_download_url?: string;
    content_type?: string | null;
    name?: string;
    size?: number | null;
  }>;
  body?: string | null;
  draft?: boolean;
  html_url?: string;
  name?: string | null;
  prerelease?: boolean;
  published_at?: string | null;
  tag_name?: string;
};

const releaseVersionParamsSchema = z.object({
  version: z.string()
    .trim()
    .min(1)
    .transform(normalizeReleaseVersion)
    .refine(isClientReleaseVersion, { message: "Invalid client release version" }),
});

let cachedLatestRelease: { expiresAt: number; value: ClientUpdateReleaseResponse } | null = null;
const cachedReleaseByVersion = new Map<string, { expiresAt: number; value: ClientUpdateReleaseResponse }>();

export function registerClientUpdateRoutes(app: FastifyInstance) {
  app.get("/api/client-updates/latest", async (_request, reply) => {
    try {
      return await getCachedLatestClientRelease();
    } catch (error) {
      app.log.warn({ error }, "Client update release check failed");
      return reply.code(502).send({ error: "Client update release check failed" });
    }
  });

  app.get("/api/client-updates/releases/:version", async (request, reply) => {
    try {
      const { version } = releaseVersionParamsSchema.parse(request.params);
      return await getCachedClientReleaseByVersion(version);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid client release version" });
      }
      app.log.warn({ error }, "Client update release lookup failed");
      return reply.code(502).send({ error: "Client update release lookup failed" });
    }
  });
}

async function getCachedLatestClientRelease() {
  const now = Date.now();
  if (cachedLatestRelease && cachedLatestRelease.expiresAt > now) {
    return cachedLatestRelease.value;
  }
  const value = await fetchLatestClientRelease();
  cachedLatestRelease = { expiresAt: now + clientUpdateCacheMs, value };
  return value;
}

async function getCachedClientReleaseByVersion(version: string) {
  const now = Date.now();
  const cached = cachedReleaseByVersion.get(version);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = await fetchClientReleaseByVersion(version);
  cachedReleaseByVersion.set(version, { expiresAt: now + clientUpdateCacheMs, value });
  return value;
}

async function fetchLatestClientRelease(): Promise<ClientUpdateReleaseResponse> {
  const response = await fetch(`${trimSlash(githubApiUrl)}/repos/${githubRepository}/releases?per_page=100`, {
    headers: githubApiHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub release API returned ${response.status}`);
  }
  const release = selectLatestClientRelease(await response.json() as GitHubRelease[]);
  if (!release) {
    throw new Error("No published client release found");
  }
  return { release };
}

async function fetchClientReleaseByVersion(version: string): Promise<ClientUpdateReleaseResponse> {
  const tagName = encodeURIComponent(toClientReleaseTag(version));
  const response = await fetch(`${trimSlash(githubApiUrl)}/repos/${githubRepository}/releases/tags/${tagName}`, {
    headers: githubApiHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub release API returned ${response.status}`);
  }
  return { release: toClientUpdateRelease(await response.json() as GitHubRelease) };
}

function githubApiHeaders() {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "ORF Client Update Checker",
  };
  if (githubToken) {
    headers.authorization = `Bearer ${githubToken}`;
  }
  return headers;
}

function toClientUpdateRelease(release: GitHubRelease): ClientUpdateReleaseResponse["release"] {
  const tagName = release.tag_name ?? "";
  return {
    assets: (release.assets ?? []).flatMap((asset) => {
      if (!asset.name || !asset.browser_download_url) return [];
      return [{
        contentType: asset.content_type ?? null,
        downloadUrl: asset.browser_download_url,
        name: asset.name,
        size: asset.size ?? null,
      }];
    }),
    body: release.body ?? null,
    htmlUrl: release.html_url ?? `https://github.com/${githubRepository}/releases/latest`,
    isDraft: Boolean(release.draft),
    isPrerelease: Boolean(release.prerelease),
    name: release.name ?? null,
    publishedAt: release.published_at ?? null,
    tagName,
    version: normalizeReleaseVersion(tagName),
  };
}

function selectLatestClientRelease(releases: GitHubRelease[]) {
  return releases
    .filter(isPublishedClientRelease)
    .map(toClientUpdateRelease)
    .sort(compareClientReleaseInfoDesc)[0] ?? null;
}

function isPublishedClientRelease(release: GitHubRelease) {
  const tagName = release.tag_name ?? "";
  if (release.draft || release.prerelease || !isClientReleaseVersion(tagName)) {
    return false;
  }
  const clientRelease = toClientUpdateRelease(release);
  return Boolean(
    selectClientUpdateAsset(clientRelease.assets, "android") ||
    selectClientUpdateAsset(clientRelease.assets, "desktop-windows"),
  );
}

function compareClientReleaseInfoDesc(
  left: ClientUpdateReleaseResponse["release"],
  right: ClientUpdateReleaseResponse["release"],
) {
  const versionOrder = compareReleaseVersions(right.version, left.version);
  if (versionOrder !== 0) return versionOrder;
  return releasePublishedAtMs(right) - releasePublishedAtMs(left);
}

function releasePublishedAtMs(release: ClientUpdateReleaseResponse["release"]) {
  const timestamp = Date.parse(release.publishedAt ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}
