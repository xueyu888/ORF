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

const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  member: "User",
};

export function PermissionsPage() {
  const { state, createUser, updateUser, updateUserRole, deleteUser } = useOrf();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
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

  const allSelected = users.length > 0 && users.every((user) => selectedIds.has(user.id));

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(users.map((user) => user.id)) : new Set());
  };

  const toggleUser = (userId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
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
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(user.id);
      return next;
    });
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
        <h1>User Management</h1>
        <p>Manage users, assign roles, and control ORF access.</p>
      </header>

      <section className="orf-user-table-shell">
        <div className="orf-user-toolbar">
          <label className="orf-user-search">
            <Search className="h-5 w-5" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
          </label>

          <div className="orf-user-toolbar-filters">
            <label className="orf-user-select">
              <span>Role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
                <option value="all">All</option>
                <option value="admin">Admin</option>
                <option value="member">User</option>
              </select>
              <ChevronDown className="h-4 w-4" />
            </label>
          </div>

          <button type="button" className="orf-user-add-button" onClick={openAddDialog}>
            <Plus className="h-5 w-5" />
            Add User
          </button>
        </div>

        <div className="orf-user-table-wrap">
          <table className="orf-user-table">
            <thead>
              <tr>
                <th className="orf-user-check-cell">
                  <input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} aria-label="选择全部用户" />
                </th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="orf-user-check-cell">
                    <input type="checkbox" checked={selectedIds.has(user.id)} onChange={(event) => toggleUser(user.id, event.target.checked)} aria-label={`选择 ${user.name}`} />
                  </td>
                  <td>
                    <div className="orf-user-name-cell">
                      <span className="orf-user-row-avatar" style={avatarStyleForName(user.name)}>
                        {initials(user.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="orf-user-name">{user.name}</span>
                        {user.id === currentUserId && <span className="orf-user-current">Current</span>}
                      </span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <label className={clsx("orf-user-role-select", user.role === "admin" ? "orf-user-role-admin" : "orf-user-role-member")}>
                      <select value={user.role} disabled={isLastAdmin(user)} onChange={(event) => updateUserRole(user.id, event.target.value as UserRole)} aria-label={`${user.name} role`}>
                        <option value="admin">Admin</option>
                        <option value="member">User</option>
                      </select>
                      <span>{roleLabel[user.role]}</span>
                    </label>
                  </td>
                  <td>
                    <div className="orf-user-actions">
                      <button type="button" aria-label={`编辑 ${user.name}`} title="编辑" onClick={() => openEditDialog(user)}>
                        <Edit3 className="h-5 w-5" />
                      </button>
                      <button type="button" className="orf-user-delete-action" disabled={isLastAdmin(user)} aria-label={`删除 ${user.name}`} title={isLastAdmin(user) ? "至少保留一个管理员" : "删除"} onClick={() => handleDelete(user)}>
                        <Trash2 className="h-5 w-5" />
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
          <span>Rows per page</span>
          <span className="orf-user-page-size">10</span>
          <span>of {users.length} users</span>
        </footer>
      </section>

      {dialog && (
        <div className="orf-user-dialog-backdrop" role="presentation" onMouseDown={() => setDialog(null)}>
          <form className="orf-user-dialog" onSubmit={handleDialogSubmit} onMouseDown={(event) => event.stopPropagation()}>
            <div className="orf-user-dialog-header">
              <h2>{dialog.mode === "edit" ? "Edit User" : "Add User"}</h2>
              <button type="button" aria-label="关闭" onClick={() => setDialog(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <label>
              <span>Full Name</span>
              <input value={dialog.name} onChange={(event) => setDialog({ ...dialog, name: event.target.value })} autoFocus required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={dialog.email} onChange={(event) => setDialog({ ...dialog, email: event.target.value })} required />
            </label>
            <label>
              <span>Role</span>
              <select value={dialog.role} disabled={editingUser ? isLastAdmin(editingUser) : false} onChange={(event) => setDialog({ ...dialog, role: event.target.value as UserRole })}>
                <option value="admin">Admin</option>
                <option value="member">User</option>
              </select>
            </label>
            <div className="orf-user-dialog-actions">
              <button type="button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="submit">{dialog.mode === "edit" ? "Save" : "Add User"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
