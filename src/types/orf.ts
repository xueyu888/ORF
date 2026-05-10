export type WorkStatus = "On Track" | "At Risk" | "Blocked" | "Draft";
export type FeedbackStatus = "New" | "Reviewing" | "Action Created" | "Result Updated" | "Closed";
export type TaskStatus = "Backlog" | "Todo" | "In Progress" | "In Review" | "Done";
export type Priority = "Low" | "Medium" | "High" | "Critical";
export type Impact = "Low" | "Medium" | "High" | "Critical";
export type MetricDirection = "increase" | "decrease";
export type UncertaintyLevel = "入门" | "进阶" | "破局" | "渡劫" | "飞升";
export type BountySource = "managerDefined" | "memberProposed";
export type ChallengeApplicationStatus = "pending" | "approved" | "declined";
export type EvidenceType = "Eval run" | "Log sample" | "User report" | "Dashboard snapshot" | "Incident report";
export type FeedbackSource = "User report" | "Eval run" | "Log" | "Incident" | "Team review";
export type UserRole = "admin" | "member";
export type OrfStage = "goalSetting" | "resultClaiming" | "orfReestimate" | "goalFrozen";
export type PermissionAction = "view" | "create" | "edit" | "delete";
export type PermissionResource = "objective" | "result" | "task" | "subtask";
export type CompletionBit = 0 | 1;

export interface AutomaticCompletionResult {
  goal: CompletionBit;
  rets: Record<string, CompletionBit>;
  tasks: Record<string, CompletionBit>;
  legal: boolean;
  errors: string[];
}

export interface OrfUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLoginAt?: string | null;
}

export interface PermissionRule {
  role: UserRole;
  stage: OrfStage;
  resource: PermissionResource;
  actions: PermissionAction[];
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface ChallengeApplication {
  id: string;
  applicant: string;
  status: ChallengeApplicationStatus;
  createdAt: string;
  decidedAt?: string | null;
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
  status: WorkStatus;
  confidence: number;
  progress: number;
  boundary: string;
  successDefinition: string;
  resultIds: string[];
  feedbackIds: string[];
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
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
  owner: string;
  source?: BountySource;
  definer?: string;
  finalDueAt?: string;
  assignedChallenger?: string | null;
  acceptedAt?: string | null;
  confirmationDueAt?: string | null;
  confirmedAt?: string | null;
  priorityChallengeExpiresAt?: string | null;
  priorityDeclinedBy?: string[];
  challengeApplications?: ChallengeApplication[];
  evidenceIds: string[];
  taskIds: string[];
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
  linkedResultId: string;
  feedbackOriginId?: string;
  dueDate: string;
  tags: string[];
  checklist: TaskChecklistItem[];
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

export interface CommentMessage {
  id: string;
  author: string;
  body: string;
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
  automaticCompletions: Record<string, AutomaticCompletionResult>;
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
  causeCategories: string[];
  rules: OrfRules;
}
