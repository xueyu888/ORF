import type { FeedbackActorRole, FeedbackActorStatus } from "../contracts";

export type FeedbackReadModelViewer = {
  readonly id: string;
  readonly role: FeedbackActorRole;
  readonly status: FeedbackActorStatus;
};
