import type {
  FeedbackActivityType,
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackResolution,
  FeedbackStage,
} from "@orf/feedback-module/contracts";
import type { PermissionKey } from "../config/permissions";

export type WorkStatus = "On Track" | "At Risk" | "Blocked" | "Draft";
export type TaskStatus = "Backlog" | "Todo" | "In Progress" | "In Review" | "Done";
export type Priority = "Low" | "Medium" | "High" | "Critical";
export type Impact = "Low" | "Medium" | "High" | "Critical";
export type MetricDirection = "increase" | "decrease";
export type UncertaintyLevel = "简易" | "入门" | "进阶" | "破局" | "渡劫" | "飞升";
export type BountySource = "managerDefined" | "memberProposed";
export type ChallengeApplicationStatus = "pending" | "approved" | "declined";
export type NotificationKind =
  | "objective.published"
  | "challenge.application.created"
  | "challenge.application.approved"
  | "challenge.application.rejected"
  | "objective.recruitment.created"
  | "objective.reinforcement.added"
  | "objective.challenge.accepted"
  | "objective.alignment.requested"
  | "objective.alignment.reviewed"
  | "objective.loot.submitted"
  | "objective.revision.required"
  | "objective.peerReview.requested"
  | "objective.settlement.updated"
  | "objective.settled"
  | "feedback.created"
  | "feedback.commented"
  | "feedback.status.changed"
  | "feedback.assigned"
  | "feedback.assignee.daily_digest"
  | "comment.reply.created"
  | "comment.thread.status.changed"
  | "comment.mention.created"
  | "data.sync.conflict"
  | "worklog.submitted"
  | "worklog.reminder";
export type NotificationTargetType = "objective" | "objectiveLoot" | "comment" | "feedback" | "workLog" | "dataSync";
export type NotificationStream = "personalNotification" | "teamAnnouncement";
export type FeedbackSubscriptionMode = "none" | "participating" | "subscribed" | "muted";
export type ChatSystemKind = NotificationStream;
export type ChatMessageSource = "user" | "system";
export type WorkLogReminderStatus = "active" | "resolved";
export type ObjectiveAcceptedResult = "completed" | "falsified" | "overturned" | "abandoned" | "overdelivered";
export type ResultAcceptedResult = "unreviewed" | "completed" | "falsified" | "failed";
export type ObjectiveSettlementEventKind = "deadlinePenalty" | "finalCompletion";
export type EvidenceType = "Eval run" | "Log sample" | "User report" | "Dashboard snapshot" | "Incident report";
export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "active" | "rejected" | "disabled";
export type OrfStage = "goalSetting" | "resultClaiming" | "orfReestimate" | "goalFrozen";
export type ObjectiveFlowStatus = "candidate" | "open" | "applying" | "recruiting" | "reestimating" | "frozen" | "submitted" | "revisionRequired" | "accepted" | "settled" | "closed";
export type LootResultClaimStatus = "completed" | "falsified" | "notClaimed";
export type ObjectiveTrialReviewStatus = "requested" | "approved" | "needsWork";
export type ObjectiveAlignmentRequestKind = "reestimateCompletion" | "acceptance" | "frozenReestimate";
export type ObjectiveAlignmentRequestStatus = "requested" | "scheduled" | "completed" | "needsWork" | "cancelled";
export type ChatChannelType = "public" | "private" | "direct";
export type ChatMemberRole = "owner" | "admin" | "member";
export type ChatPresenceState = "active" | "idle" | "recent" | "offline";
export type ClientPresenceSource = "android" | "browser" | "desktop" | "unknown";
export type ClientSystemIdleState = "active" | "idle" | "locked" | "unknown";
export type DriveNodeType = "folder" | "file";
export type DrivePreviewKind = "download" | "docx" | "image" | "markdown" | "pdf" | "text";
export type DrivePreviewStatus = "failed" | "ready" | "unavailable";
export type DriveNodeEventAction =
  | "folder_created"
  | "file_uploaded"
  | "file_version_uploaded"
  | "file_version_restored"
  | "node_deleted"
  | "node_restored"
  | "context_linked"
  | "context_unlinked"
  | "chat_linked"
  | "chat_unlinked";
