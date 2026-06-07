import type { FastifyInstance } from "fastify";
import { normalizeReleaseVersion } from "../../src/features/client-updates/clientUpdateModel";

const githubRepository = process.env.ORF_CLIENT_UPDATE_GITHUB_REPOSITORY ?? process.env.GITHUB_REPOSITORY_FULL_NAME ?? "xueyu888/ORF";
const githubApiUrl = process.env.ORF_CLIENT_UPDATE_GITHUB_API_URL ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
const githubToken = process.env.ORF_CLIENT_UPDATE_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
const clientUpdateCacheMs = 5 * 60 * 1000;

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

let cachedRelease: { expiresAt: number; value: ClientUpdateReleaseResponse } | null = null;

export function registerClientUpdateRoutes(app: FastifyInstance) {
  app.get("/api/client-updates/latest", async (_request, reply) => {
    try {
      return await getCachedLatestClientRelease();
    } catch (error) {
      app.log.warn({ error }, "Client update release check failed");
      return reply.code(502).send({ error: "Client update release check failed" });
    }
  });
}

async function getCachedLatestClientRelease() {
  const now = Date.now();
  if (cachedRelease && cachedRelease.expiresAt > now) {
    return cachedRelease.value;
  }
  const value = await fetchLatestClientRelease();
  cachedRelease = { expiresAt: now + clientUpdateCacheMs, value };
  return value;
}

async function fetchLatestClientRelease(): Promise<ClientUpdateReleaseResponse> {
  const response = await fetch(`${trimSlash(githubApiUrl)}/repos/${githubRepository}/releases/latest`, {
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

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}
