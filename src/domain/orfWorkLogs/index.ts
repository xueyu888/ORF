type WorkLogPermissionUser = {
  name?: string | null;
  role?: string | null;
};

export const unscopedWorkLogMemberNameList = ["邓滨虎", "何永杰"] as const;

const unscopedWorkLogMemberNames = new Set<string>(unscopedWorkLogMemberNameList);

function normalizedUserName(name: string | null | undefined) {
  return name?.trim() ?? "";
}

export function canUseWorkLogCategories(user: WorkLogPermissionUser | null | undefined) {
  return user?.role === "admin";
}

export function canSaveUnscopedWorkLog(user: WorkLogPermissionUser | null | undefined) {
  if (user?.role === "admin") return true;
  return user?.role === "member" && unscopedWorkLogMemberNames.has(normalizedUserName(user.name));
}
