import type { UserRole } from "../types/orf";

export function taskManagementPathForRole(role: UserRole | null | undefined) {
  return role === "admin" ? "/api/tasks-page" : "/api/my-challenges?scope=mine";
}

export function shouldFetchAdminCollections(role: UserRole | null | undefined) {
  return role === "admin";
}
