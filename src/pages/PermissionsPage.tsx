import { clsx } from "clsx";
import { Ban, ChevronDown, Edit3, Eye, Plus, Search, Trash2, UserCog, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useOrf } from "../state/OrfProvider";
import type { OrfStage, OrfUser, PermissionAction, PermissionResource, PermissionRule, UserRole } from "../types/orf";
import { avatarStyleForName } from "../utils/avatar";
import { initials } from "../utils/format";

type RoleFilter = "all" | UserRole;
type PermissionView = "users" | "roles";
type UserDialogState = {
  mode: "add" | "edit";
  userId?: string;
  name: string;
  email: string;
  role: UserRole;
} | null;

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

const isPermissionAllowedFromMap = (
  permissionRuleMap: Map<string, PermissionAction[]>,
  role: UserRole,
  stage: OrfStage,
  resource: PermissionResource,
  action: PermissionAction,
) => {
  if (role === "admin") {
    return true;
  }

  return permissionRuleMap.get(permissionKey(role, stage, resource))?.includes(action) ?? false;
};

const setPermissionRuleAllowed = (
  permissionRules: PermissionRule[],
  input: { role: UserRole; stage: OrfStage; resource: PermissionResource; action: PermissionAction; allowed: boolean },
) => {
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
};

const permissionRuleSignature = (permissionRules: PermissionRule[], role: UserRole) => {
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
};

