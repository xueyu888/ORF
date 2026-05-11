import { clsx } from "clsx";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { permissionDefinitions, rolePermissionKeys, type PermissionKey } from "../config/permissions";
import { useOrf } from "../state/OrfProvider";
import type { PermissionRule, UserRole } from "../types/orf";

const roles: UserRole[] = ["member", "admin"];

const roleLabel: Record<UserRole, string> = {
  admin: "管理员",
  member: "成员",
};

function normalizedRoleRule(role: UserRole, permissionRules: readonly PermissionRule[]): PermissionRule {
  return {
    role,
    permissions: rolePermissionKeys(permissionRules, role),
  };
}

function setRolePermissionAllowed(permissionRules: PermissionRule[], role: UserRole, key: PermissionKey, allowed: boolean) {
  const currentRule = normalizedRoleRule(role, permissionRules);
  const nextPermissions = allowed
    ? rolePermissionKeys([{ ...currentRule, permissions: [...currentRule.permissions, key] }], role)
    : currentRule.permissions.filter((item) => item !== key);

  const nextRule: PermissionRule = {
    role,
    permissions: nextPermissions,
  };

  return [...permissionRules.filter((rule) => rule.role !== role), nextRule];
}

function permissionRuleSignature(permissionRules: readonly PermissionRule[], role: UserRole) {
  return rolePermissionKeys(permissionRules, role).join("|");
}

export function PermissionsPage() {
  const { state, updateRolePermissionRules } = useOrf();
  const [selectedRole, setSelectedRole] = useState<UserRole>("member");
  const [draftPermissionRules, setDraftPermissionRules] = useState(state.permissionRules);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const savedPermissionRules = state.permissionRules;
  const selectedRoleUserCount = state.users.filter((user) => user.role === selectedRole).length;
  const selectedRolePermissionCount = selectedRole === "admin" ? permissionDefinitions.length : rolePermissionKeys(draftPermissionRules, selectedRole).length;

  useEffect(() => {
    setDraftPermissionRules(savedPermissionRules);
  }, [savedPermissionRules]);

  const selectedRoleHasDraftChanges = useMemo(
    () => selectedRole !== "admin" && permissionRuleSignature(savedPermissionRules, selectedRole) !== permissionRuleSignature(draftPermissionRules, selectedRole),
    [draftPermissionRules, savedPermissionRules, selectedRole],
  );

  const selectedRolePermissions = useMemo(() => new Set(rolePermissionKeys(draftPermissionRules, selectedRole)), [draftPermissionRules, selectedRole]);

  const handleDraftPermissionChange = (key: PermissionKey, allowed: boolean) => {
    setDraftPermissionRules((current) => setRolePermissionAllowed(current, selectedRole, key, allowed));
  };

  const handleSaveRolePermissions = async () => {
    if (selectedRole === "admin" || !selectedRoleHasDraftChanges || isSavingPermissions) {
      return;
    }

    setIsSavingPermissions(true);
    try {
      await updateRolePermissionRules(selectedRole, [normalizedRoleRule(selectedRole, draftPermissionRules)]);
    } finally {
      setIsSavingPermissions(false);
    }
  };

  return (
    <div className="orf-user-management-page">
      <section className="orf-role-permissions-shell">
        <div className="orf-role-action-bar">
          <div className="orf-role-tabs" aria-label="选择角色">
            {roles.map((role) => (
              <button key={role} type="button" className={clsx(selectedRole === role && "orf-role-tab-active")} onClick={() => setSelectedRole(role)}>
                <span>{roleLabel[role]}</span>
                <span>{state.users.filter((user) => user.role === role).length} 人</span>
              </button>
            ))}
          </div>
          <div className="orf-user-toolbar-actions">
            <div className="orf-permission-metrics" aria-label="权限概览">
              <span>
                <strong>{selectedRolePermissionCount}</strong>权限
              </span>
            </div>
            <button
              type="button"
              className="orf-role-permission-save-button"
              disabled={selectedRole === "admin" || !selectedRoleHasDraftChanges || isSavingPermissions}
              onClick={() => void handleSaveRolePermissions()}
            >
              <Save className="h-4 w-4" />
              {isSavingPermissions ? "保存中" : "保存角色权限"}
            </button>
          </div>
        </div>

        <div className="orf-role-permission-table-wrap">
          <table className="orf-role-permission-table">
            <thead>
              <tr>
                <th>分组</th>
                <th>权限 key</th>
                <th>含义</th>
                <th>使用位置</th>
                <th>允许</th>
              </tr>
            </thead>
            <tbody>
              {permissionDefinitions.map((permission) => {
                const allowed = selectedRole === "admin" || selectedRolePermissions.has(permission.key);
                const locked = selectedRole === "admin";

                return (
                  <tr key={permission.key}>
                    <th className="orf-role-stage-cell" scope="row">
                      {permission.category}
                    </th>
                    <td className="orf-permission-key-cell">{permission.key}</td>
                    <td>{permission.label}</td>
                    <td>{permission.location}</td>
                    <td>
                      <label className={clsx("orf-permission-toggle", allowed && "orf-permission-toggle-on", locked && "orf-permission-toggle-locked")} title={locked ? "管理员默认全权限" : permission.label}>
                        <input
                          type="checkbox"
                          checked={allowed}
                          disabled={locked}
                          onChange={(event) => handleDraftPermissionChange(permission.key, event.target.checked)}
                          aria-label={`${roleLabel[selectedRole]} ${permission.label}`}
                        />
                        <span>{allowed ? "✓" : "×"}</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="orf-role-permission-footer">
          <span>
            {selectedRole === "admin"
              ? "管理员默认拥有全部权限，不需要单独配置。"
              : `修改「${roleLabel[selectedRole]}」角色权限会影响 ${selectedRoleUserCount} 名用户。`}
          </span>
        </div>
      </section>
    </div>
  );
}
