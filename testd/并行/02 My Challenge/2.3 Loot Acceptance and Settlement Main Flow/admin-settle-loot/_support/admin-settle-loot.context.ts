import type { BrowserContext, Page } from "@playwright/test";
import type {
  LootResultClaimStatus,
  ObjectiveAcceptedResult,
  ObjectiveFlowStatus,
  ObjectiveSettlementEventKind,
  OrfStage,
  ResultAcceptedResult,
  UncertaintyLevel,
  UserRole,
  UserStatus,
} from "../../../../../../src/types/orf";
import type { TestUserAccountRecord } from "../../../../../_operators/common.helpers";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type AcceptedObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "accepted">;
  finalDueOffsetDays: 8;
};

export type SettledObjectiveTargetData = {
  title: string;
  stage: Extract<OrfStage, "goalFrozen">;
  flowStatus: Extract<ObjectiveFlowStatus, "settled">;
  finalDueOffsetDays: 8;
};

export type ObjectiveTargetStateData = AcceptedObjectiveTargetData | SettledObjectiveTargetData;

export type MetricData = {
  title: string;
  difficulty: Extract<UncertaintyLevel, "进阶">;
  score: 30;
  claim: Extract<LootResultClaimStatus, "completed">;
  finalEvidence: string;
  acceptedResult: Extract<ResultAcceptedResult, "completed">;
};

export type FinalLootData = {
  body: string;
  selfTestReportBody: string;
};

export type SettlementData = {
  basePoints: 30;
  completionMultiplier: 1;
  eventKind: Extract<ObjectiveSettlementEventKind, "finalCompletion">;
  reason: string;
  settlementPoints: 30;
};

export type AdminSettleLootCaseData = {
  acceptanceResult: Extract<ObjectiveAcceptedResult, "completed">;
  acceptanceReviewReason: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  adminRole: Extract<UserRole, "admin">;
  adminStatus: Extract<UserStatus, "active">;
  finalLoot: FinalLootData;
  memberEmail: string;
  memberName: string;
  memberPassword: string;
  memberRole: Extract<UserRole, "member">;
  memberStatus: Extract<UserStatus, "active">;
  metric: MetricData;
  settledTarget: SettledObjectiveTargetData;
  settlement: SettlementData;
  target: AcceptedObjectiveTargetData;
  targetPrefix: string;
};

export type ChallengeApiObjective = {
  acceptedResult?: ObjectiveAcceptedResult | null;
  completionMultiplier?: number | null;
  flowStatus: ObjectiveFlowStatus;
  id: string;
  objectiveBasePoints: number;
  objectiveSettlementPoints?: number | null;
  stage: OrfStage;
  title: string;
};

export type ChallengeApiSettlementEvent = {
  basePoints: number;
  createdByUserId: string;
  id: string;
  kind: ObjectiveSettlementEventKind;
  multiplier: number;
  objectiveId: string;
  reason: string;
  settlementPoints: number;
};

export type ChallengeApiPointLedgerEntry = {
  memberName: string;
  objectiveId: string;
  points: number;
  reason: string;
  settlementEventId?: string | null;
  userId: string;
};

export type ChallengeApiResult = {
  acceptedResult: ResultAcceptedResult;
  objectiveId: string;
  title: string;
};

export type ChallengesApiData = {
  objectiveSettlementEvents: ChallengeApiSettlementEvent[];
  objectives: ChallengeApiObjective[];
  pointLedger: ChallengeApiPointLedgerEntry[];
  results: ChallengeApiResult[];
};

export type { TestUserAccountRecord };
