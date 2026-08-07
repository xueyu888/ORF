import type { OrfUser } from "../../../types/orf";

export function canCreateTeamFeedback(currentUser: OrfUser | null | undefined) {
  return currentUser?.status === "active";
}