export function PermissionsPage({ initialView = "users" }: { initialView?: PermissionView }) {
  const { state, createUser, updateUser, updateUserRole, deleteUser, updateRolePermissionRules } = useOrf();
  const [view, setView] = useState<PermissionView>(initialView);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedRole, setSelectedRole] = useState<UserRole>("member");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(state.currentUserId);
  const [draftPermissionRules, setDraftPermissionRules] = useState(state.permissionRules);
  const [dialog, setDialog] = useState<UserDialogState>(null);
  const currentUserId = state.currentUserId;
  const adminCount = state.users.filter((user) => user.role === "admin").length;
  const selectedRoleUserCount = state.users.filter((user) => user.role === selectedRole).length;
  const activePermissionCount = state.permissionRules.reduce((total, rule) => total + rule.actions.length, 0);
  const selectedUser = selectedUserId ? state.users.find((user) => user.id === selectedUserId) ?? null : null;
  const editingUser = dialog?.userId ? state.users.find((user) => user.id === dialog.userId) : null;
  const isLastAdmin = (user: OrfUser) => user.role === "admin" && adminCount <= 1;

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setDraftPermissionRules(state.permissionRules);
  }, [state.permissionRules]);

  const users = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return state.users.filter((user) => {
      const matchesQuery = !normalizedQuery || user.name.toLowerCase().includes(normalizedQuery) || user.email.toLowerCase().includes(normalizedQuery);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [query, roleFilter, state.users]);

  const savedPermissionRuleMap = useMemo(
    () => new Map(state.permissionRules.map((rule) => [permissionKey(rule.role, rule.stage, rule.resource), rule.actions])),
    [state.permissionRules],
  );
  const draftPermissionRuleMap = useMemo(
    () => new Map(draftPermissionRules.map((rule) => [permissionKey(rule.role, rule.stage, rule.resource), rule.actions])),
    [draftPermissionRules],
  );
  const selectedRoleHasDraftChanges = useMemo(
    () => selectedRole !== "admin" && permissionRuleSignature(state.permissionRules, selectedRole) !== permissionRuleSignature(draftPermissionRules, selectedRole),
    [draftPermissionRules, selectedRole, state.permissionRules],
  );

  const isPermissionAllowed = (role: UserRole, stage: OrfStage, resource: PermissionResource, action: PermissionAction) => {
    return isPermissionAllowedFromMap(savedPermissionRuleMap, role, stage, resource, action);
  };

  const isDraftPermissionAllowed = (role: UserRole, stage: OrfStage, resource: PermissionResource, action: PermissionAction) => {
    return isPermissionAllowedFromMap(draftPermissionRuleMap, role, stage, resource, action);
  };

  const openAddDialog = () => setDialog({ mode: "add", name: "", email: "", role: "member" });
  const openEditDialog = (user: OrfUser) => setDialog({ mode: "edit", userId: user.id, name: user.name, email: user.email, role: user.role });

  const handleDelete = (user: OrfUser) => {
    if (isLastAdmin(user)) {
      return;
    }

    if (!window.confirm(`删除用户「${user.name}」？`)) {
      return;
    }

    deleteUser(user.id);
    if (selectedUserId === user.id) {
      setSelectedUserId(state.users.find((item) => item.id !== user.id)?.id ?? null);
    }
  };

  const handleDialogSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!dialog) {
      return;
    }

    const input = { name: dialog.name, email: dialog.email, role: dialog.role };
    if (dialog.mode === "edit" && dialog.userId) {
      updateUser(dialog.userId, input);
      setSelectedUserId(dialog.userId);
    } else {
      createUser(input);
    }
    setDialog(null);
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

  const handleSaveRolePermissions = () => {
    if (selectedRole === "admin" || !selectedRoleHasDraftChanges) {
      return;
    }

    updateRolePermissionRules(
      selectedRole,
      draftPermissionRules.filter((rule) => rule.role === selectedRole),
    );
  };

  return (
    <div className="orf-user-management-page">
      <header className="orf-user-management-hero">
        <div className="orf-permission-title-block">
          <span className="orf-permission-kicker">ADMIN CONTROL</span>
          <h1>{view === "users" ? "成员管理" : "权限管理"}</h1>
        </div>
        <div className="orf-permission-metrics" aria-label="权限概览">
          {view === "users" ? (
            <>
              <span>
                <strong>{state.users.length}</strong>用户
              </span>
              <span>
                <strong>{roles.length}</strong>角色
              </span>
            </>
          ) : (
            <span>
              <strong>{activePermissionCount}</strong>权限
            </span>
          )}
        </div>
      </header>

      {view === "users" ? (
        <section className="orf-user-management-grid">
          <div className="orf-user-table-shell">
            <div className="orf-user-toolbar">
              <label className="orf-user-search">
                <Search className="h-5 w-5" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或邮箱" />
              </label>

              <div className="orf-user-toolbar-filters">
                <label className="orf-user-select">
                  <span>角色</span>
                  <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
                    <option value="all">全部角色</option>
                    <option value="admin">管理员</option>
                    <option value="member">成员</option>
                  </select>
                  <ChevronDown className="h-4 w-4" />
                </label>
              </div>

              <button type="button" className="orf-user-add-button" onClick={openAddDialog}>
                <Plus className="h-5 w-5" />
                新增用户
              </button>
            </div>

            <div className="orf-user-table-wrap">
              <table className="orf-user-table">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>邮箱</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>最近登录</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={clsx(selectedUserId === user.id && "orf-user-row-selected")}>
                      <td>
                        <div className="orf-user-name-cell">
                          <span className="orf-user-row-avatar" style={avatarStyleForName(user.name)}>
                            {initials(user.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="orf-user-name">{user.name}</span>
                            {user.id === currentUserId && <span className="orf-user-current">当前</span>}
                          </span>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <label className={clsx("orf-user-role-select", user.role === "admin" ? "orf-user-role-admin" : "orf-user-role-member")}>
                          <select value={user.role} disabled={isLastAdmin(user)} onChange={(event) => updateUserRole(user.id, event.target.value as UserRole)} aria-label={`${user.name} 角色`}>
                            <option value="admin">管理员</option>
                            <option value="member">成员</option>
                          </select>
                          <span>{roleLabel[user.role]}</span>
                        </label>
                      </td>
                      <td>
                        <span className="orf-user-status">启用</span>
                      </td>
                      <td>--</td>
                      <td>
                        <div className="orf-user-actions orf-user-actions-text">
                          <button type="button" onClick={() => setSelectedUserId(user.id)}>
                            <Eye className="h-4 w-4" />
                            查看详情
                          </button>
                          <button type="button" onClick={() => openEditDialog(user)}>
                            <UserCog className="h-4 w-4" />
                            编辑角色
                          </button>
                          <button type="button" disabled>
                            <Ban className="h-4 w-4" />
                            禁用用户
                          </button>
                          <button type="button" className="orf-user-delete-action" disabled={isLastAdmin(user)} title={isLastAdmin(user) ? "至少保留一个管理员" : "删除"} onClick={() => handleDelete(user)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {users.length === 0 && <div className="orf-user-empty">没有匹配的用户。</div>}
            </div>

            <footer className="orf-user-table-footer">
              <span>共 {users.length} 个用户</span>
            </footer>
          </div>

          <UserDrawer user={selectedUser} isPermissionAllowed={isPermissionAllowed} onEdit={openEditDialog} />
        </section>
      ) : (
        <section className="orf-role-permissions-shell">
          <div className="orf-role-tabs" aria-label="选择角色">
            {roles.map((role) => (
              <button key={role} type="button" className={clsx(selectedRole === role && "orf-role-tab-active")} onClick={() => setSelectedRole(role)}>
                <span>{roleLabel[role]}</span>
                <span>{state.users.filter((user) => user.role === role).length} 人</span>
              </button>
            ))}
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
            <button type="button" className="orf-role-permission-save-button" disabled={selectedRole === "admin" || !selectedRoleHasDraftChanges} onClick={handleSaveRolePermissions}>
              保存角色权限
            </button>
          </div>
        </section>
      )}

      {dialog && (
        <div className="orf-user-dialog-backdrop" role="presentation" onMouseDown={() => setDialog(null)}>
          <form className="orf-user-dialog" onSubmit={handleDialogSubmit} onMouseDown={(event) => event.stopPropagation()}>
            <div className="orf-user-dialog-header">
              <h2>{dialog.mode === "edit" ? "编辑用户" : "新增用户"}</h2>
              <button type="button" aria-label="关闭" onClick={() => setDialog(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <label>
              <span>姓名</span>
              <input value={dialog.name} onChange={(event) => setDialog({ ...dialog, name: event.target.value })} autoFocus required />
            </label>
            <label>
              <span>邮箱</span>
              <input type="email" value={dialog.email} onChange={(event) => setDialog({ ...dialog, email: event.target.value })} required />
            </label>
            <label>
              <span>角色</span>
              <select value={dialog.role} disabled={editingUser ? isLastAdmin(editingUser) : false} onChange={(event) => setDialog({ ...dialog, role: event.target.value as UserRole })}>
                <option value="admin">管理员</option>
                <option value="member">成员</option>
              </select>
            </label>
            <div className="orf-user-dialog-actions">
              <button type="button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button type="submit">{dialog.mode === "edit" ? "保存" : "新增用户"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function UserDrawer({
  user,
  isPermissionAllowed,
  onEdit,
}: {
  user: OrfUser | null;
  isPermissionAllowed: (role: UserRole, stage: OrfStage, resource: PermissionResource, action: PermissionAction) => boolean;
  onEdit: (user: OrfUser) => void;
}) {
  if (!user) {
    return <aside className="orf-user-drawer orf-user-drawer-empty">选择一个用户查看有效权限。</aside>;
  }

  return (
    <aside className="orf-user-drawer">
      <div className="orf-user-drawer-header">
        <div className="orf-user-name-cell">
          <span className="orf-user-row-avatar" style={avatarStyleForName(user.name)}>
            {initials(user.name)}
          </span>
          <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
          </div>
        </div>
        <button type="button" onClick={() => onEdit(user)}>
          <Edit3 className="h-4 w-4" />
          编辑角色
        </button>
      </div>

      <div className="orf-user-drawer-section">
        <h3>已绑定角色</h3>
        <span className={clsx("orf-user-role-select", user.role === "admin" ? "orf-user-role-admin" : "orf-user-role-member")}>
          <span>{roleLabel[user.role]}</span>
        </span>
      </div>

      <div className="orf-user-drawer-section">
        <h3>权限来源</h3>
        <p>{roleLabel[user.role]}角色权限</p>
      </div>

      <div className="orf-user-drawer-section">
        <h3>有效权限预览</h3>
        <div className="orf-effective-permission-list">
          {stages.map((stage) => (
            <div key={stage} className="orf-effective-stage">
              <strong>{stageLabel[stage]}</strong>
              {resources.map((resource) => {
                const allowedActions = actions.filter((action) => isPermissionAllowed(user.role, stage, resource, action));
                return (
                  <div key={resource}>
                    <span>{resourceLabel[resource]}</span>
                    <em>{allowedActions.length > 0 ? allowedActions.map((action) => actionLabel[action]).join("、") : "无"}</em>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
