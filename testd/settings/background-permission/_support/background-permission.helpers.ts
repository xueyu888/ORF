import type { Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { listVisualBackgrounds } from "../../../../server/settings/visualBackgrounds";
import type { VisualBackgroundsData, VisualBackgroundScene } from "../../../../src/state/apiClient";
import type { BackgroundSnapshots } from "./background-permission.context";

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

export async function readSidebarBackgroundsAsCurrentUser(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/settings/visual/backgrounds?scene=sidebar_background", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  });
}

export async function attemptSaveSidebarBackgroundConfig(page: Page) {
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

export async function attemptSetDefaultSidebarBackground(page: Page) {
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
