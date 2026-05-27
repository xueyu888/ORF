import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { objectives } from "../../../../server/db/schema";
import type { BountyHallData } from "../../../../server/repositories/orfRepository";
import type { ChallengeApplication, ObjectiveFlowStatus } from "../../../../src/types/orf";
import type { BountyApplicationRecord, BountyTarget } from "./apply-challenge.context";

const applicationFlowStatuses = new Set(["open", "applying", "recruiting"]);

export async function selectBountyTargetFromPage(page: Page, applicant: string, title: string): Promise<BountyTarget> {
  const response = await readBountyHall(page);
  if (response.status !== 200) {
    throw new Error(`读取悬赏大厅数据失败: HTTP ${response.status}`);
  }

  const target = selectBountyTarget(response.body, applicant, title);
  if (!target) {
    throw new Error(`悬赏大厅没有当前用户可申请的本用例目标: ${title}`);
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

function selectBountyTarget(data: BountyHallData, applicant: string, title: string): BountyTarget | null {
  const items = [...data.availableItems, ...data.recruitmentItems].filter((item) => {
    const objective = item.objective;
    return (
      objective.title === title &&
      !item.isRecruitment &&
      !item.hasCurrentApplication &&
      applicationFlowStatuses.has(objective.flowStatus) &&
      !objective.challengers.includes(applicant)
    );
  });
  if (items.length === 0) {
    return null;
  }

  const item = items[0];
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