export type DriveContextType =
  | "project"
  | "objective"
  | "result"
  | "task"
  | "feedback"
  | "workLog"
  | "chatChannel"
  | "chatMessage"
  | "chatThread";
export type DriveSearchScope = "active" | "trash";
export type DriveSearchContextFilter = "all" | DriveContextType;
export type DriveSearchSource = "all" | "manual" | "chat" | "project" | "objective" | "result" | "task" | "feedback" | "workLog";
export type DriveSearchStatus = "active" | "all" | "trash";
export type DriveSearchUpdatedRange = "all" | "7d" | "30d";
export type DriveSearchType = "all" | "file" | "folder";

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

export interface OrfUserDisplayProfile {
  id: string;
  name: string;
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
  applicantUserId: string;
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
  actorAvatarUrl?: string | null;
  title: string;
  body: string;
  stream: NotificationStream;
  targetType: NotificationTargetType;
  targetId: string;
  targetHref: string;
  replyTargetType?: CommentTargetType | null;
  replyTargetId?: string | null;
  readAt?: string | null;
  createdAt: string;
  metadata: Record<string, string>;
}

export interface WorkLogReminderState {
  id: string;
  status: WorkLogReminderStatus;
  windowStartDate: string;
  windowEndDate: string;
  requiredDates: string[];
  missingDates: string[];
  lastRemindedAt?: string | null;
  nextRemindAt?: string | null;
  snoozeCount: number;
  resolvedAt?: string | null;
  updatedAt: string;
  shouldRemindNow: boolean;
}

export interface ChatMessageSystemMetadata {
  actorName?: string;
  actorUserId?: string | null;
  kind?: NotificationKind;
  metadata?: Record<string, string>;
  notificationEventId?: string;
  recipientUserId?: string | null;
  replyTargetId?: string | null;
  replyTargetType?: CommentTargetType | null;
  stream?: NotificationStream;
  targetHref?: string;
  targetId?: string;
  targetTitle?: string;
  targetType?: NotificationTargetType;
  title?: string;
}

export const SYSTEM_CONVERSATION_IDS = ["teamAnnouncements", "personalNotifications"] as const;
export type SystemConversationId = (typeof SYSTEM_CONVERSATION_IDS)[number];

export type SystemConversationDefinition = {
  description: string;
  id: SystemConversationId;
  stream: NotificationStream;
  title: string;
};

export const SYSTEM_CONVERSATION_DEFINITIONS: Record<SystemConversationId, SystemConversationDefinition> = {
  teamAnnouncements: {
    description: "全体可见的系统公告和公共事件",
    id: "teamAnnouncements",
    stream: "teamAnnouncement",
    title: "系统公告",
  },
  personalNotifications: {
    description: "只投递给你的系统通知和业务提醒",
    id: "personalNotifications",
    stream: "personalNotification",
    title: "我的系统通知",
  },
};

export function isSystemConversationId(value: string | undefined): value is SystemConversationId {
  return typeof value === "string" && (SYSTEM_CONVERSATION_IDS as readonly string[]).includes(value);
}

export interface SystemConversationSummary {
  id: SystemConversationId;
  stream: NotificationStream;
  title: string;
  description: string;
  unreadCount: number;
  latestMessageAt?: string | null;
  latestMessagePreview?: string | null;
}

export interface SystemConversationMessage extends AppNotification {
  canReply: boolean;
}

export interface ActivityItem {
  id: string;
  actorUserId?: string | null;
  activityType: FeedbackActivityType;
  payload: Record<string, unknown>;
  sequence: number;
  at: string;
}

export interface FeedbackRelation {
  id: string;
  type: FeedbackRelationType;
  sourceFeedbackId: string;
  targetFeedbackId: string;
  createdBy?: string | null;
  createdAt: string;
}

