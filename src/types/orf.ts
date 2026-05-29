import type { PermissionKey } from "../config/permissions";

export type WorkStatus = "On Track" | "At Risk" | "Blocked" | "Draft";
export type FeedbackStatus = "New" | "Reviewing" | "Action Created" | "Result Updated" | "Closed";
export type TaskStatus = "Backlog" | "Todo" | "In Progress" | "In Review" | "Done";
export type Priority = "Low" | "Medium" | "High" | "Critical";
export type Impact = "Low" | "Medium" | "High" | "Critical";
export type MetricDirection = "increase" | "decrease";
export type UncertaintyLevel = "入门" | "进阶" | "破局" | "渡劫" | "飞升";
export type BountySource = "managerDefined" | "memberProposed";
export type ChallengeApplicationStatus = "pending" | "approved" | "declined";
export type NotificationKind =
  | "objective.published"
  | "challenge.application.created"
  | "challenge.application.approved"
  | "objective.recruitment.created"
  | "objective.challenge.accepted"
  | "objective.loot.submitted"
  | "comment.mention.created";
export type NotificationTargetType = "objective" | "objectiveLoot" | "comment";
export type ObjectiveAcceptedResult = "completed" | "falsified" | "overturned" | "abandoned" | "overdelivered";
export type ResultAcceptedResult = "unreviewed" | "completed" | "falsified" | "failed";
export type EvidenceType = "Eval run" | "Log sample" | "User report" | "Dashboard snapshot" | "Incident report";
export type FeedbackSource = "User report" | "Eval run" | "Log" | "Incident" | "Team review";
export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "active" | "rejected" | "disabled";
export type OrfStage = "goalSetting" | "resultClaiming" | "orfReestimate" | "goalFrozen";
export type ObjectiveFlowStatus = "candidate" | "open" | "applying" | "recruiting" | "reestimating" | "frozen" | "submitted" | "settled" | "closed";
export type LootResultClaimStatus = "completed" | "falsified" | "notClaimed";
export type ObjectiveTrialReviewStatus = "requested" | "approved" | "needsWork";

export interface OrfUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  authLinked?: boolean;
  lastOnlineAt?: string | null;
  avatarUrl?: string | null;
}

