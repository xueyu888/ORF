import { clsx } from "clsx";
import { Ban, CheckCircle2, ChevronDown, Edit3, Plus, Search, Trash2, X, XCircle } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Button, IconButton } from "../components/ui";
import { UserAvatar } from "../components/UserAvatar";
import { useOrf } from "../state/OrfProvider";
import type { OrfUser, UserRole } from "../types/orf";

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

const userStatusLabel: Record<OrfUser["status"], string> = {
  pending: "待审核",
  active: "启用",
  rejected: "已拒绝",
  disabled: "已停用",
};

function formatLastOnlineAt(value: string | null | undefined) {
  if (!value) {
    return "未在线";
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
  const {
    approveRegistrationRequest,
    createUser,
    currentUser,
    deleteUser,
    disableUser,
    notify,
    rejectRegistrationRequest,
    state,
    updateUser,
  } = useOrf();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dialog, setDialog] = useState<UserDialogState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const currentUserId = currentUser?.id ?? state.currentUserId;
  const editingUser = dialog?.userId ? state.users.find((user) => user.id === dialog.userId) : null;
  const isCurrentUser = (user: OrfUser) => user.id === currentUserId;
  const isEditingCurrentAdmin = editingUser?.id === currentUserId && editingUser.role === "admin";

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
  const closeDialog = () => {
    if (submitting) {
      return;
    }

    setDialog(null);
  };

  const handleDialogSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dialog || submitting) {
      return;
    }

    if (dialog.mode === "edit" && dialog.userId === currentUserId && dialog.role !== "admin") {
      return;
    }

    const normalizedInput = {
      name: dialog.name.trim(),
      email: dialog.email.trim().toLowerCase(),
      role: dialog.role,
    };

    if (!normalizedInput.name || !normalizedInput.email) {
      notify("请填写姓名和邮箱");
      return;
    }

    setSubmitting(true);
    let ok = false;
    try {
      ok = dialog.mode === "edit" && dialog.userId ? await updateUser(dialog.userId, normalizedInput) : await createUser(normalizedInput);
    } finally {
      setSubmitting(false);
    }

    if (ok) {
      setDialog(null);
    }
  };

  const handleApprove = async (user: OrfUser) => {
    if (processingUserId) {
      return;
    }

    setProcessingUserId(user.id);
    await approveRegistrationRequest(user.id);
    setProcessingUserId(null);
  };

  const handleReject = async (user: OrfUser) => {
    if (processingUserId) {
      return;
    }

    if (!window.confirm(`拒绝「${user.name}」的注册申请？`)) {
      return;
    }

    setProcessingUserId(user.id);
    await rejectRegistrationRequest(user.id);
    setProcessingUserId(null);
  };

  const handleDisable = async (user: OrfUser) => {
    if (isCurrentUser(user) || processingUserId) {
      return;
    }

    if (!window.confirm(`停用用户「${user.name}」？`)) {
      return;
    }

    setProcessingUserId(user.id);
    await disableUser(user.id);
    setProcessingUserId(null);
  };

  const handleDelete = async (user: OrfUser) => {
    if (isCurrentUser(user) || processingUserId) {
      return;
    }

    if (!window.confirm(`删除账号「${user.name}」？这会清理 ORF 用户、成员关系和已绑定登录身份；如果该成员已被 ORF 业务记录引用，后端会拒绝删除。`)) {
      return;
    }

    setProcessingUserId(user.id);
    await deleteUser(user.id);
    setProcessingUserId(null);
  };

  return (
    <div className="orf-user-management-page">
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

            <div className="orf-user-toolbar-actions">
              <div className="orf-permission-metrics" aria-label="成员概览">
                <span>
                  <strong>{state.users.length}</strong>用户
                </span>
                <span>
                  <strong>{roles.length}</strong>角色
                </span>
              </div>
              <Button size="sm" type="button" onClick={openAddDialog}>
                <Plus className="h-5 w-5" />
                新增用户
              </Button>
            </div>
          </div>

          <div className="orf-user-table-wrap">
            <table className="orf-user-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>最近在线</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="orf-user-name-cell">
                        <UserAvatar avatarUrl={user.avatarUrl} className="orf-user-row-avatar" name={user.name} size="md" />
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
                      <span className={clsx("orf-user-status", `orf-user-status-${user.status}`)}>{userStatusLabel[user.status]}</span>
                    </td>
                    <td>
                      <span className="orf-user-last-online">{formatLastOnlineAt(user.lastOnlineAt)}</span>
                    </td>
                    <td>
                      <div className="orf-user-actions orf-user-actions-text">
                        <Button size="sm" type="button" variant="secondary" onClick={() => openEditDialog(user)}>
                          <Edit3 className="h-4 w-4" />
                          编辑
                        </Button>
                        {user.status === "pending" ? (
                          <>
                            <Button size="sm" type="button" disabled={processingUserId === user.id} onClick={() => void handleApprove(user)}>
                              <CheckCircle2 className="h-4 w-4" />
                              通过
                            </Button>
                            <Button size="sm" type="button" variant="danger" disabled={processingUserId === user.id} onClick={() => void handleReject(user)}>
                              <XCircle className="h-4 w-4" />
                              拒绝
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            disabled={isCurrentUser(user) || processingUserId === user.id || user.status === "disabled"}
                            title={isCurrentUser(user) ? "不能停用自己" : "停用"}
                            onClick={() => void handleDisable(user)}
                          >
                            <Ban className="h-4 w-4" />
                            停用
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={isCurrentUser(user) || processingUserId === user.id}
                          title={isCurrentUser(user) ? "不能删除自己" : "删除"}
                          onClick={() => void handleDelete(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </Button>
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
        <div className="orf-user-dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
          <form
            className="orf-user-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orf-user-dialog-title"
            onSubmit={(event) => void handleDialogSubmit(event)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="orf-user-dialog-header">
              <h2 id="orf-user-dialog-title">{dialog.mode === "edit" ? "编辑用户" : "新增用户"}</h2>
              <IconButton disabled={submitting} icon={X} label="关闭" size="sm" type="button" onClick={closeDialog} />
            </div>
            <label>
              <span>姓名</span>
              <input value={dialog.name} disabled={submitting} onChange={(event) => setDialog({ ...dialog, name: event.target.value })} autoFocus required />
            </label>
            <label>
              <span>邮箱</span>
              <input
                type="email"
                value={dialog.email}
                disabled={submitting}
                onChange={(event) => setDialog({ ...dialog, email: event.target.value })}
                required
              />
            </label>
            <label>
              <span>角色</span>
              <select value={dialog.role} disabled={submitting || isEditingCurrentAdmin} onChange={(event) => setDialog({ ...dialog, role: event.target.value as UserRole })}>
                <option value="admin">管理员</option>
                <option value="member">成员</option>
              </select>
            </label>
            <div className="orf-user-dialog-actions">
              <Button type="button" variant="secondary" disabled={submitting} onClick={closeDialog}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "保存中" : dialog.mode === "edit" ? "保存" : "新增用户"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
