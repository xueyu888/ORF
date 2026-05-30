import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { listVisualBackgrounds } from "../../../server/settings/visualBackgrounds";
import type {
  PersonalBackgroundsData,
  VisualBackgroundConfig,
  VisualBackgroundImage,
  VisualBackgroundsData,
  VisualBackgroundScene,
} from "../../../src/state/apiClient";
import type {
  ApiAttemptResult,
  BackgroundSnapshots,
  DirectorySnapshot,
  FileSnapshot,
  PersonalBackgroundUploadResult,
  PersonalSettingsSnapshot,
} from "./background-settings.context";

const settingsRoot = path.join(process.cwd(), "public", "settings");
const systemSettingsPath = path.join(settingsRoot, "system", "settings.json");
const legacySystemSettingsPath = path.join(settingsRoot, "user", "settings.json");
const loginBackgroundSystemDir = path.join(settingsRoot, "backgrounds", "login_background", "system");
const appBackgroundSystemDir = path.join(settingsRoot, "backgrounds", "app_background", "system");
const backgroundSettingsLockDir = path.join(process.cwd(), ".artifacts", "testd-background-settings.lock");
const backgroundSettingsLockTimeoutMs = 45_000;
const staleBackgroundSettingsLockMs = 120_000;

const testPersonalBackgroundPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lKYwWQAAAABJRU5ErkJggg==",
  "base64",
);

export async function readBackgroundSnapshots(): Promise<BackgroundSnapshots> {
  const lockOwner = await acquireBackgroundSettingsLock();
  return {
    login_background: normalizeBackgrounds(await listVisualBackgrounds("login_background")),
    app_background: normalizeBackgrounds(await listVisualBackgrounds("app_background")),
    systemSettingsFile: await readTextFileSnapshot(systemSettingsPath),
    legacySystemSettingsFile: await readTextFileSnapshot(legacySystemSettingsPath),
    loginBackgroundSystemDirectory: await readDirectorySnapshot(loginBackgroundSystemDir),
    appBackgroundSystemDirectory: await readDirectorySnapshot(appBackgroundSystemDir),
    lockOwner,
  };
}

export async function backgroundsMatchSnapshot(snapshot: BackgroundSnapshots) {
  const current = await readCurrentBackgrounds();
  return JSON.stringify(current) === JSON.stringify(visibleBackgroundSnapshot(snapshot));
}

export async function restoreBackgroundSnapshots(snapshot: BackgroundSnapshots) {
  await restoreTextFileSnapshot(systemSettingsPath, snapshot.systemSettingsFile);
  await restoreTextFileSnapshot(legacySystemSettingsPath, snapshot.legacySystemSettingsFile);
  await restoreDirectorySnapshot(loginBackgroundSystemDir, snapshot.loginBackgroundSystemDirectory);
  await restoreDirectorySnapshot(appBackgroundSystemDir, snapshot.appBackgroundSystemDirectory);
}

export async function releaseBackgroundSettingsSnapshot(snapshot: BackgroundSnapshots) {
  await releaseBackgroundSettingsLock(snapshot.lockOwner);
}

export async function readPersonalSettingsSnapshot(userId: string): Promise<PersonalSettingsSnapshot> {
  return {
    userId,
    userSettingsDirectory: await readDirectorySnapshot(userSettingsDir(userId)),
  };
}

export async function restorePersonalSettingsSnapshot(snapshot: PersonalSettingsSnapshot) {
  await restoreDirectorySnapshot(userSettingsDir(snapshot.userId), snapshot.userSettingsDirectory);
}

export async function readVisualBackgroundsAsCurrentUser(page: Page, scene: VisualBackgroundScene): Promise<ApiAttemptResult> {
  return page.evaluate(async (targetScene) => {
    const response = await fetch(`/api/settings/visual/backgrounds?scene=${encodeURIComponent(targetScene)}`, { credentials: "include" });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, scene);
}

export async function readPersonalBackgroundsAsCurrentUser(page: Page): Promise<ApiAttemptResult> {
  return page.evaluate(async () => {
    const response = await fetch("/api/settings/personal/backgrounds", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  });
}

export async function saveVisualBackgroundConfigAsCurrentUser(
  page: Page,
  scene: VisualBackgroundScene,
  config: VisualBackgroundConfig,
): Promise<ApiAttemptResult> {
  return page.evaluate(
    async ({ targetScene, nextConfig }) => {
      const response = await fetch("/api/settings/visual/background-config", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scene: targetScene, config: nextConfig }),
      });

      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { targetScene: scene, nextConfig: config },
  );
}

