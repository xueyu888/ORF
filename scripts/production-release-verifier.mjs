import fs from "node:fs";

export async function verifyProductionRelease(input) {
  const currentReleaseDir = fs.realpathSync(`${input.runtimeRoot}/releases/current`);
  const manifest = JSON.parse(fs.readFileSync(`${currentReleaseDir}/release.json`, "utf8"));
  if (
    manifest.applicationVersion !== input.expectedVersion
    || manifest.gitCommit !== input.expectedCommit
    || manifest.gitDirty
  ) {
    throw new Error(
      `生产 release 与待发布客户端不一致: ` +
      `expected=${input.expectedVersion}/${input.expectedCommit}, ` +
      `actual=${manifest.applicationVersion}/${manifest.gitCommit}, dirty=${Boolean(manifest.gitDirty)}`,
    );
  }

  await assertHealthyEndpoint(input.backendHealthUrl, "生产后端");
  await assertHealthyEndpoint(new URL("/health", input.productionUrl).toString(), "生产公网网关");

  const expectedIndex = fs.readFileSync(`${currentReleaseDir}/web/index.html`);
  const publicIndexUrl = new URL(input.productionUrl);
  publicIndexUrl.searchParams.set("release-check", `${input.expectedVersion}-${Date.now()}`);
  const publicIndexResponse = await fetchWithContext(publicIndexUrl, "生产公网首页");
  if (!publicIndexResponse.ok) {
    throw new Error(`生产公网首页验收失败: HTTP ${publicIndexResponse.status}`);
  }
  const publicIndex = Buffer.from(await publicIndexResponse.arrayBuffer());
  if (!expectedIndex.equals(publicIndex)) {
    throw new Error("生产公网首页与当前不可变 release 的 web/index.html 不一致，禁止公开客户端版本。");
  }

  return {
    currentReleaseDir,
    manifest,
  };
}

async function assertHealthyEndpoint(url, label) {
  const response = await fetchWithContext(url, label);
  if (!response.ok) {
    throw new Error(`${label}健康检查失败: ${url} HTTP ${response.status}`);
  }
}

async function fetchWithContext(url, label) {
  try {
    return await fetch(url, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`${label}请求失败: ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
