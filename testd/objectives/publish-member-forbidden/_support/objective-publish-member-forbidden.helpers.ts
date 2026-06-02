import type { Page } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { normalizePermissionKeys } from "../../../../src/config/permissions";
import { db } from "../../../../server/db/client";
import { rolePermissions, teams } from "../../../../server/db/schema";
import {
  acquireRolePermissionLock,
  releaseRolePermissionLock,
} from "../../../_operators/role-permission-lock";
import type {
  BountyHallResponse,
  MemberPermissionSnapshot,
  MyChallengesResponse,
} from "./objective-publish-member-forbidden.context";

const permissionStorageStage = "global";
const permissionStorageResource = "permissionKeys";
const objectiveCreatePermission = "objective.create";

export async function readMemberWorkbenchData(page: Page): Promise<MyChallengesResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}

export async function memberWorkbenchMissingObjectiveTitle(page: Page, title: string) {
  const response = await readMemberWorkbenchData(page);
  if (response.status !== 200) {
    return false;
  }

  return !(response.body.objectives ?? []).some((objective) => objective.title === title);
}

export async function readMemberBountyHallData(page: Page): Promise<BountyHallResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/bounties", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  });
}

export async function memberBountyHallMissingObjectiveTitle(page: Page, title: string) {
  const response = await readMemberBountyHallData(page);
  if (response.status !== 200) {
    return false;
  }

  return [
    ...(response.body.availableItems ?? []),
    ...(response.body.recruitmentItems ?? []),
  ].every((item) => item.objective?.title !== title);
}

export async function removeMemberObjectiveCreatePermission(): Promise<MemberPermissionSnapshot> {
  const lockOwner = await acquireRolePermissionLock();
  try {
    const snapshot = await readMemberPermissionSnapshot();
    await writeMemberPermissionActions(
      snapshot.teamId,
      snapshot.actions.filter((action) => action !== objectiveCreatePermission),
    );
    return { ...snapshot, lockOwner };
  } catch (error) {
    await releaseRolePermissionLock(lockOwner);
    throw error;
  }
}

export async function restoreMemberPermissionSnapshot(snapshot: MemberPermissionSnapshot | undefined) {
  if (!snapshot) {
    return;
  }

  try {
    if (!snapshot.existed) {
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.teamId, snapshot.teamId),
            eq(rolePermissions.role, "member"),
            eq(rolePermissions.stage, permissionStorageStage),
            eq(rolePermissions.resource, permissionStorageResource),
          ),
        );
      return;
    }

    await writeMemberPermissionActions(snapshot.teamId, snapshot.actions);
  } finally {
    await releaseRolePermissionLock(snapshot.lockOwner);
  }
}

export async function memberObjectiveCreatePermissionAbsent() {
  const snapshot = await readMemberPermissionSnapshot();
  return !snapshot.actions.includes(objectiveCreatePermission);
}

async function readMemberPermissionSnapshot(): Promise<MemberPermissionSnapshot> {
  const teamId = await readDefaultTeamId();
  const [row] = await db
    .select({ actions: rolePermissions.actions })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.teamId, teamId),
        eq(rolePermissions.role, "member"),
        eq(rolePermissions.stage, permissionStorageStage),
        eq(rolePermissions.resource, permissionStorageResource),
      ),
    )
    .limit(1);

  return {
    teamId,
    existed: !!row,
    actions: normalizePermissionKeys(row?.actions ?? []),
  };
}

async function writeMemberPermissionActions(teamId: string, actions: string[]) {
  await db
    .insert(rolePermissions)
    .values({
      teamId,
      role: "member",
      stage: permissionStorageStage,
      resource: permissionStorageResource,
      actions: normalizePermissionKeys(actions),
    })
    .onConflictDoUpdate({
      target: [
        rolePermissions.teamId,
        rolePermissions.role,
        rolePermissions.stage,
        rolePermissions.resource,
      ],
      set: { actions: normalizePermissionKeys(actions) },
    });
}

async function readDefaultTeamId() {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .orderBy(asc(teams.id))
    .limit(1);

  if (!team) {
    throw new Error("默认团队不存在，无法准备普通成员权限");
  }
  return team.id;
}