export async function savePersonalBackgroundConfigAsCurrentUser(
  page: Page,
  config: VisualBackgroundConfig,
): Promise<ApiAttemptResult> {
  return page.evaluate(async (nextConfig) => {
    const response = await fetch("/api/settings/personal/preferences", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appBackground: nextConfig }),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, config);
}

export async function uploadPersonalBackgroundFromSettingsPage(
  page: Page,
  fileName: string,
): Promise<PersonalBackgroundUploadResult> {
  const uploadResponsePromise = page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "POST" && response.url().endsWith("/api/settings/personal/backgrounds");
    })
    .then(async (response): Promise<ApiAttemptResult> => ({
      status: response.status(),
      body: await response.json().catch(() => null),
    }));

  const preferenceResponsePromise = page.waitForResponse((response) => {
    return response.request().method().toUpperCase() === "PUT" && response.url().endsWith("/api/settings/personal/preferences");
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: testPersonalBackgroundPng,
  });

  const uploadResult = await uploadResponsePromise;
  await preferenceResponsePromise;

  const uploaded = readVisualBackgroundImageFromResult(uploadResult);
  if (!uploaded) {
    throw new Error("个人背景上传结果中缺少背景图片");
  }
  await expect(page.getByText(`个人上传：${uploaded.fileName}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "上传", exact: true })).toBeEnabled();
  return uploaded;
}

export async function selectPersonalBackgroundFromSettingsPage(page: Page, background: VisualBackgroundImage) {
  await personalBackgroundCard(page, background).click();
}

export async function useSelectedPersonalBackgroundFromSettingsPage(page: Page): Promise<ApiAttemptResult> {
  const preferenceResponsePromise = page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "PUT" && response.url().endsWith("/api/settings/personal/preferences");
    })
    .then(async (response): Promise<ApiAttemptResult> => ({
      status: response.status(),
      body: await response.json().catch(() => null),
    }));

  await page.getByRole("button", { name: "设为我的背景", exact: true }).click();
  return preferenceResponsePromise;
}

export async function uploadSystemBackgroundFromSettingsPage(
  page: Page,
  scene: VisualBackgroundScene,
  fileName: string,
): Promise<VisualBackgroundImage> {
  const section = systemBackgroundSection(page, scene);
  const uploadResponsePromise = page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "POST" && response.url().endsWith("/api/settings/visual/backgrounds");
    })
    .then(async (response): Promise<ApiAttemptResult> => ({
      status: response.status(),
      body: await response.json().catch(() => null),
    }));

  await section.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: testPersonalBackgroundPng,
  });

  const uploadResult = await uploadResponsePromise;
  const uploaded = readVisualBackgroundImageFromResult(uploadResult);
  if (!uploaded) {
    throw new Error("系统背景上传结果中缺少背景图片");
  }
  await expect(systemBackgroundCard(page, scene, uploaded)).toBeVisible();
  await expect(section.getByRole("button", { name: "上传图片", exact: true })).toBeEnabled();
  return uploaded;
}

export async function selectSystemBackgroundFromSettingsPage(
  page: Page,
  scene: VisualBackgroundScene,
  background: VisualBackgroundImage,
) {
  await systemBackgroundCard(page, scene, background).click();
}

export async function setSelectedSystemBackgroundAsDefaultFromSettingsPage(
  page: Page,
  scene: VisualBackgroundScene,
): Promise<ApiAttemptResult> {
  const section = systemBackgroundSection(page, scene);
  const defaultButton = section.getByRole("button", { name: "设为默认", exact: true });

  if (await defaultButton.isEnabled()) {
    const defaultResponsePromise = page
      .waitForResponse((response) => {
        return (
          response.request().method().toUpperCase() === "PUT" &&
          response.url().includes("/api/settings/visual/backgrounds/") &&
          response.url().endsWith("/default")
        );
      })
      .then(async (response): Promise<ApiAttemptResult> => ({
        status: response.status(),
        body: await response.json().catch(() => null),
      }));

    await defaultButton.click();
    return defaultResponsePromise;
  }

  const fixedModeButton = section.getByRole("button", { name: "固定背景", exact: true });
  if (await fixedModeButton.isEnabled()) {
    const configResponsePromise = page
      .waitForResponse((response) => {
        return response.request().method().toUpperCase() === "PUT" && response.url().endsWith("/api/settings/visual/background-config");
      })
      .then(async (response): Promise<ApiAttemptResult> => ({
        status: response.status(),
        body: await response.json().catch(() => null),
      }));

    await fixedModeButton.click();
    return configResponsePromise;
  }

  const current = await readVisualBackgroundsAsCurrentUser(page, scene);
  return { status: current.status, body: current.body };
}

export function generateDifferentBackgroundConfig(snapshot: BackgroundSnapshots, scene: VisualBackgroundScene): VisualBackgroundConfig {
  const current = snapshot[scene].config;
  return {
    mode: "switchable",
    fixedBackgroundId: current.fixedBackgroundId,
    switchTrigger: current.switchTrigger === "interval" ? "on_open" : "interval",
    switchOrder: current.switchOrder === "random" ? "sequential" : "random",
    switchIntervalMinutes: current.switchIntervalMinutes >= 1440 ? 1 : current.switchIntervalMinutes + 1,
  };
}

export function readVisualBackgroundConfigFromResult(result: ApiAttemptResult): VisualBackgroundConfig | null {
  const body = result.body;
  if (typeof body !== "object" || body === null || !("data" in body)) {
    return null;
  }

  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("config" in data)) {
    return null;
  }

  const config = (data as { config?: unknown }).config;
  return isVisualBackgroundConfig(config) ? config : null;
}

export function readVisualBackgroundConfigFromBackgrounds(result: ApiAttemptResult): VisualBackgroundConfig | null {
  const data = readPersonalOrSystemBackgroundData(result);
  return data?.config ?? null;
}

export function readPersonalOrSystemBackgroundData(result: ApiAttemptResult): PersonalBackgroundsData | VisualBackgroundsData | null {
  const body = result.body;
  if (typeof body !== "object" || body === null || !("data" in body)) {
    return null;
  }

  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("config" in data) || !("list" in data)) {
    return null;
  }
  return data as PersonalBackgroundsData | VisualBackgroundsData;
}

export function readVisualBackgroundImageFromResult(result: ApiAttemptResult): VisualBackgroundImage | null {
  const body = result.body;
  if (typeof body !== "object" || body === null || !("data" in body)) {
    return null;
  }

  const data = (body as { data?: unknown }).data;
  return isVisualBackgroundImage(data) ? data : null;
}

export function sameVisualBackgroundConfig(left: VisualBackgroundConfig, right: VisualBackgroundConfig) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeBackgrounds(input: Awaited<ReturnType<typeof listVisualBackgrounds>>): VisualBackgroundsData {
  return {
    scene: input.scene as VisualBackgroundScene,
    config: input.config,
    list: input.list.map((item) => ({
      ...item,
      createdAt: item.createdAt ?? "",
    })),
  };
}

async function readCurrentBackgrounds() {
  return {
    login_background: normalizeBackgrounds(await listVisualBackgrounds("login_background")),
    app_background: normalizeBackgrounds(await listVisualBackgrounds("app_background")),
  };
}

function visibleBackgroundSnapshot(snapshot: BackgroundSnapshots) {
  return {
    login_background: snapshot.login_background,
    app_background: snapshot.app_background,
  };
}

function personalBackgroundCard(page: Page, background: VisualBackgroundImage) {
  return page.locator(".orf-settings-background-card", {
    has: page.getByRole("img", { name: background.fileName, exact: true }),
  });
}

function systemBackgroundCard(page: Page, scene: VisualBackgroundScene, background: VisualBackgroundImage) {
  return systemBackgroundSection(page, scene).locator(".orf-settings-background-card", {
    has: page.getByRole("img", { name: background.fileName, exact: true }),
  });
}

function systemBackgroundSection(page: Page, scene: VisualBackgroundScene) {
  return page.locator(".orf-settings-background-section", {
    has: page.getByRole("heading", { name: sceneTitle(scene), exact: true }),
  });
}

function sceneTitle(scene: VisualBackgroundScene) {
  return scene === "login_background" ? "登录页面背景设置" : "应用背景设置";
}

async function readTextFileSnapshot(filePath: string): Promise<FileSnapshot> {
  try {
    return {
      existed: true,
      content: await readFile(filePath, "utf8"),
    };
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return { existed: false, content: null };
    }
    throw error;
  }
}

async function restoreTextFileSnapshot(filePath: string, snapshot: FileSnapshot) {
  if (snapshot.existed && snapshot.content !== null) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, snapshot.content, "utf8");
  } else {
    await rm(filePath, { force: true });
  }
}

async function readDirectorySnapshot(directory: string): Promise<DirectorySnapshot> {
  const directoryStat = await stat(directory).catch((error) => {
    if (isNodeErrorCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  });
  if (!directoryStat?.isDirectory()) {
    return { existed: false, files: [] };
  }

  const files = await readDirectoryFiles(directory, directory);
  return { existed: true, files };
}

async function readDirectoryFiles(root: string, directory: string): Promise<DirectorySnapshot["files"]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: DirectorySnapshot["files"] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readDirectoryFiles(root, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    files.push({
      relativePath: path.relative(root, absolutePath),
      content: await readFile(absolutePath),
    });
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function restoreDirectorySnapshot(directory: string, snapshot: DirectorySnapshot) {
  await rm(directory, { recursive: true, force: true });
  if (!snapshot.existed) {
    return;
  }

  for (const file of snapshot.files) {
    const targetPath = path.join(directory, file.relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content);
  }
}

async function acquireBackgroundSettingsLock() {
  await mkdir(path.dirname(backgroundSettingsLockDir), { recursive: true });
  const owner = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const deadline = Date.now() + backgroundSettingsLockTimeoutMs;

  while (Date.now() < deadline) {
    try {
      await mkdir(backgroundSettingsLockDir);
      await writeFile(path.join(backgroundSettingsLockDir, "owner"), owner, "utf8");
      return owner;
    } catch (error) {
      if (!isNodeErrorCode(error, "EEXIST")) {
        throw error;
      }
      await removeStaleBackgroundSettingsLock();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw new Error("获取背景设置测试锁超时");
}

async function removeStaleBackgroundSettingsLock() {
  const lockStat = await stat(backgroundSettingsLockDir).catch(() => null);
  if (!lockStat || Date.now() - lockStat.mtimeMs < staleBackgroundSettingsLockMs) {
    return;
  }
  await rm(backgroundSettingsLockDir, { recursive: true, force: true });
}

async function releaseBackgroundSettingsLock(owner: string) {
  const ownerPath = path.join(backgroundSettingsLockDir, "owner");
  const currentOwner = await readFile(ownerPath, "utf8").catch(() => null);
  if (currentOwner === owner) {
    await rm(backgroundSettingsLockDir, { recursive: true, force: true });
  }
}

function userSettingsDir(userId: string) {
  return path.join(settingsRoot, "users", Buffer.from(userId, "utf8").toString("base64url"));
}

function isVisualBackgroundConfig(value: unknown): value is VisualBackgroundConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const config = value as Partial<VisualBackgroundConfig>;
  return (
    (config.mode === "fixed" || config.mode === "switchable") &&
    (typeof config.fixedBackgroundId === "string" || config.fixedBackgroundId === null) &&
    (config.switchTrigger === "on_open" || config.switchTrigger === "interval") &&
    (config.switchOrder === "sequential" || config.switchOrder === "random") &&
    typeof config.switchIntervalMinutes === "number"
  );
}

function isVisualBackgroundImage(value: unknown): value is VisualBackgroundImage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as VisualBackgroundImage).id === "string" &&
    typeof (value as VisualBackgroundImage).fileName === "string" &&
    typeof (value as VisualBackgroundImage).url === "string"
  );
}

function isNodeErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === code;
}