export interface PermissionRule {
  role: UserRole;
  permissions: PermissionKey[];
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface ChallengeApplication {
  id: string;
  applicant: string;
  reason?: string;
  status: ChallengeApplicationStatus;
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  recipientUserId: string;
  actorUserId?: string | null;
  actorName: string;
  title: string;
  body: string;
  targetType: NotificationTargetType;
  targetId: string;
  targetHref: string;
  readAt?: string | null;
  createdAt: string;
  metadata: Record<string, string>;
}

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  at: string;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  cycle: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  confidence: number;
  progress: number;
  boundary: string;
  successDefinition: string;
  resultIds: string[];
  feedbackIds: string[];
  taskIds: string[];
  finalDueAt: string;
  challengers: string[];
  assignedChallengers: string[];
  challengeApplications: ChallengeApplication[];
  acceptedAt?: string | null;
  confirmationDueAt?: string | null;
  confirmedAt?: string | null;
  lootSubmittedAt?: string | null;
  acceptedResult?: ObjectiveAcceptedResult | null;
  completionMultiplier?: number | null;
  objectiveBasePoints: number;
  objectiveSettlementPoints?: number | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LootResultClaim {
  resultId: string;
  claim: LootResultClaimStatus;
  evidenceText: string;
}

export interface ObjectiveLoot {
  id: string;
  objectiveId: string;
  submittedBy: string;
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportUrl?: string | null;
  selfTestReportBody?: string | null;
  submittedAt: string;
}

export interface ObjectiveTrialReview {
  id: string;
  objectiveId: string;
  requestedBy: string;
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportBody?: string | null;
  status: ObjectiveTrialReviewStatus;
  commanderFeedback?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  requestedAt: string;
}

export interface PointLedgerEntry {
  id: string;
  objectiveId: string;
  userId?: string | null;
  memberName: string;
  points: number;
  reason: string;
  createdAt: string;
}

export interface ContributionAllocation {
  member: string;
  ratio: number;
}

export interface ObjectiveContributionReview {
  id: string;
  objectiveId: string;
  reviewer: string;
  allocations: ContributionAllocation[];
  submittedAt: string;
}

export interface Result {
  id: string;
  objectiveId: string;
  title: string;
  description: string;
  metricName: string;
  metricRequirement?: string;
  statisticalObject?: string;
  completionStandard?: string;
  sampleSet?: string;
  measurementScope?: string;
  uncertaintyLevel?: UncertaintyLevel;
  baseline: number;
  current: number;
  target: number;
  unit: string;
  direction: MetricDirection;
  status: WorkStatus;
  confidence: number;
  source?: BountySource;
  definer?: string;
  uncertaintyScore: number;
  acceptedResult: ResultAcceptedResult;
  evidenceIds: string[];
  feedbackIds: string[];
  trend: TrendPoint[];
  reviewCadence: string;
}

export interface Feedback {
  id: string;
  phenomenon: string;
  evidenceIds: string[];
  causeCategories: string[];
  impact: Impact;
  linkedObjectiveId: string;
  linkedResultId: string;
  suggestedAdjustment: string;
  source: FeedbackSource;
  status: FeedbackStatus;
  owner: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  activity: ActivityItem[];
}

export interface TaskChecklistItem {
  id: string;
  label: string;
  done: boolean;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  linkedObjectiveId: string;
  feedbackOriginId?: string;
  dueDate: string;
  tags: string[];
  checklist: TaskChecklistItem[];
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  title: string;
  summary: string;
  source: string;
  date: string;
  owner: string;
  linkedResultId: string;
  linkedFeedbackId?: string;
}

export interface Decision {
  id: string;
  title: string;
  reason: string;
  evidence: string;
  owner: string;
  date: string;
  linkedObjectiveId: string;
  linkedResultId?: string;
  linkedFeedbackId?: string;
}

export interface EvalRun {
  id: string;
  scenario: string;
  dataset: string;
  model: string;
  promptVersion: string;
  ragVersion: string;
  accuracy: number;
  hallucination: number;
  latency: number;
  cost: number;
  status: WorkStatus;
  linkedResultId: string;
}

export interface Scenario {
  id: string;
  title: string;
  qualityScore: number;
  lastRun: string;
  topFailureCause: string;
  linkedObjectiveId: string;
  openFeedbackCount: number;
}

export interface FailureSample {
  id: string;
  question: string;
  modelAnswer: string;
  expectedAnswer: string;
  reason: string;
  linkedResultId: string;
}

export interface OrfRules {
  requireResultForTask: boolean;
  requireEvidenceForFeedback: boolean;
  weeklyFeedbackCadence: boolean;
  autoCreateReviewSummary: boolean;
}

export type CommentTargetType = "objective" | "result" | "task" | "subtask";
export type CommentStatus = "open" | "resolved";

export interface CommentAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  contentUrl: string;
}

export interface CommentMessage {
  id: string;
  author: string;
  authorUserId?: string | null;
  authorAvatarUrl?: string | null;
  body: string;
  attachments: CommentAttachment[];
  createdAt: string;
  parentMessageId?: string;
  replyToMessageId?: string;
  replyToAuthor?: string;
}

export interface CommentThread {
  id: string;
  targetType: CommentTargetType;
  targetId: string;
  targetTitle: string;
  status: CommentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  messages: CommentMessage[];
}

export interface OrfState {
  users: OrfUser[];
  currentUserId: string;
  permissionRules: PermissionRule[];
  objectives: Objective[];
  results: Result[];
  feedback: Feedback[];
  tasks: Task[];
  evidence: Evidence[];
  decisions: Decision[];
  evalRuns: EvalRun[];
  scenarios: Scenario[];
  failureSamples: FailureSample[];
  comments: CommentThread[];
  objectiveLoot: ObjectiveLoot[];
  objectiveTrialReviews: ObjectiveTrialReview[];
  objectiveContributionReviews: ObjectiveContributionReview[];
  pointLedger: PointLedgerEntry[];
  causeCategories: string[];
  rules: OrfRules;
}
