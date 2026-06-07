export type ClientUpdatePlatform = "android" | "desktop-windows" | "desktop-other" | "web";

export type ClientReleaseAsset = {
  contentType?: string | null;
  downloadUrl: string;
  name: string;
  size?: number | null;
};

export type ClientReleaseInfo = {
  assets: ClientReleaseAsset[];
  body?: string | null;
  htmlUrl: string;
  isDraft: boolean;
  isPrerelease: boolean;
  name?: string | null;
  publishedAt?: string | null;
  tagName: string;
  version: string;
};

export type ClientUpdateDecision =
  | { status: "available"; asset: ClientReleaseAsset | null; currentVersion: string; platform: ClientUpdatePlatform; release: ClientReleaseInfo }
  | { status: "no_compatible_asset"; currentVersion: string; platform: ClientUpdatePlatform; release: ClientReleaseInfo }
  | { status: "not_newer"; currentVersion: string; platform: ClientUpdatePlatform; release: ClientReleaseInfo }
  | { status: "unsupported_platform"; currentVersion: string; platform: ClientUpdatePlatform; release: ClientReleaseInfo };

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

const clientReleaseVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function buildClientUpdateDecision(input: {
  currentVersion: string;
  platform: ClientUpdatePlatform;
  release: ClientReleaseInfo;
}): ClientUpdateDecision {
  const { currentVersion, platform, release } = input;
  if (compareReleaseVersions(release.version, currentVersion) <= 0) {
    return { status: "not_newer", currentVersion, platform, release };
  }
  if (platform === "web" || platform === "desktop-other") {
    return { status: "unsupported_platform", currentVersion, platform, release };
  }
  const asset = selectClientUpdateAsset(release.assets, platform);
  if (!asset) {
    return { status: "no_compatible_asset", currentVersion, platform, release };
  }
  return { status: "available", asset, currentVersion, platform, release };
}

export function selectClientUpdateAsset(assets: ClientReleaseAsset[], platform: ClientUpdatePlatform) {
  if (platform === "desktop-windows") {
    return assets.find((asset) => isWindowsInstallerAsset(asset)) ?? null;
  }
  if (platform === "android") {
    return assets.find((asset) => isAndroidApkAsset(asset)) ?? null;
  }
  return null;
}

export function compareReleaseVersions(left: string, right: string) {
  const leftVersion = parseReleaseVersion(left);
  const rightVersion = parseReleaseVersion(right);
  for (const key of ["major", "minor", "patch"] as const) {
    const diff = leftVersion[key] - rightVersion[key];
    if (diff !== 0) return diff;
  }
  if (leftVersion.prerelease === rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;
  return leftVersion.prerelease.localeCompare(rightVersion.prerelease);
}

export function normalizeReleaseVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

export function isClientReleaseVersion(value: string) {
  return clientReleaseVersionPattern.test(normalizeReleaseVersion(value));
}

export function toClientReleaseTag(version: string) {
  return `v${normalizeReleaseVersion(version)}`;
}

export function isTrustedClientUpdateUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      /^\/xueyu888\/ORF\/releases(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function parseReleaseVersion(value: string): ParsedVersion {
  const normalized = normalizeReleaseVersion(value);
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(normalized);
  if (!match) {
    return { major: 0, minor: 0, patch: 0, prerelease: normalized || null };
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

function isWindowsInstallerAsset(asset: ClientReleaseAsset) {
  const name = asset.name.toLowerCase();
  return name.endsWith(".exe") && (name.includes("win11") || name.includes("windows") || name.includes("setup"));
}

function isAndroidApkAsset(asset: ClientReleaseAsset) {
  const name = asset.name.toLowerCase();
  return name.endsWith(".apk") && name.includes("android");
}
