import { clsx } from "clsx";
import { ChevronDown, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useOrf } from "../state/OrfProvider";
import type { OrfUser, UserRole } from "../types/orf";
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

const roles: UserRole[] = ["member", "admin"];

const roleLabel: Record<UserRole, string> = {
  admin: "管理员",
  member: "成员",
};

function formatLastLoginAt(value: string | null | undefined) {
  if (!value) {
    return "未登录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16).replace("T", " ");
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function MembersPage() {
  const { state, currentUser, createUser, updateUser, deleteUser } = useOrf();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dialog, setDialog] = useState<UserDialogState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const currentUserId = currentUser?.id ?? state.currentUserId;
  const adminCount = state.users.filter((user) => user.role === "admin").length;
  const editingUser = dialog?.userId ? state.users.find((user) => user.id === dialog.userId) : null;
  const isLastAdmin = (user: OrfUser) => user.role === "admin" && adminCount <= 1;

  const users = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return state.users.filter((user) => {
      const matchesQuery = !normalizedQuery || user.name.toLowerCase().includes(normalizedQuery) || user.email.toLowerCase().includes(normalizedQuery);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [query, roleFilter, state.users]);

  const openAddDialog = () => setDialog({ mode: "add", name: "", email: "", role: "member" });
  const openEditDialog = (user: OrfUser) => setDialog({ mode: "edit", userId: user.id, name: user.name, email: user.email, role: user.role });

  const handleDialogSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dialog || submitting) {
      return;
    }

    setSubmitting(true);
    const input = { name: dialog.name, email: dialog.email, role: dialog.role };
    const ok = dialog.mode === "edit" && dialog.userId ? await updateUser(dialog.userId, input) : await createUser(input);
    setSubmitting(false);

    if (ok) {
      setDialog(null);
    }
  };

  const handleDelete = async (user: OrfUser) => {
    if (isLastAdmin(user) || deletingUserId) {
      return;
    }

    if (!window.confirm(`删除用户「${user.name}」？`)) {
      return;
    }

    setDeletingUserId(user.id);
    await deleteUser(user.id);
    setDeletingUserId(null);
  };

  return (
    <div className="orf-user-management-page">
      <header className="orf-user-management-hero">
        <div className="orf-permission-title-block">
          <span className="orf-permission-kicker">ADMIN CONTROL</span>
          <h1>成员管理</h1>
        </div>
        <div className="orf-permission-metrics" aria-label="成员概览">
          <span>
            <strong>{state.users.length}</strong>用户
          </span>
          <span>
            <strong>{roles.length}</strong>角色
          </span>
        </div>
      </header>

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
                  <tr key={user.id}>
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
                      <span className={clsx("orf-user-role-select", user.role === "admin" ? "orf-user-role-admin" : "orf-user-role-member")}>
                        <span>{roleLabel[user.role]}</span>
                      </span>
                    </td>
                    <td>
                      <span className="orf-user-status">启用</span>
                    </td>
                    <td>
                      <span className="orf-user-last-login">{formatLastLoginAt(user.lastLoginAt)}</span>
                    </td>
                    <td>
                      <div className="orf-user-actions orf-user-actions-text">
                        <button type="button" onClick={() => openEditDialog(user)}>
                          <Edit3 className="h-4 w-4" />
                          编辑
                        </button>
                        <button
                          type="button"
                          className="orf-user-delete-action"
                          disabled={isLastAdmin(user) || deletingUserId === user.id}
                          title={isLastAdmin(user) ? "至少保留一个管理员" : "删除"}
                          onClick={() => void handleDelete(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {users.length === 0 && <div className="orf-user-empty">没有匹配的用户。</div>}
          </div>
        </div>
      </section>

      {dialog && (
        <div className="orf-user-dialog-backdrop" role="presentation" onMouseDown={() => setDialog(null)}>
          <form className="orf-user-dialog" onSubmit={(event) => void handleDialogSubmit(event)} onMouseDown={(event) => event.stopPropagation()}>
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
              <button type="button" disabled={submitting} onClick={() => setDialog(null)}>
                取消
              </button>
              <button type="submit" disabled={submitting}>
                {submitting ? "保存中" : dialog.mode === "edit" ? "保存" : "新增用户"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
