import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FeedbackResolution, FeedbackStage } from "../contracts";
import type { FeedbackNotificationDispatchDraft } from "./notificationDispatch";

export type FeedbackWriteClient = Pick<NodePgDatabase<any>, "delete" | "insert" | "select" | "update">;

export type FeedbackTransitionNotificationDispatchContext = {
  readonly assigneeUserId?: string | null;
  readonly createdBy?: string | null;
  readonly feedbackId: string;
  readonly projectId?: string | null;
  readonly resolution?: FeedbackResolution | null;
  readonly stage: FeedbackStage;
  readonly teamId: string;
  readonly title: string;
};

export type FeedbackTransitionNotificationDispatchFactory = (
  context: FeedbackTransitionNotificationDispatchContext,
) => FeedbackNotificationDispatchDraft | null;

export type FeedbackTargetTitleSync = (
  database: FeedbackWriteClient,
  input: {
    readonly feedbackId: string;
    readonly teamId: string;
    readonly title: string;
    readonly updatedAt: string;
  },
) => Promise<void>;
