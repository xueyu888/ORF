import { clsx } from "clsx";
import { ChevronDown, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useOrf } from "../state/OrfProvider";
import type { OrfStage, OrfUser, PermissionAction, PermissionResource, UserRole } from "../types/orf";
import { avatarStyleForName } from "../utils/avatar";
import { initials } from "../utils/format";

type RoleFilter = "all" | UserRole;
type UserDialogState = {
  mode: "add" | "edit";
  userId?: string;
  name: string;
  email: string;
  role: UserRole;
} | null;

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

export function PermissionsPage() {
  const { state, createUser, updateUser, updateUserRole, deleteUser, updatePermissionRule } = useOrf();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dialog, setDialog] = useState<UserDialogState>(null);
  const currentUserId = state.currentUserId;
  const adminCount = state.users.filter((user) => user.role === "admin").length;
  const isLastAdmin = (user: OrfUser) => user.role === "admin" && adminCount <= 1;
  const editingUser = dialog?.userId ? state.users.find((user) => user.id === dialog.userId) : null;

  const users = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return state.users.filter((user) => {
      const matchesQuery = !normalizedQuery || user.name.toLowerCase().includes(normalizedQuery) || user.email.toLowerCase().includes(normalizedQuery);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [query, roleFilter, state.users]);

  const permissionRuleMap = useMemo(
    () => new Map(state.permissionRules.map((rule) => [permissionKey(rule.role, rule.stage, rule.resource), rule.actions])),
    [state.permissionRules],
  );

  const isPermissionAllowed = (role: UserRole, stage: OrfStage, resource: PermissionResource, action: PermissionAction) => {
    if (role === "admin") {
      return true;
    }

    return permissionRuleMap.get(permissionKey(role, stage, resource))?.includes(action) ?? false;
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
  };

  const handleDialogSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!dialog) {
      return;
    }

    const input = { name: dialog.name, email: dialog.email, role: dialog.role };
    if (dialog.mode === "edit" && dialog.userId) {
      updateUser(dialog.userId, input);
    } else {
      createUser(input);
    }
    setDialog(null);
  };

  return (
    <div className="orf-user-management-page">
      <header className="orf-user-management-hero">
        <h1>用户权限</h1>
      </header>

      <section className="orf-user-table-shell">
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
                <th>阶段</th>
                {resources.map((resource) => (
                  <th key={resource}>{resourceLabel[resource]}</th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) =>
                stages.map((stage, stageIndex) => (
                  <tr key={`${user.id}-${stage}`} className={clsx(stageIndex === 0 && "orf-user-row-start")}>
                    {stageIndex === 0 && (
                      <td rowSpan={stages.length}>
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
                    )}
                    {stageIndex === 0 && <td rowSpan={stages.length}>{user.email}</td>}
                    {stageIndex === 0 && (
                      <td rowSpan={stages.length}>
                        <label className={clsx("orf-user-role-select", user.role === "admin" ? "orf-user-role-admin" : "orf-user-role-member")}>
                          <select value={user.role} disabled={isLastAdmin(user)} onChange={(event) => updateUserRole(user.id, event.target.value as UserRole)} aria-label={`${user.name} 角色`}>
                            <option value="admin">管理员</option>
                            <option value="member">成员</option>
                          </select>
                          <span>{roleLabel[user.role]}</span>
                        </label>
                      </td>
                    )}
                    <td className="orf-user-stage-name">{stageLabel[stage]}</td>
                    {resources.map((resource) => (
                      <td key={resource} className="orf-resource-permission-cell">
                        <div className="orf-action-switches">
                          {actions.map((action) => {
                            const allowed = isPermissionAllowed(user.role, stage, resource, action);
                            const locked = user.role === "admin";

                            return (
                              <label key={action} className={clsx("orf-permission-toggle", allowed && "orf-permission-toggle-on", locked && "orf-permission-toggle-locked")} title={actionLabel[action]}>
                                <input
                                  type="checkbox"
                                  checked={allowed}
                                  disabled={locked}
                                  onChange={(event) =>
                                    updatePermissionRule({
                                      role: user.role,
                                      stage,
                                      resource,
                                      action,
                                      allowed: event.target.checked,
                                    })
                                  }
                                  aria-label={`${user.name} ${stageLabel[stage]} ${resourceLabel[resource]} ${actionLabel[action]}`}
                                />
                                <span>{actionLabel[action]}</span>
                              </label>
                            );
                          })}
                        </div>
                      </td>
                    ))}
                    {stageIndex === 0 && (
                      <td rowSpan={stages.length}>
                        <div className="orf-user-actions">
                          <button type="button" aria-label={`编辑 ${user.name}`} title="编辑" onClick={() => openEditDialog(user)}>
                            <Edit3 className="h-5 w-5" />
                          </button>
                          <button type="button" className="orf-user-delete-action" disabled={isLastAdmin(user)} aria-label={`删除 ${user.name}`} title={isLastAdmin(user) ? "至少保留一个管理员" : "删除"} onClick={() => handleDelete(user)}>
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )),
              )}
            </tbody>
          </table>

          {users.length === 0 && <div className="orf-user-empty">没有匹配的用户。</div>}
        </div>

        <footer className="orf-user-table-footer">
          <span>每页</span>
          <span className="orf-user-page-size">10</span>
          <span>共 {users.length} 个用户</span>
        </footer>
      </section>

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
