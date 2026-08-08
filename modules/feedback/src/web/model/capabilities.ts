import type { FeedbackWebUser } from "../types";

export function canCreateTeamFeedback(currentUser: FeedbackWebUser | null | undefined) {
  return isActiveFeedbackMember(currentUser);
}

export function canImportExportTeamFeedback(currentUser: FeedbackWebUser | null | undefined) {
  return isActiveFeedbackMember(currentUser);
}

function isActiveFeedbackMember(currentUser: FeedbackWebUser | null | undefined) {
  return currentUser?.status === "active";
}
