import { hasRolePermission, permissionKeys, type PermissionKey } from "../../src/config/permissions";
import type { CurrentUserAccessData } from "../../src/domain/orfReadModel";
import type { OrfUser, PermissionRule } from "../../src/types/orf";
import { getPermissionRulesForScope } from "../repositories/permissionRepository";
import type { RuntimeScope } from "../repositories/runtimeScope";

function currentUserCapabilities(user: OrfUser, permissionRules: PermissionRule[]) {
  return Object.fromEntries(
    permissionKeys.map((key) => [key, hasRolePermission(user.role, permissionRules, key)]),
  ) as Record<PermissionKey, boolean>;
}

export async function getCurrentUserAccessData(user: OrfUser, scope: RuntimeScope): Promise<CurrentUserAccessData> {
  const permissionRules = await getPermissionRulesForScope(scope);
  const capabilities = currentUserCapabilities(user, permissionRules);

  return {
    user,
    permissionRules,
    permissions: permissionKeys.filter((key) => capabilities[key]),
    capabilities,
  };
}
