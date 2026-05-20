import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { objectives, teamMembers, users } from "../../../../server/db/schema";
import { getBountyHallData, type BountyHallData } from "../../../../server/repositories/orfRepository";
import { getDefaultRuntimeScopeForUser } from "../../../../server/repositories/runtimeScope";
import type { ChallengeApplication, ObjectiveFlowStatus } from "../../../../src/types/orf";
import type { ApplyChallengeCaseData, BountyApplicationRecord, BountyTarget } from "./apply-challenge.context";

const applicationFlowStatuses = new Set(["open", "applying", "recruiting"]);

export async function closeApplyChallengeTestDb() {
  await closeDb();
}

export async function memberAccountActive(data: Pick<ApplyChallengeCaseData, "email" | "role">) {
  const memberships = await readMemberMemberships(data.email);
  return memberships.some((membership) => membership.role === data.role && membership.status === "active");
}

export async function availableBountyTargetExists(data: Pick<ApplyChallengeCaseData, "email" | "name">) {
  return (await selectBountyTargetFromRepository(data)) !== null;
}

export async function selectBountyTargetFromPage(page: Page, applicant: string): Promise<BountyTarget> {
  const response = await readBountyHall(page);
  if (response.status !== 200) {
    throw new Error(`读取悬赏大厅数据失败: HTTP ${response.status}`);
  }

  const target = selectBountyTarget(response.body, applicant);
  if (!target) {
    throw new Error("悬赏大厅没有当前用户可申请的目标");
  }
  return target;
}

export async function bountyTargetPresentForCurrentUser(page: Page, target: BountyTarget) {
  const response = await readBountyHall(page);
  if (response.status !== 200) {
    return false;
  }

  return [...response.body.recruitmentItems, ...response.body.availableItems].some(
    (item) => item.objective.id === target.objective.id && item.hasCurrentApplication === target.hasCurrentApplication,
  );
}

export async function bountyTargetHasCurrentApplication(page: Page, target: BountyTarget) {
  const response = await readBountyHall(page);
  if (response.status !== 200) {
    return false;
  }

  return [...response.body.recruitmentItems, ...response.body.availableItems].some(
    (item) => item.objective.id === target.objective.id && item.hasCurrentApplication === true,
  );
}

export async function pendingApplicationAbsent(target: BountyTarget, applicant: string) {
  const objective = await readObjectiveApplications(target.objective.id);
  return !objective?.challengeApplications.some((application) => application.applicant === applicant && application.status === "pending");
}

export async function pendingApplicationExists(target: BountyTarget, applicant: string): Promise<BountyApplicationRecord | null> {
  const objective = await readObjectiveApplications(target.objective.id);
  const application = objective?.challengeApplications.find((item) => item.applicant === applicant && item.status === "pending");
  if (!application) {
    return null;
  }
  return {
    id: application.id,
    applicant: application.applicant,
    status: application.status,
    createdAt: application.createdAt,
  };
}

export async function objectiveFlowMatchesApplicationOutcome(target: BountyTarget) {
  const objective = await readObjectiveApplications(target.objective.id);
  if (!objective) {
    return false;
  }

  return objective.flowStatus === (target.previousFlowStatus === "recruiting" ? "recruiting" : "applying");
}

export async function removePendingApplication(target: BountyTarget, applicant: string) {
  const objective = await readObjectiveApplications(target.objective.id);
  if (!objective) {
    return;
  }

  const nextApplications = objective.challengeApplications.filter(
    (application) => !(application.applicant === applicant && application.status === "pending"),
  );
  await db
    .update(objectives)
    .set({
      challengeApplications: nextApplications,
      flowStatus: target.previousFlowStatus,
    })
    .where(eq(objectives.id, target.objective.id));
}

export async function targetStillExistsWithoutApplication(target: BountyTarget, applicant: string) {
  const objective = await readObjectiveApplications(target.objective.id);
  return !!objective && !objective.challengeApplications.some((application) => application.applicant === applicant && application.status === "pending");
}

async function selectBountyTargetFromRepository(data: Pick<ApplyChallengeCaseData, "email" | "name">) {
  const [member] = await readMemberMemberships(data.email);
  if (!member) {
    return null;
  }

  const scope = await getDefaultRuntimeScopeForUser(member.userId);
  if (!scope) {
    return null;
  }

  return selectBountyTarget(await getBountyHallData(data.name, { scope }), data.name);
}

function selectBountyTarget(data: BountyHallData, applicant: string): BountyTarget | null {
  const items = [...data.availableItems, ...data.recruitmentItems].filter((item) => {
    const objective = item.objective;
    return (
      !item.isRecruitment &&
      !item.hasCurrentApplication &&
      applicationFlowStatuses.has(objective.flowStatus) &&
      !objective.challengers.includes(applicant)
    );
  });
  if (items.length === 0) {
    return null;
  }

  const titleCounts = new Map<string, number>();
  for (const item of items) {
    titleCounts.set(item.objective.title, (titleCounts.get(item.objective.title) ?? 0) + 1);
  }

  const item = items.find((candidate) => titleCounts.get(candidate.objective.title) === 1) ?? items[0];
  return {
    objective: {
      id: item.objective.id,
      title: item.objective.title,
      flowStatus: item.objective.flowStatus,
      challengeApplications: item.objective.challengeApplications,
    },
    hasCurrentApplication: item.hasCurrentApplication,
    previousFlowStatus: item.objective.flowStatus,
  };
}

async function readBountyHall(page: Page): Promise<{ status: number; body: BountyHallData }> {
  return page.evaluate(async () => {
    const response = await fetch("/api/bounties", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json(),
    };
  });
}

async function readObjectiveApplications(objectiveId: string): Promise<{
  flowStatus: ObjectiveFlowStatus;
  challengeApplications: ChallengeApplication[];
} | null> {
  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return row ?? null;
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
