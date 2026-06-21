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
import { defaultVisualBackgroundCrop } from "../../../src/domain/settings/visualBackgrounds";
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
const sidebarBackgroundSystemDir = path.join(settingsRoot, "backgrounds", "sidebar_background", "system");
const topbarBackgroundSystemDir = path.join(settingsRoot, "backgrounds", "topbar_background", "system");
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
    sidebar_background: normalizeBackgrounds(await listVisualBackgrounds("sidebar_background")),
    topbar_background: normalizeBackgrounds(await listVisualBackgrounds("topbar_background")),
    systemSettingsFile: await readTextFileSnapshot(systemSettingsPath),
    legacySystemSettingsFile: await readTextFileSnapshot(legacySystemSettingsPath),
    loginBackgroundSystemDirectory: await readDirectorySnapshot(loginBackgroundSystemDir),
    sidebarBackgroundSystemDirectory: await readDirectorySnapshot(sidebarBackgroundSystemDir),
    topbarBackgroundSystemDirectory: await readDirectorySnapshot(topbarBackgroundSystemDir),
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
  await restoreDirectorySnapshot(sidebarBackgroundSystemDir, snapshot.sidebarBackgroundSystemDirectory);
  await restoreDirectorySnapshot(topbarBackgroundSystemDir, snapshot.topbarBackgroundSystemDirectory);
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

export async function readPersonalBackgroundsAsCurrentUser(page: Page, scene: VisualBackgroundScene = "sidebar_background"): Promise<ApiAttemptResult> {
  return page.evaluate(async (targetScene) => {
    const response = await fetch(`/api/settings/personal/backgrounds?scene=${encodeURIComponent(targetScene)}`, { credentials: "include" });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, scene);
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
  scene: VisualBackgroundScene = "sidebar_background",
): Promise<ApiAttemptResult> {
  return page.evaluate(async ({ nextConfig, targetScene }) => {
    const response = await fetch("/api/settings/personal/preferences", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backgrounds: { [targetScene]: nextConfig } }),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, { nextConfig: config, targetScene: scene });
}

function waitForPersonalPreferenceResponse(page: Page, timeout?: number): Promise<ApiAttemptResult> {
  return page
    .waitForResponse(
      (response) => {
        return response.request().method().toUpperCase() === "PUT" && response.url().endsWith("/api/settings/personal/preferences");
      },
      timeout === undefined ? undefined : { timeout },
    )
    .then(async (response): Promise<ApiAttemptResult> => ({
      status: response.status(),
      body: await response.json().catch(() => null),
    }));
}

export async function uploadPersonalBackgroundFromSettingsPage(
  page: Page,
  fileName: string,
): Promise<PersonalBackgroundUploadResult> {
  await selectSkinWorkbenchSlot(page, "personal", "sidebar_background");
  const uploadResponsePromise = page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "POST" && response.url().endsWith("/api/settings/personal/backgrounds");
    })
    .then(async (response): Promise<ApiAttemptResult> => ({
      status: response.status(),
      body: await response.json().catch(() => null),
    }));

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: testPersonalBackgroundPng,
  });

  const uploadResult = await uploadResponsePromise;

  const uploaded = readVisualBackgroundImageFromResult(uploadResult);
  if (!uploaded) {
    throw new Error("个人背景上传结果中缺少背景图片");
  }
  await expect(skinGalleryCard(page, uploaded, "personal")).toBeVisible();
  await expect(skinWorkbench(page, "personal").getByRole("button", { name: "上传", exact: true })).toBeEnabled();
  return uploaded;
}

export async function selectPersonalBackgroundFromSettingsPage(page: Page, background: VisualBackgroundImage) {
  await selectSkinWorkbenchSlot(page, "personal", "sidebar_background");
  const card = skinGalleryCard(page, background, "personal");
  const selectedText = skinWorkbench(page, "personal").locator(".orf-skin-selected-file").getByText(background.fileName, { exact: true });

  await expect(card).toBeVisible();
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await card.click();
    try {
      await expect(selectedText).toBeVisible({ timeout: 1_000 });
      return;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      await page.waitForTimeout(200);
    }
  }
}

