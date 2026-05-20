import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { teamMembers, users } from "../../../../server/db/schema";
import { listVisualBackgrounds } from "../../../../server/settings/visualBackgrounds";
import type { VisualBackgroundsData, VisualBackgroundScene } from "../../../../src/state/apiClient";
import type { BackgroundPermissionCaseData, BackgroundSnapshots } from "./background-permission.context";

export async function closeBackgroundPermissionTestDb() {
  await closeDb();
}

export async function memberAccountActive(data: Pick<BackgroundPermissionCaseData, "email" | "role">) {
  const memberships = await readMemberMemberships(data.email);
  return memberships.some((membership) => membership.role === data.role && membership.status === "active");
}

export async function readBackgroundSnapshots(): Promise<BackgroundSnapshots> {
  return {
    login_background: normalizeBackgrounds(await listVisualBackgrounds("login_background")),
    sidebar_background: normalizeBackgrounds(await listVisualBackgrounds("sidebar_background")),
  };
}

export async function backgroundsMatchSnapshot(snapshot: BackgroundSnapshots) {
  return JSON.stringify(await readBackgroundSnapshots()) === JSON.stringify(snapshot);
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

async function readMemberMemberships(email: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`));
}