export interface OrfProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Drive {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentUrl: string;
  downloadUrl: string;
  previewKind: DrivePreviewKind;
  previewStatus?: DrivePreviewStatus;
  previewError?: string | null;
  previewUrl?: string;
  previewGeneratedAt?: string | null;
  width?: number | null;
  height?: number | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  latestVersionNumber?: number;
  versionCount?: number;
}

export interface DriveNode {
  id: string;
  parentId?: string | null;
  type: DriveNodeType;
  name: string;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  updatedAt: string;
  file?: Drive;
  searchMeta?: DriveSearchMeta;
}

export interface DriveSearchContextSummary {
  contextId: string;
  contextTitle: string;
  contextType: DriveContextType;
  label?: string | null;
}

export interface DriveSearchMeta {
  contexts: DriveSearchContextSummary[];
  snippet?: string | null;
  sourceLabels: string[];
  status: "active" | "trash";
  uploadedById?: string | null;
  uploadedByName?: string | null;
  updatedAt: string;
}

export interface DriveFileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  previewKind: DrivePreviewKind;
  previewStatus?: DrivePreviewStatus;
  previewError?: string | null;
  previewGeneratedAt?: string | null;
  width?: number | null;
  height?: number | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface DriveNodeEvent {
  id: string;
  nodeId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  action: DriveNodeEventAction;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DriveContextLink {
  id: string;
  nodeId: string;
  contextType: DriveContextType;
  contextId: string;
  contextTitle: string;
  label?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface DriveNodeDetails {
  activity: DriveNodeEvent[];
  contextLinks: DriveContextLink[];
  node: DriveNode;
  path: DriveNode[];
  versions: DriveFileVersion[];
}

export interface ChatDriveLink {
  id: string;
  channelId: string;
  node: DriveNode;
  label?: string | null;
  isDefaultUploadTarget: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriveBootstrap {
  children: DriveNode[];
  recentNodes?: DriveNode[];
  root: DriveNode;
  trashCount?: number;
  uploadMaxBytes: number;
}

export interface ObjectiveParticipantProfile {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

export interface TaskDefinitionContributorProfile {
  userId?: string | null;
  name: string;
  avatarUrl?: string | null;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  projectId?: string | null;
  cycle: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  confidence: number;
  progress: number;
  boundary: string;
  successDefinition: string;
  resultIds: string[];
  taskIds: string[];
  finalDueAt: string;
  challengers: string[];
  challengerUserIds: string[];
  challengerProfiles?: ObjectiveParticipantProfile[];
  assignedChallengers: string[];
  assignedChallengerUserIds: string[];
  assignedChallengerProfiles?: ObjectiveParticipantProfile[];
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
  submittedByUserId: string;
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
  requestedByUserId: string;
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportBody?: string | null;
  status: ObjectiveTrialReviewStatus;
  commanderFeedback?: string | null;
  reviewedBy?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  requestedAt: string;
}

export interface ObjectiveAcceptanceReview {
  id: string;
  objectiveId: string;
  lootId: string;
  reviewerUserId: string;
  acceptedResult: ObjectiveAcceptedResult;
  resultReviews: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  reason?: string | null;
  reviewedAt: string;
}

export interface ObjectiveAlignmentRequest {
  id: string;
  objectiveId: string;
  kind: ObjectiveAlignmentRequestKind;
  requestedBy: string;
  requestedByUserId: string;
  status: ObjectiveAlignmentRequestStatus;
  proposedAt: string;
  scheduledAt?: string | null;
  meetingRoom?: string | null;
  note?: string | null;
  confirmationDueAt?: string | null;
  commanderFeedback?: string | null;
  reviewedBy?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
}

export interface PointLedgerEntry {
  id: string;
  objectiveId: string;
  settlementEventId?: string | null;
  userId: string;
  memberName: string;
  points: number;
  reason: string;
  settlementPeriodAt: string;
  createdAt: string;
}

export interface ObjectiveSettlementEvent {
  id: string;
  objectiveId: string;
  kind: ObjectiveSettlementEventKind;
  lootId?: string | null;
  basePoints: number;
  multiplier: number;
  settlementPoints: number;
  reason: string;
  createdByUserId: string;
  createdAt: string;
}

export interface WorkLogEntry {
  id: string;
  authorUserId: string;
  authorNameSnapshot: string;
  workDate: string;
  objectiveId?: string | null;
  objectiveIdSnapshot?: string | null;
  objectiveTitleSnapshot?: string | null;
  categoryId?: string | null;
  categoryIdSnapshot?: string | null;
  categoryNameSnapshot?: string | null;
  bodyMarkdown: string;
  remainingEstimatePercent?: number | null;
  durationMinutes?: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkLogActivityItem extends WorkLogEntry {
  authorAvatarUrl?: string | null;
  authorCurrentName?: string | null;
}

export interface WorkLogObjectiveOption {
  id: string;
  title: string;
  flowStatus: ObjectiveFlowStatus;
  finalDueAt: string;
  isUserChallenger: boolean;
  latestRemainingEstimatePercent?: number | null;
}

export interface WorkLogCategoryOption {
  id: string;
  name: string;
  createdAt?: string;
  source: "builtIn" | "managed";
  updatedAt?: string;
}

export type WorkLogClassificationKind = "category" | "objective" | "uncategorized";
export type WorkLogClassificationSuggestionKind = WorkLogClassificationKind | "newCategory";
export type WorkLogClassificationDecisionOperation = "create" | "update";
export type WorkLogObjectiveSelectionAvailability = "default" | "searchOnly";

export interface WorkLogClassificationSuggestion {
  kind: WorkLogClassificationSuggestionKind;
  objectiveId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  confidence: number;
  reason?: string | null;
}

export type WorkLogReportScope = "mine" | "team";

export interface WorkLogReportClassificationSummary {
  kind: WorkLogClassificationKind;
  objectiveId?: string | null;
  categoryId?: string | null;
  title: string;
  entryCount: number;
  latestRemainingEstimatePercent?: number | null;
  totalDurationMinutes?: number;
}

export interface WorkLogReportEntrySummary {
  id: string;
  classificationKind: WorkLogClassificationKind;
  objectiveId?: string | null;
  categoryId?: string | null;
  classificationTitle: string;
  bodyMarkdown: string;
  remainingEstimatePercent?: number | null;
  durationMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkLogReportDayCell {
  userId: string;
  date: string;
  entryCount: number;
  classificationCount: number;
  latestEntryAt?: string | null;
  latestRemainingEstimatePercent?: number | null;
  totalDurationMinutes: number;
  entries: WorkLogReportEntrySummary[];
  classifications: WorkLogReportClassificationSummary[];
}

export interface WorkLogReportUserRow {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
  totalEntries: number;
  activeDays: number;
  coveredClassificationCount: number;
  averageRemainingEstimatePercent?: number | null;
  totalDurationMinutes: number;
}

export interface WorkLogReportTotals {
  totalEntries: number;
  activeDays: number;
  usersWithEntries: number;
  coveredClassificationCount: number;
  averageRemainingEstimatePercent?: number | null;
  totalDurationMinutes: number;
}

export interface WorkLogReport {
  scope: WorkLogReportScope;
  from: string;
  to: string;
  users: WorkLogReportUserRow[];
  cells: WorkLogReportDayCell[];
  totals: WorkLogReportTotals;
}

export interface ContributionAllocation {
  basisPoints?: number;
  member: string;
  memberUserId: string;
  ratio: number;
}

export interface ContributionReviewPercentAllocation {
  member: string;
  memberUserId: string;
  percent: number;
}

export interface ContributionReviewMetricRow {
  allocations: ContributionReviewPercentAllocation[];
  isFallbackObjectiveRow?: boolean;
  metricDetail?: string;
  metricId: string;
  metricTitle: string;
  points?: number;
}

export interface ContributionReviewDraftPercentAllocation {
  input: string;
  member: string;
  memberUserId: string;
}

export interface ContributionReviewDraftMetricRow {
  allocations: ContributionReviewDraftPercentAllocation[];
  isFallbackObjectiveRow?: boolean;
  metricDetail?: string;
  metricId: string;
  metricTitle: string;
  points?: number;
}

export interface ContributionReviewMetricScore {
  allocations: ContributionAllocation[];
  isFallbackObjectiveRow?: boolean;
  metricDetail?: string;
  metricId: string;
  metricTitle: string;
  points?: number;
  weightRatio: number;
}

export interface Result {
  id: string;
  objectiveId: string;
  title: string;
  detail: string;
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
  definerUserId: string;
  uncertaintyScore: number;
  executionCompleted: boolean;
  acceptedResult: ResultAcceptedResult;
  evidenceIds: string[];
  trend: TrendPoint[];
  reviewCadence: string;
  createdAt: string;
  updatedAt: string;
}

export interface Feedback {
  id: string;
  projectId?: string | null;
  title: string;
  description: string;
  reportAttachments: CommentAttachment[];
  causeCategories: string[];
  impact: FeedbackImpact;
  priority: FeedbackPriority | null;
  stage: FeedbackStage;
  resolution: FeedbackResolution | null;
  assigneeUserId?: string | null;
  createdBy: string;
  updatedBy?: string | null;
  version: number;
  closedAt?: string | null;
  closedByUserId?: string | null;
  lastActivityByUserId?: string | null;
  lastActivitySequence: number;
  lastSeenSequence: number;
  requiresAction: boolean;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  activity: ActivityItem[];
  relations: FeedbackRelation[];
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
  assigneeUserId: string;
  linkedObjectiveId: string;
  dueDate: string;
  tags: string[];
  checklist: TaskChecklistItem[];
  createdBy?: string | null;
  createdByName?: string | null;
  createdByAvatarUrl?: string | null;
  updatedBy?: string | null;
  definitionContributorUserIds?: string[];
  definitionContributorProfiles?: TaskDefinitionContributorProfile[];
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
  ownerUserId: string;
  linkedResultId: string;
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

export type CommentTargetType = "objective" | "result" | "task" | "subtask" | "feedback";
export type CommentStatus = "open" | "resolved";
export type CommentAttachmentPreviewKind = "download" | "image" | "markdown" | "pdf" | "text";

export interface CommentAttachment {
  contentUrl: string;
  downloadUrl: string;
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  previewKind: CommentAttachmentPreviewKind;
  previewUrl?: string;
  width?: number;
  height?: number;
}

export interface CommentAttachmentUploadResult {
  attachment: CommentAttachment;
  markdown: string;
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

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string | null;
  lastOnlineAt?: string | null;
  presence: {
    active: boolean;
    connected: boolean;
    lastActiveAt?: string | null;
    online: boolean;
    source?: ClientPresenceSource;
    state: ChatPresenceState;
  };
}

export interface UserPresenceActivityInput {
  clientId?: string;
  documentFocused?: boolean;
  documentVisible?: boolean;
  lastInteractionAt?: string | null;
  occurredAt?: string;
  source?: ClientPresenceSource;
  systemIdleSeconds?: number | null;
  systemIdleState?: ClientSystemIdleState;
  windowFocused?: boolean;
  windowMinimized?: boolean;
  windowVisible?: boolean;
}

export interface ChatChannelMember {
  userId: string;
  role: ChatMemberRole;
  favorite: boolean;
  muted: boolean;
  manuallyUnread: boolean;
  joinedAt: string;
  lastViewedAt?: string | null;
  lastReadAt?: string | null;
  lastReadMessageId?: string | null;
}

export interface ChatChannel {
  id: string;
  type: ChatChannelType;
  name?: string | null;
  systemKind?: ChatSystemKind | null;
  systemRecipientUserId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  displayName: string;
  purpose: string;
  header: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  memberCount: number;
  members: ChatChannelMember[];
  unreadCount: number;
  mainMentionCount: number;
  mentionCount: number;
  threadMentionCount: number;
  threadReadAt?: string | null;
  threadUnreadCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
}

export type ProjectChatChannel = Pick<
  ChatChannel,
  "displayName" | "id" | "memberCount" | "projectId" | "projectName" | "type" | "updatedAt"
>;

export interface ChatReaction {
  emojiName: string;
  count: number;
  reactedByCurrentUser: boolean;
  userIds: string[];
}

export interface ChatMessageAcknowledgement {
  acknowledgedUserIds: string[];
  currentUserAcknowledged: boolean;
  currentUserPending: boolean;
  pendingUserIds: string[];
  recipientUserIds: string[];
  requestedAt: string;
  requestedByUserId: string;
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentUrl: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorUserId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  source: ChatMessageSource;
  system?: ChatMessageSystemMetadata | null;
  body: string;
  rootMessageId?: string | null;
  parentMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  replyCount: number;
  lastReplyAt?: string | null;
  savedByCurrentUser: boolean;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  acknowledgement?: ChatMessageAcknowledgement | null;
}

export interface ChatThread {
  rootMessage: ChatMessage;
  replies: ChatMessage[];
  following: boolean;
}

export interface ChatThreadSummary {
  channel: ChatChannel;
  following: boolean;
  lastViewedAt?: string | null;
  rootMessage: ChatMessage;
  unreadCount: number;
}

export interface ChatSearchResult {
  channel: ChatChannel;
  message: ChatMessage;
}

export interface ChatMessageContext {
  hasNewerMessages: boolean;
  hasOlderMessages: boolean;
  messages: ChatMessage[];
  targetMessageId: string;
}

export type ChatUnreadTarget =
  | {
      kind: "main";
      context: ChatMessageContext;
    }
  | {
      kind: "threadMention";
      rootMessageId: string;
      targetMessageId: string;
    };

export interface ChatBootstrap {
  channels: ChatChannel[];
  settings: {
    attachmentMaxBytes: number;
    infrastructureMaxBytes: number;
  };
  users: ChatUser[];
  permissions: {
    canCreatePrivateChannel: boolean;
    canCreatePublicChannel: boolean;
    canManageAnyChannel: boolean;
    canManageAnyMembers: boolean;
    canRead: boolean;
    canWrite: boolean;
  };
}

export interface ChatUnreadSummary {
  actionableMessageUnreadCount: number;
  ackRequiredCount: number;
  directMessageUnreadCount: number;
  mainMentionCount: number;
  mentionCount: number;
  messageUnreadCount: number;
  nextTarget: ChatUnreadSummaryNextTarget | null;
  threadMentionCount: number;
  threadUnreadCount: number;
  totalUnreadCount: number;
  unreadChannelCount: number;
}

export type ChatUnreadTargetReason = "ack_required" | "direct" | "mention_me" | "mention_all" | "system" | "normal";

export interface ChatUnreadSummaryNextTarget {
  channelId: string;
  messageId: string;
  reason: ChatUnreadTargetReason;
  surface: "main" | "threadMention";
  targetPath: string;
  threadRootMessageId?: string | null;
}

export interface OrfState {
  users: OrfUser[];
  userProfiles: OrfUserDisplayProfile[];
  currentUserId: string;
  permissionRules: PermissionRule[];
  projects: OrfProject[];
  objectives: Objective[];
  results: Result[];
  tasks: Task[];
  evidence: Evidence[];
  decisions: Decision[];
  evalRuns: EvalRun[];
  scenarios: Scenario[];
  failureSamples: FailureSample[];
  comments: CommentThread[];
  objectiveLoot: ObjectiveLoot[];
  objectiveTrialReviews: ObjectiveTrialReview[];
  objectiveAcceptanceReviews: ObjectiveAcceptanceReview[];
  objectiveAlignmentRequests: ObjectiveAlignmentRequest[];
  objectiveSettlementEvents: ObjectiveSettlementEvent[];
  pointLedger: PointLedgerEntry[];
  rules: OrfRules;
}
