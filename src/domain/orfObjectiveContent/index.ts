import type { OrfUser, UserRole } from "../../types/orf";

export function canEditObjectiveContentForRole(role: UserRole | null | undefined): boolean {
  return role === "admin";
}

export function canEditObjectiveContentForUser(user: Pick<OrfUser, "role"> | null | undefined): boolean {
  return canEditObjectiveContentForRole(user?.role);
}
