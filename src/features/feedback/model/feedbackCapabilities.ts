import type { Feedback, OrfUser } from "../../../types/orf";

export function canManageFeedbackStatus(feedback: Feedback, currentUser: OrfUser | null) {
  if (!currentUser) {
    return false;
  }

  return currentUser.role === "admin" || feedback.createdBy === currentUser.id || feedback.owner === currentUser.name;
}
