import type { FeedbackWebUser } from "../types";

export function canCreateTeamFeedback(currentUser: FeedbackWebUser | null | undefined) {
  return currentUser?.status === "active";
}
