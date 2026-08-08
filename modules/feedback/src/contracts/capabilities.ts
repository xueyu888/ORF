import type { FeedbackWebUser } from "./readModel";

type FeedbackUserStatusInput = Pick<FeedbackWebUser, "status">;

export function canCreateTeamFeedback(currentUser: FeedbackUserStatusInput | null | undefined) {
  return isActiveFeedbackMember(currentUser);
}

export function canImportExportTeamFeedback(currentUser: FeedbackUserStatusInput | null | undefined) {
  return isActiveFeedbackMember(currentUser);
}

function isActiveFeedbackMember(currentUser: FeedbackUserStatusInput | null | undefined) {
  return currentUser?.status === "active";
}
