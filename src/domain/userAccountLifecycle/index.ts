import type { UserStatus } from "../../types/orf";

export type UserAccountLifecycleAction = "approve" | "reject" | "disable" | "enable";

export function userAccountLifecycleActions(status: UserStatus): UserAccountLifecycleAction[] {
  if (status === "pending") return ["approve", "reject"];
  if (status === "disabled") return ["enable"];
  return ["disable"];
}

export function canEnableUserAccount(status: UserStatus) {
  return status === "disabled";
}
