import type { Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { listVisualBackgrounds } from "../../../server/settings/visualBackgrounds";
import type { VisualBackgroundConfig, VisualBackgroundsData, VisualBackgroundScene } from "../../../src/state/apiClient";
import type { ApiAttemptResult, BackgroundSnapshots } from "./background-settings.context";

const userSettingsPath = path.join(process.cwd(), "public", "settings", "user", "settings.json");

export async function readBackgroundSnapshots(): Promise<BackgroundSnapshots> {
  return {
    login_background: normalizeBackgrounds(await listVisualBackgrounds("login_background")),
    sidebar_background: normalizeBackgrounds(await listVisualBackgrounds("sidebar_background")),
    userSettingsFile: await readUserSettingsFileSnapshot(),
  };
}

export async function backgroundsMatchSnapshot(snapshot: BackgroundSnapshots) {
  const current = await readBackgroundSnapshots();
  return (
    JSON.stringify(visibleBackgroundSnapshot(current)) ===
    JSON.stringify(visibleBackgroundSnapshot(snapshot))
  );
}

export async function restoreBackgroundSnapshots(snapshot: BackgroundSnapshots) {
  if (snapshot.userSettingsFile.existed && snapshot.userSettingsFile.content !== null) {
    await mkdir(path.dirname(userSettingsPath), { recursive: true });
    await writeFile(userSettingsPath, snapshot.userSettingsFile.content, "utf8");
  } else {
    await rm(userSettingsPath, { force: true });
  }
}

export async function readSidebarBackgroundsAsCurrentUser(page: Page): Promise<ApiAttemptResult> {
  return page.evaluate(async () => {
    const response = await fetch("/api/settings/visual/backgrounds?scene=sidebar_background", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  });
}

export async function attemptSaveSidebarBackgroundConfig(page: Page): Promise<ApiAttemptResult> {
  return page.evaluate(async () => {
    const readResponse = await fetch("/api/settings/visual/backgrounds?scene=sidebar_background", { credentials: "include" });
    const readBody = await readResponse.json();
    const config = readBody?.data?.config ?? {
      mode: "fixed",
      fixedBackgroundId: null,
      switchTrigger: "on_open",
      switchOrder: "random",
      switchIntervalMinutes: 10,
    };

    const response = await fetch("/api/settings/visual/background-config", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scene: "sidebar_background", config }),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  });
}

export async function saveSidebarBackgroundConfigAsCurrentUser(page: Page, config: VisualBackgroundConfig): Promise<ApiAttemptResult> {
  return page.evaluate(async (nextConfig) => {
    const response = await fetch("/api/settings/visual/background-config", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scene: "sidebar_background", config: nextConfig }),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, config);
}

export async function attemptSetDefaultSidebarBackground(page: Page): Promise<ApiAttemptResult> {
  return page.evaluate(async () => {
    const readResponse = await fetch("/api/settings/visual/backgrounds?scene=sidebar_background", { credentials: "include" });
    const readBody = await readResponse.json();
    const id = readBody?.data?.list?.[0]?.id;
    if (typeof id !== "string" || !id) {
      return { skipped: true };
    }

    const response = await fetch(`/api/settings/visual/backgrounds/${encodeURIComponent(id)}/default`, {
      method: "PUT",
      credentials: "include",
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  });
}

export function generateDifferentSidebarBackgroundConfig(snapshot: BackgroundSnapshots): VisualBackgroundConfig {
  const current = snapshot.sidebar_background.config;
  return {
    mode: "switchable",
    fixedBackgroundId: current.fixedBackgroundId,
    switchTrigger: current.switchTrigger === "interval" ? "on_open" : "interval",
    switchOrder: current.switchOrder === "random" ? "sequential" : "random",
    switchIntervalMinutes: current.switchIntervalMinutes >= 1440 ? 1 : current.switchIntervalMinutes + 1,
  };
}

export function readSidebarBackgroundConfigFromResult(result: ApiAttemptResult): VisualBackgroundConfig | null {
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

export function readSidebarBackgroundConfigFromBackgrounds(result: ApiAttemptResult): VisualBackgroundConfig | null {
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

async function readUserSettingsFileSnapshot(): Promise<BackgroundSnapshots["userSettingsFile"]> {
  try {
    return {
      existed: true,
      content: await readFile(userSettingsPath, "utf8"),
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return { existed: false, content: null };
    }
    throw error;
  }
}

function visibleBackgroundSnapshot(snapshot: BackgroundSnapshots) {
  return {
    login_background: snapshot.login_background,
    sidebar_background: snapshot.sidebar_background,
  };
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
