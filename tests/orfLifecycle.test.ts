import assert from "node:assert/strict";
import test from "node:test";
import {
  canApplyForObjectiveChallenge,
  canRecruitObjectiveChallengersByFlow,
  canReviewObjectiveChallengeApplications,
  isObjectiveResultLockedByFlow,
  isObjectiveSettledOrClosed,
  shouldRenderObjectiveAsFrozen,
} from "../src/domain/orfLifecycle";
import type { Objective } from "../src/types/orf";

const flowStatuses: Objective["flowStatus"][] = [
  "candidate",
  "open",
  "applying",
  "recruiting",
  "reestimating",
  "frozen",
  "submitted",
  "settled",
  "closed",
];

test("objective lifecycle guards cover every flow status", () => {
  const applicationStatuses = new Set<Objective["flowStatus"]>(["open", "applying", "recruiting"]);
  const reviewStatuses = new Set<Objective["flowStatus"]>(["applying", "recruiting", "reestimating"]);
  const recruitmentStatuses = new Set<Objective["flowStatus"]>(["open", "applying", "recruiting", "reestimating"]);
  const resultLockedStatuses = new Set<Objective["flowStatus"]>(["frozen", "submitted", "settled", "closed"]);
  const settlementStatuses = new Set<Objective["flowStatus"]>(["settled", "closed"]);
  const frozenRenderStatuses = new Set<Objective["flowStatus"]>(["frozen", "submitted", "settled", "closed"]);

  for (const flowStatus of flowStatuses) {
    const item = objective({ flowStatus, stage: flowStatus === "reestimating" ? "orfReestimate" : flowStatus === "candidate" ? "goalSetting" : "goalFrozen" });

    assert.equal(canApplyForObjectiveChallenge(item), applicationStatuses.has(flowStatus), `${flowStatus}: application guard`);
    assert.equal(canReviewObjectiveChallengeApplications(item), reviewStatuses.has(flowStatus), `${flowStatus}: review guard`);
    assert.equal(canRecruitObjectiveChallengersByFlow(item), recruitmentStatuses.has(flowStatus), `${flowStatus}: recruitment guard`);
    assert.equal(isObjectiveResultLockedByFlow(item), resultLockedStatuses.has(flowStatus), `${flowStatus}: result lock guard`);
    assert.equal(isObjectiveSettledOrClosed(item), settlementStatuses.has(flowStatus), `${flowStatus}: settlement guard`);
    assert.equal(shouldRenderObjectiveAsFrozen(item), frozenRenderStatuses.has(flowStatus), `${flowStatus}: frozen display guard`);
  }
});

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: "obj-a",
    title: "Objective",
    description: "Objective description",
    whyItMatters: "It matters",
    cycle: "2026-Q2",
    stage: "resultClaiming",
    flowStatus: "open",
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: "Boundary",
    successDefinition: "Success",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    finalDueAt: "2026-06-30",
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    createdAt: "2026-05-14",
    updatedAt: "2026-05-14",
    ...overrides,
  };
}
