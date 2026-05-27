import type { Page } from "@playwright/test";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { teamMembers, users } from "../../../../server/db/schema";
import type { CapturedResponse } from "../../../_operators/common.context";
import { readResponseBody } from "../../../_operators/common.helpers";
import type { AdminEditMemberCaseData, EditableMemberRecord } from "./admin-edit-member.context";

export async function closeAdminEditMemberTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAdminAccount(email);
  return !!account && account.role === "admin" && account.status === "active";
}

export async function testMemberAbsent(data: AdminEditMemberCaseData) {
  return (await readCandidateUsers(data)).length === 0;
}

export async function createEditableMember(data: AdminEditMemberCaseData): Promise<EditableMemberRecord> {
  const admin = await readAdminAccount(data.adminEmail);
  if (!admin) {
    throw new Error("预置管理员账号不存在，无法创建可编辑成员");
  }

  await db.insert(users).values({
    id: data.targetUserId,
    name: data.originalName,
    email: data.originalEmail,
    status: "active",
    createdAt: today(),
    lastOnlineAt: null,
  });

  await db.insert(teamMembers).values({
    teamId: admin.teamId,
    userId: data.targetUserId,
    role: data.originalRole,
  });

  return {
    id: data.targetUserId,
    teamId: admin.teamId,
    name: data.originalName,
    email: data.originalEmail,
    role: data.originalRole,
    status: "active",
  };
}

export async function deleteEditableMember(data: AdminEditMemberCaseData) {
  const rows = await readCandidateUsers(data);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return;
  }

  await db.delete(teamMembers).where(inArray(teamMembers.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
}

export async function editableMemberOriginal(data: AdminEditMemberCaseData) {
  const member = await readMemberById(data.targetUserId);
  return (
    !!member &&
    member.name === data.originalName &&
    member.email === data.originalEmail &&
    member.role === data.originalRole &&
    member.status === "active"
  );
}

export async function editableMemberUpdated(data: AdminEditMemberCaseData) {
  const member = await readMemberById(data.targetUserId);
  return (
    !!member &&
    member.name === data.updatedName &&
    member.email === data.updatedEmail &&
    member.role === data.updatedRole &&
    member.status === "active"
  );
}

export function captureUserUpdateResponse(page: Page, member: EditableMemberRecord): Promise<CapturedResponse> {
  return page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "PATCH" && response.url().endsWith(`/api/users/${member.id}`);
    })
    .then(async (response) => ({
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
      method: response.request().method(),
      body: await readResponseBody(response),
    }));
}

async function readAdminAccount(email: string): Promise<(EditableMemberRecord & { role: "admin" }) | null> {
  const [row] = await db
    .select({
      id: users.id,
      teamId: teamMembers.teamId,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
      status: users.status,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (!row || row.role !== "admin") {
    return null;
  }

  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    email: row.email ?? "",
    role: "admin",
    status: row.status ?? "active",
  };
}

async function readMemberById(userId: string): Promise<EditableMemberRecord | null> {
  const [row] = await db
    .select({
      id: users.id,
      teamId: teamMembers.teamId,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
      status: users.status,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    email: row.email ?? "",
    role: row.role === "admin" ? "admin" : "member",
    status: row.status ?? "active",
  };
}

async function readCandidateUsers(data: AdminEditMemberCaseData) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(
      or(
        eq(users.id, data.targetUserId),
        inArray(users.email, [data.originalEmail, data.updatedEmail]),
        inArray(users.name, [data.originalName, data.updatedName]),
      ),
    );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