export async function useSelectedPersonalBackgroundFromSettingsPage(
  page: Page,
  background: VisualBackgroundImage,
): Promise<ApiAttemptResult> {
  const saveButton = skinWorkbench(page, "personal").getByRole("button", { name: "保存", exact: true });
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await selectPersonalBackgroundFromSettingsPage(page, background);
    await expect(saveButton).toBeEnabled({ timeout: 1_000 });

    const preferenceResponsePromise = waitForPersonalPreferenceResponse(page, 3_000);
    try {
      await saveButton.click();
      return await preferenceResponsePromise;
    } catch (error) {
      lastError = error;
      await preferenceResponsePromise.catch(() => null);
      if (attempt === 4) {
        throw error;
      }
      await page.waitForTimeout(200);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("设置个人背景时未捕获偏好保存响应");
}

export async function uploadSystemBackgroundFromSettingsPage(
  page: Page,
  scene: VisualBackgroundScene,
  fileName: string,
): Promise<VisualBackgroundImage> {
  await selectSkinWorkbenchSlot(page, "system", scene);
  const section = skinWorkbench(page, "system");
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
  await expect(skinGalleryCard(page, uploaded, "system")).toBeVisible();
  await expect(section.getByRole("button", { name: "上传", exact: true })).toBeEnabled();
  return uploaded;
}

export async function selectSystemBackgroundFromSettingsPage(
  page: Page,
  scene: VisualBackgroundScene,
  background: VisualBackgroundImage,
) {
  await selectSkinWorkbenchSlot(page, "system", scene);
  const section = skinWorkbench(page, "system");
  const card = skinGalleryCard(page, background, "system");
  const selectedText = section.locator(".orf-skin-selected-file-name").getByText(background.fileName, { exact: true });

  await expect(card).toBeVisible();
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await card.click();
    try {
      await expect(selectedText).toBeVisible({ timeout: 1_000 });
      return;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      await page.waitForTimeout(200);
    }
  }
}

export async function setSelectedSystemBackgroundAsDefaultFromSettingsPage(
  page: Page,
  scene: VisualBackgroundScene,
): Promise<ApiAttemptResult> {
  await selectSkinWorkbenchSlot(page, "system", scene);
  const section = skinWorkbench(page, "system");
  const saveButton = section.getByRole("button", { name: "保存", exact: true });

  await expect(saveButton).toBeEnabled();
  const configResponsePromise = page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "PUT" && response.url().endsWith("/api/settings/visual/background-config");
    })
    .then(async (response): Promise<ApiAttemptResult> => ({
      status: response.status(),
      body: await response.json().catch(() => null),
    }));

  await saveButton.click();
  return configResponsePromise;
}

export function generateDifferentBackgroundConfig(snapshot: BackgroundSnapshots, scene: VisualBackgroundScene): VisualBackgroundConfig {
  const current = snapshot[scene].config;
  return {
    ...current,
    version: 2,
    fitMode: "cover-crop",
    mode: "switchable",
    fixedBackgroundId: current.fixedBackgroundId,
    switchTrigger: current.switchTrigger === "interval" ? "on_open" : "interval",
    switchOrder: current.switchOrder === "random" ? "sequential" : "random",
    switchIntervalMinutes: current.switchIntervalMinutes >= 1440 ? 1 : current.switchIntervalMinutes + 1,
    crops: current.fixedBackgroundId
      ? { ...current.crops, [current.fixedBackgroundId]: current.crops[current.fixedBackgroundId] ?? defaultVisualBackgroundCrop }
      : current.crops,
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
    sidebar_background: normalizeBackgrounds(await listVisualBackgrounds("sidebar_background")),
    topbar_background: normalizeBackgrounds(await listVisualBackgrounds("topbar_background")),
  };
}

function visibleBackgroundSnapshot(snapshot: BackgroundSnapshots) {
  return {
    login_background: snapshot.login_background,
    sidebar_background: snapshot.sidebar_background,
    topbar_background: snapshot.topbar_background,
  };
}

export function skinWorkbench(page: Page, scope: "personal" | "system") {
  return page.locator(`.orf-skin-workbench[data-scope="${scope}"]`);
}

export async function selectSkinWorkbenchSlot(page: Page, scope: "personal" | "system", scene: VisualBackgroundScene) {
  const workbench = skinWorkbench(page, scope);
  await expect(workbench).toBeVisible();
  const label = slotLabel(scene);
  await workbench.locator(".orf-skin-slot-rail").getByRole("button", { name: label, exact: true }).click();
  await expect(workbench.locator(".orf-skin-editor-title").getByRole("heading", { name: label, exact: true })).toBeVisible();
  await expect(workbench.locator(".orf-skin-gallery")).toHaveAttribute("data-loading", "false");
}

function skinGalleryCard(page: Page, background: VisualBackgroundImage, scope?: "personal" | "system") {
  const root = scope ? skinWorkbench(page, scope) : page.locator("body");
  return root.locator(".orf-skin-gallery-card", {
    has: page.getByRole("img", { name: background.fileName, exact: true }),
  });
}

function slotLabel(scene: VisualBackgroundScene) {
  if (scene === "login_background") return "登录页";
  if (scene === "topbar_background") return "顶部栏";
  if (scene === "sidebar_background") return "侧边栏";
  if (scene === "page_bounties_background") return "悬赏大厅";
  return scene;
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
