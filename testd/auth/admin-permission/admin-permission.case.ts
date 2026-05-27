import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminPermissionCaseData } from "./_support/admin-permission.context";

export const adminPermissionUpdateCase = {
  id: "auth.admin_permission.update",
  title: "管理员可以变更普通成员角色权限",
  model: STATE_CASE_MODEL,
  tags: ["auth", "permissions", "admin", "happy-path"],

  data: {
    email: "zrx831@gmail.com",
    password: "123123123",
    role: "admin",
    targetRole: "member",
    permissionKey: "comment.manage",
  },

  B: {
    description: "系统服务可用，预置管理员账号可用，浏览器处于未登录基准状态",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      {
        id: "ory.admin_identity.exists",
        title: "管理员 Ory 身份存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.admin.active",
        title: "预置管理员账号可用",
        object: "db.admin",
        operator: "active",
        params: { emailFrom: "data.email" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "登录管理员、记录原权限并打开权限管理页",
    steps: [
      {
        id: "db.admin.record",
        title: "记录管理员登录前状态",
        object: "db.admin",
        operator: "record",
        params: { emailFrom: "data.email", saveAs: "adminAccountBeforeLogin" },
      },
      {
        id: "ory.sessions.revoke",
        title: "清理管理员已有 Ory session",
        object: "ory.sessions",
        operator: "revoke_by_email",
        params: { emailFrom: "data.email" },
      },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入管理员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      {
        id: "fill.password",
        title: "输入管理员密码",
        object: "page",
        operator: "fill",
        params: { label: "Password", exact: true, valueFrom: "data.password" },
      },
      {
        id: "click.sign_in",
        title: "管理员登录",
        object: "page",
        operator: "click",
        params: { role: "button", name: "Sign In" },
      },
      {
        id: "session.admin.authenticated",
        title: "等待管理员 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      {
        id: "api.permissions.read_original",
        title: "读取修改前成员权限",
        object: "api.permissions",
        operator: "read",
        params: { saveAs: "originalMemberPermissionRules" },
      },
      { id: "page.goto.permissions", title: "打开权限管理页", object: "page", operator: "goto", params: { path: "/permissions" } },
    ],
  },

  S0: {
    description: "权限管理页可用，已记录 member 原权限",
    assertions: [
      {
        id: "session.admin.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "url.permissions", title: "当前页面是权限管理页", object: "page.url", operator: "match", params: { pattern: "/permissions$" } },
      { id: "member.tab.visible", title: "成员角色页签可见", object: "page.role_tab", operator: "visible", params: { text: "成员" } },
      {
        id: "comment_manage.toggle.visible",
        title: "成员评论管理权限开关可见",
        object: "page",
        operator: "visible",
        params: { label: "成员 管理所有评论" },
      },
    ],
  },

  Action: {
    description: "切换 member 角色的 comment.manage 权限并保存",
    steps: [
      {
        id: "permission_rules.changed",
        title: "生成变更后的成员权限",
        object: "api.permissions",
        operator: "changed_member_rules",
        params: {
          originalRulesFrom: "runtime.originalMemberPermissionRules",
          roleFrom: "data.targetRole",
          permissionKeyFrom: "data.permissionKey",
          saveAs: "changedMemberPermissionRules",
        },
      },
      {
        id: "api.permissions.update_member",
        title: "保存成员权限变更",
        object: "api.permissions",
        operator: "update_member",
        params: { rulesFrom: "runtime.changedMemberPermissionRules", saveAs: "permissionUpdateResponse" },
      },
    ],
  },

  S1: {
    description: "成员权限已保存并可再次读取",
    assertions: [
      {
        id: "permission_update.response_ok",
        title: "权限保存接口响应成功",
        object: "api.permissions",
        operator: "response_ok",
        params: { resultFrom: "runtime.permissionUpdateResponse" },
      },
      {
        id: "permission_rules.persisted",
        title: "成员权限变更已持久化",
        object: "api.permissions",
        operator: "member_rules_match",
        params: { expectedRulesFrom: "runtime.changedMemberPermissionRules", roleFrom: "data.targetRole" },
      },
      {
        id: "session.admin.still_authenticated",
        title: "管理员仍保持登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      {
        id: "db.admin.active",
        title: "预置管理员账号仍然可用",
        object: "db.admin",
        operator: "active",
        params: { emailFrom: "data.email" },
      },
    ],
  },

  Clean: {
    description: "恢复成员权限并清理登录态",
    steps: [
      {
        id: "api.permissions.restore_member",
        title: "恢复成员权限",
        object: "api.permissions",
        operator: "update_member",
        params: { rulesFrom: "runtime.originalMemberPermissionRules", saveAs: "permissionRestoreResponse" },
      },
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "db.restore_last_online_at",
        title: "恢复管理员 last_online_at",
        object: "db.admin",
        operator: "restore_last_online_at",
        params: { accountFrom: "runtime.adminAccountBeforeLogin" },
      },
      {
        id: "ory.sessions.revoke",
        title: "撤销管理员 Ory session",
        object: "ory.sessions",
        operator: "revoke_by_email",
        params: { emailFrom: "data.email" },
      },
      {
        id: "ory.admin_identity.exists",
        title: "管理员 Ory 身份仍然存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.admin.active",
        title: "预置管理员账号仍然可用",
        object: "db.admin",
        operator: "active",
        params: { emailFrom: "data.email" },
      },
    ],
  },
} satisfies StateCaseSpec<AdminPermissionCaseData>;
