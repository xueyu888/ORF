import { type Dispatch, type SetStateAction, useMemo } from "react";
import { apiJson, apiRequest, type PermissionRulesResponse, type UsersResponse } from "./apiClient";
import { mergePermissionRules, mergeUsers } from "./orfProviderData";
import { userMutationFailureMessage } from "./orfProviderMutationMessages";
import type { AuthResult } from "./orfProviderAuth";
import type { OrfState, UserRole } from "../types/orf";

type AuthenticateWithPassword = (path: "/api/auth/login" | "/api/auth/registration", body: unknown) => Promise<AuthResult>;

interface UserActionOptions {
  authenticateWithPassword: AuthenticateWithPassword;
  authUserId: string | null;
  notify: (message: string) => void;
  refreshPermissionRules: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  setAuthUserId: Dispatch<SetStateAction<string | null>>;
  setState: Dispatch<SetStateAction<OrfState>>;
}

export function useOrfProviderUserActions({
  authenticateWithPassword,
  authUserId,
  notify,
  refreshPermissionRules,
  refreshUsers,
  setAuthUserId,
  setState,
}: UserActionOptions) {
  return useMemo(
    () => ({
      createUser: async (input: { name: string; email: string; role: UserRole }) => {
        try {
          const data = await apiJson<UsersResponse>("/api/users", {
            method: "POST",
            body: JSON.stringify(input),
          });
          setState((current) => mergeUsers(current, data));
          notify("用户已添加");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户添加失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      loginWithPassword: (email: string, password: string) => authenticateWithPassword("/api/auth/login", { email, password }),
      registerWithPassword: (input: { name: string; email: string; password: string }) => authenticateWithPassword("/api/auth/registration", input),
      logout: () => {
        setAuthUserId(null);
        void apiRequest("/api/auth/logout", { method: "POST" }).finally(() => {
          window.location.assign("/auth");
        });
      },
      updateUser: async (userId: string, input: { name: string; email: string; role: UserRole }) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/users/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          });
          setState((current) => mergeUsers(current, data));
          notify("用户已更新");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户更新失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      deleteUser: async (userId: string) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
          setState((current) => mergeUsers(current, data));
          notify("用户已删除");
          if (authUserId === userId) {
            setAuthUserId(null);
          }
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户删除失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      disableUser: async (userId: string) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/users/${encodeURIComponent(userId)}/disable`, { method: "PATCH" });
          setState((current) => mergeUsers(current, data));
          notify("用户已停用");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户停用失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      approveRegistrationRequest: async (userId: string) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/registration-requests/${encodeURIComponent(userId)}/approve`, { method: "PATCH" });
          setState((current) => mergeUsers(current, data));
          notify("注册申请已通过");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "注册审核失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      rejectRegistrationRequest: async (userId: string) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/registration-requests/${encodeURIComponent(userId)}/reject`, { method: "PATCH" });
          setState((current) => mergeUsers(current, data));
          notify("注册申请已拒绝");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "注册审核失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      updateRolePermissionRules: async (role: UserRole, rules: OrfState["permissionRules"]) => {
        try {
          const data = await apiJson<PermissionRulesResponse>(`/api/permissions/${encodeURIComponent(role)}`, {
            method: "PUT",
            body: JSON.stringify({ permissionRules: rules }),
          });
          setState((current) => mergePermissionRules(current, data));
          notify("角色权限已保存");
          return true;
        } catch {
          notify("角色权限保存失败");
          void refreshPermissionRules().catch(() => undefined);
          return false;
        }
      },
    }),
    [authUserId, authenticateWithPassword, notify, refreshPermissionRules, refreshUsers, setAuthUserId, setState],
  );
}
