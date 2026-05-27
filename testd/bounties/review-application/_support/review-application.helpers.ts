import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, teamMembers, users } from "../../../../server/db/schema";
import { ORY_ADMIN_URL } from "../../../_operators/common.context";
import { findOryIdentityByEmail } from "../../../_operators/common.helpers";
import type { ChallengeApplication, ObjectiveFlowStatus } from "../../../../src/types/orf";
import type { ReviewApplicationCaseData, ReviewApplicationObjectiveSnapshot, ReviewApplicationTarget } from "./review-application.context";

const reviewableFlowStatuses = new Set<ObjectiveFlowStatus>(["open", "applying", "recruiting", "reestimating"]);
const halfDayMs = 12 * 60 * 60 * 1000;

export async function closeReviewApplicationTestDb() {
  await closeDb();
}

export async function adminAccountActive(email: string) {
  const account = await readAdminAccount(email);
  return !!account && account.role === "admin" && account.status === "active";
}

export async function memberAccountActive(name: string) {
  const [row] = await db
    .select({
      name: users.name,
      role: teamMembers.role,
      status: users.status,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(eq(users.name, name), eq(teamMembers.role, "member"), eq(users.status, "active")))
    .limit(1);

  return !!row;
}

export async function reviewTargetAvailable(data: Pick<ReviewApplicationCaseData, "email" | "approveApplicantName" | "rejectApplicantName">) {
  return (await selectReviewTarget(data)) !== null;
}

export async function selectReviewTarget(data: Pick<ReviewApplicationCaseData, "email" | "approveApplicantName" | "rejectApplicantName">): Promise<ReviewApplicationTarget | null> {
  return findReviewTarget(data);
}

export async function createPendingApplication(target: ReviewApplicationTarget, applicant: string, applicationId: string) {
  const objective = await readObjectiveWithSnapshot(target.objective.id);
  if (!objective) {
    throw new Error("目标不存在，无法创建待审批挑战申请");
  }

  const now = new Date().toISOString();
  const previousApplications = objective.challengeApplications.filter(
    (application) => application.id !== applicationId && application.applicant !== applicant,
  );
  const nextApplications: ChallengeApplication[] = [
    {
      id: applicationId,
      applicant,
      status: "pending",
      createdAt: now,
      decidedAt: null,
    },
    ...previousApplications,
  ];

  await db
    .update(objectives)
    .set({
      challengeApplications: nextApplications,
      flowStatus: target.previous.flowStatus === "recruiting" || target.previous.flowStatus === "reestimating"
        ? target.previous.flowStatus
        : "applying",
      updatedAt: today(),
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function restoreReviewTarget(target: ReviewApplicationTarget | null) {
  if (!target) {
    return;
  }

  await db
    .update(objectives)
    .set({
      stage: target.previous.stage,
      flowStatus: target.previous.flowStatus,
      status: target.previous.status,
      challengers: target.previous.challengers,
      assignedChallengers: target.previous.assignedChallengers,
      challengeApplications: target.previous.challengeApplications,
      acceptedAt: target.previous.acceptedAt,
      confirmationDueAt: target.previous.confirmationDueAt,
      updatedAt: target.previous.updatedAt,
      updatedBy: target.previous.updatedBy,
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function applicationStatus(target: ReviewApplicationTarget, applicant: string) {
  const objective = await readObjective(target.objective.id);
  return objective?.challengeApplications.find((application) => application.applicant === applicant)?.status ?? null;
}

export async function objectiveHasChallenger(target: ReviewApplicationTarget, applicant: string) {
  const objective = await readObjective(target.objective.id);
  return objective?.challengers.includes(applicant) ?? false;
}

export async function objectiveFlowStatus(target: ReviewApplicationTarget) {
  return (await readObjective(target.objective.id))?.flowStatus ?? null;
}

export function objectivePanel(page: Page, target: ReviewApplicationTarget) {
  return page.locator("section.orf-objective-panel").filter({ hasText: target.objective.title }).first();
}

export function applicationPill(page: Page, target: ReviewApplicationTarget, applicant: string) {
  return objectivePanel(page, target).locator(".orf-objective-application-pill").filter({ hasText: applicant }).first();
}

export async function revokeOrySessionsByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
  }
}

async function findReviewTarget(data: Pick<ReviewApplicationCaseData, "email" | "approveApplicantName" | "rejectApplicantName">): Promise<ReviewApplicationTarget | null> {
  const admin = await readAdminAccount(data.email);
  if (!admin) {
    return null;
  }

  const rows = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      status: objectives.status,
      finalDueAt: objectives.finalDueAt,
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
      acceptedAt: objectives.acceptedAt,
      confirmationDueAt: objectives.confirmationDueAt,
      updatedAt: objectives.updatedAt,
      updatedBy: objectives.updatedBy,
    })
    .from(objectives)
    .where(eq(objectives.teamId, admin.teamId));

  const titleCounts = new Map<string, number>();
  for (const row of rows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const applicants = [data.approveApplicantName, data.rejectApplicantName];
  const candidates = rows.filter((row) => {
    if (!reviewableFlowStatuses.has(row.flowStatus)) return false;
    if (!hasEnoughTimeForApproval(row.finalDueAt)) return false;
    if (applicants.some((name) => row.challengers.includes(name) || row.assignedChallengers.includes(name))) return false;
    if (row.challengeApplications.some((application) => applicants.includes(application.applicant) && application.status === "pending")) return false;
    return true;
  });

  const selected =
    candidates.find((row) => titleCounts.get(row.title) === 1 && row.flowStatus === "open" && row.challengeApplications.length === 0) ??
    candidates.find((row) => titleCounts.get(row.title) === 1) ??
    candidates[0];

  if (!selected) {
    return null;
  }

  return {
    objective: {
      id: selected.id,
      title: selected.title,
    },
    approveApplicationId: "challenge-application-testd-review-approve",
    rejectApplicationId: "challenge-application-testd-review-reject",
    approveApplicantName: data.approveApplicantName,
    rejectApplicantName: data.rejectApplicantName,
    previous: {
      id: selected.id,
      title: selected.title,
      stage: selected.stage,
      flowStatus: selected.flowStatus,
      status: selected.status,
      challengers: selected.challengers,
      assignedChallengers: selected.assignedChallengers,
      challengeApplications: selected.challengeApplications,
      acceptedAt: selected.acceptedAt,
      confirmationDueAt: selected.confirmationDueAt,
      updatedAt: selected.updatedAt,
      updatedBy: selected.updatedBy,
    },
  };
}

async function readObjectiveWithSnapshot(objectiveId: string): Promise<{
  flowStatus: ObjectiveFlowStatus;
  challengers: string[];
  assignedChallengers: string[];
  challengeApplications: ChallengeApplication[];
} | null> {
  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      assignedChallengers: objectives.assignedChallengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readObjective(objectiveId: string): Promise<{
  flowStatus: ObjectiveFlowStatus;
  challengers: string[];
  challengeApplications: ChallengeApplication[];
} | null> {
  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
}

async function readAdminAccount(email: string): Promise<{
  userId: string;
  teamId: string;
  role: string;
  status: string;
} | null> {
  const [row] = await db
    .select({
      userId: users.id,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
      status: users.status,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return row ?? null;
}

function hasEnoughTimeForApproval(finalDueAt: string) {
  const finalDueDate = new Date(`${finalDueAt}T23:59:00`);
  return Number.isFinite(finalDueDate.getTime()) && finalDueDate.getTime() - Date.now() >= halfDayMs;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
