import type { Feedback, OrfUser } from "../../../types/orf";

export function canManageFeedbackLifecycle(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser || currentUser.status !== "active") {
    return false;
  }

  return currentUser.role === "admin" || feedback.createdBy === currentUser.id || feedback.assigneeUserId === currentUser.id;
}

export function canEditFeedbackMetadata(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser || currentUser.status !== "active") {
    return false;
  }
  return true;
}

export function canChangeFeedbackAssignee(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser || currentUser.status !== "active") {
    return false;
  }
  return feedback.stage !== "closed" || currentUser.role === "admin";
}

export function canCreateTeamFeedback(currentUser: OrfUser | null | undefined) {
  return currentUser?.status === "active";
}
