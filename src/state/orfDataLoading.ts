import type { UserRole } from "../types/orf";

const taskManagementReadModelRoutePrefixes = [
  "/dashboard",
  "/tasks",
  "/feedback",
  "/strategy-map",
  "/ai-evaluation",
  "/reports",
  "/system",
] as const;

export function taskManagementPathForRole(role: UserRole | null | undefined) {
  return role === "admin" ? "/api/tasks-page" : "/api/my-challenges?scope=mine";
}

export function shouldFetchAdminCollections(role: UserRole | null | undefined) {
  return role === "admin";
}

export function shouldLoadTaskManagementReadModel(pathname: string) {
  return taskManagementReadModelRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function shouldLoadInitialTaskManagementReadModel(pathname: string) {
  return shouldLoadTaskManagementReadModel(pathname);
}
