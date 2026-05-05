import { clsx } from "clsx";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOrf } from "../state/OrfProvider";
import type { OrfStage, PermissionAction, PermissionResource, PermissionRule, UserRole } from "../types/orf";

const roles: UserRole[] = ["member", "admin"];
const stages: OrfStage[] = ["goalSetting", "resultClaiming", "orfReestimate", "goalFrozen"];
const resources: PermissionResource[] = ["objective", "result", "task", "subtask"];
const actions: PermissionAction[] = ["view", "create", "edit", "delete"];

const roleLabel: Record<UserRole, string> = {
  admin: "管理员",
  member: "成员",
};

const stageLabel: Record<OrfStage, string> = {
  goalSetting: "目标设定",
  resultClaiming: "指标领取",
  orfReestimate: "ORF 重估",
  goalFrozen: "目标冻结",
};

const resourceLabel: Record<PermissionResource, string> = {
  objective: "目标",
  result: "指标",
  task: "任务",
  subtask: "子任务",
};

const actionLabel: Record<PermissionAction, string> = {
  view: "查看",
  create: "创建",
  edit: "编辑",
  delete: "删除",
};

const permissionKey = (role: UserRole, stage: OrfStage, resource: PermissionResource) => `${role}:${stage}:${resource}`;

function isPermissionAllowedFromMap(
  permissionRuleMap: Map<string, PermissionAction[]>,
  role: UserRole,
  stage: OrfStage,
  resource: PermissionResource,
  action: PermissionAction,
) {
  if (role === "admin") {
    return true;
  }

  return permissionRuleMap.get(permissionKey(role, stage, resource))?.includes(action) ?? false;
}

function setPermissionRuleAllowed(
  permissionRules: PermissionRule[],
  input: { role: UserRole; stage: OrfStage; resource: PermissionResource; action: PermissionAction; allowed: boolean },
) {
  let ruleExists = false;
  const nextRules = permissionRules.map((rule) => {
    if (rule.role !== input.role || rule.stage !== input.stage || rule.resource !== input.resource) {
      return rule;
    }

    ruleExists = true;
    const nextActions = input.allowed
      ? actions.filter((action) => action === input.action || rule.actions.includes(action))
      : rule.actions.filter((action) => action !== input.action);

    return { ...rule, actions: nextActions };
  });

  if (ruleExists || !input.allowed) {
    return nextRules;
  }

  return [
    ...permissionRules,
    {
      role: input.role,
      stage: input.stage,
      resource: input.resource,
      actions: [input.action],
    },
  ];
}

function permissionRuleSignature(permissionRules: PermissionRule[], role: UserRole) {
  const permissionRuleMap = new Map(
    permissionRules.filter((rule) => rule.role === role).map((rule) => [permissionKey(rule.role, rule.stage, rule.resource), rule.actions]),
  );

  return stages
    .flatMap((stage) =>
      resources.flatMap((resource) =>
        actions.map((action) => `${stage}:${resource}:${action}:${permissionRuleMap.get(permissionKey(role, stage, resource))?.includes(action) ? "1" : "0"}`),
      ),
    )
    .join("|");
}

export function PermissionsPage() {
  const { state, updateRolePermissionRules } = useOrf();
  const [selectedRole, setSelectedRole] = useState<UserRole>("member");
  const [draftPermissionRules, setDraftPermissionRules] = useState(state.permissionRules);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const savedPermissionRules = state.permissionRules;
  const activePermissionCount = savedPermissionRules.reduce((total, rule) => total + rule.actions.length, 0);
  const selectedRoleUserCount = state.users.filter((user) => user.role === selectedRole).length;

  useEffect(() => {
    setDraftPermissionRules(savedPermissionRules);
  }, [savedPermissionRules]);

  const draftPermissionRuleMap = useMemo(
    () => new Map(draftPermissionRules.map((rule) => [permissionKey(rule.role, rule.stage, rule.resource), rule.actions])),
    [draftPermissionRules],
  );
  const selectedRoleHasDraftChanges = useMemo(
    () => selectedRole !== "admin" && permissionRuleSignature(savedPermissionRules, selectedRole) !== permissionRuleSignature(draftPermissionRules, selectedRole),
    [draftPermissionRules, savedPermissionRules, selectedRole],
  );

  const isDraftPermissionAllowed = (role: UserRole, stage: OrfStage, resource: PermissionResource, action: PermissionAction) => {
    return isPermissionAllowedFromMap(draftPermissionRuleMap, role, stage, resource, action);
  };

  const handleDraftPermissionChange = (stage: OrfStage, resource: PermissionResource, action: PermissionAction, allowed: boolean) => {
    setDraftPermissionRules((current) =>
      setPermissionRuleAllowed(current, {
        role: selectedRole,
        stage,
        resource,
        action,
        allowed,
      }),
    );
  };

  const handleSaveRolePermissions = async () => {
    if (selectedRole === "admin" || !selectedRoleHasDraftChanges || isSavingPermissions) {
      return;
    }

    setIsSavingPermissions(true);
    try {
      await updateRolePermissionRules(
        selectedRole,
        draftPermissionRules.filter((rule) => rule.role === selectedRole),
      );
    } finally {
      setIsSavingPermissions(false);
    }
  };

  return (
    <div className="orf-user-management-page">
      <header className="orf-user-management-hero">
        <div className="orf-permission-title-block">
          <span className="orf-permission-kicker">ADMIN CONTROL</span>
          <h1>权限管理</h1>
        </div>
        <div className="orf-permission-metrics" aria-label="权限概览">
          <span>
            <strong>{activePermissionCount}</strong>权限
          </span>
        </div>
      </header>

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

        <div className="orf-role-permission-table-wrap">
          <table className="orf-role-permission-table">
            <thead>
              <tr>
                <th>阶段</th>
                <th>资源</th>
                {actions.map((action) => (
                  <th key={action}>{actionLabel[action]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stages.flatMap((stage) =>
                resources.map((resource, resourceIndex) => (
                  <tr key={`${stage}-${resource}`}>
                    {resourceIndex === 0 && (
                      <th className="orf-role-stage-cell" rowSpan={resources.length} scope="rowgroup">
                        {stageLabel[stage]}
                      </th>
                    )}
                    <th className="orf-role-resource-cell" scope="row">
                      {resourceLabel[resource]}
                    </th>
                    {actions.map((action) => {
                      const allowed = isDraftPermissionAllowed(selectedRole, stage, resource, action);
                      const locked = selectedRole === "admin";

                      return (
                        <td key={action}>
                          <label className={clsx("orf-permission-toggle", allowed && "orf-permission-toggle-on", locked && "orf-permission-toggle-locked")} title={locked ? "管理员默认全权限" : actionLabel[action]}>
                            <input
                              type="checkbox"
                              checked={allowed}
                              disabled={locked}
                              onChange={(event) => handleDraftPermissionChange(stage, resource, action, event.target.checked)}
                              aria-label={`${roleLabel[selectedRole]} ${stageLabel[stage]} ${resourceLabel[resource]} ${actionLabel[action]}`}
                            />
                            <span>{allowed ? "✓" : "×"}</span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
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
