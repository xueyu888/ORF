import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminEditMemberCaseData } from "./_support/admin-edit-member.context";

export const adminEditMemberCase = {
  id: "members.admin.edit_member",
  title: "管理员可以编辑成员资料",
  model: STATE_CASE_MODEL,
  tags: ["members", "admin", "happy-path"],

  data: {
    adminEmail: "zrx831@gmail.com",
    adminPassword: "123123123",
    adminRole: "admin",
    targetUserId: "user-testd-member-edit",
    originalName: "E2E Member Edit Source",
    originalEmail: "e2e-member-edit-source@orf.local",
    originalRole: "member",
    updatedName: "E2E Member Edit Updated",
    updatedEmail: "e2e-member-edit-updated@orf.local",
    updatedRole: "admin",
  },

  B: {
    description: "系统服务、Ory、数据库和预置管理员可用，当前浏览器未登录且测试成员不存在",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      { id: "ory.admin_identity.exists", title: "管理员 Ory 身份存在", object: "ory.identity", operator: "exists", params: { emailFrom: "data.adminEmail" } },
      { id: "db.admin.active", title: "预置管理员账号可用", object: "db.admin", operator: "active", params: { emailFrom: "data.adminEmail" } },
      { id: "db.editable_member.absent", title: "测试成员不存在", object: "db.editable_member", operator: "absent" },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "创建可编辑测试成员，登录管理员并打开成员管理页",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "db.editable_member.create", title: "创建可编辑测试成员", object: "db.editable_member", operator: "create", params: { saveAs: "editableMember" } },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入管理员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.adminEmail" } },
      { id: "fill.password", title: "输入管理员密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.adminPassword" } },
      { id: "click.sign_in", title: "点击登录按钮", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { id: "session.admin.authenticated", title: "等待管理员 session 已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { id: "page.goto.members", title: "打开成员管理页", object: "page", operator: "goto", params: { path: "/members" } },
    ],
  },

  S0: {
    description: "管理员已登录，成员管理页显示原测试成员且可编辑",
    assertions: [
      { id: "session.admin.authenticated", title: "后端 session 已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { id: "url.members", title: "当前页面是成员管理页", object: "page.url", operator: "match", params: { pattern: "/members$" } },
      { id: "page.member_row.original.visible", title: "成员管理列表显示原测试成员", object: "page.member_row", operator: "visible", params: { textFrom: "data.originalEmail" } },
      { id: "page.member_row.original.edit_visible", title: "原测试成员编辑操作可见", object: "page.member_row", operator: "edit_visible", params: { textFrom: "data.originalEmail" } },
      { id: "db.editable_member.original", title: "数据库中原测试成员状态正确", object: "db.editable_member", operator: "original" },
    ],
  },

  Action: {
    description: "管理员编辑测试成员姓名、邮箱和角色",
    steps: [
      { id: "api.user_update.capture", title: "监听编辑成员接口响应", object: "api.user_update", operator: "capture", params: { memberFrom: "runtime.editableMember", saveAs: "updateUserResponse" } },
      { id: "page.member_row.original.edit", title: "点击原测试成员编辑操作", object: "page.member_row", operator: "edit", params: { textFrom: "data.originalEmail" } },
      { id: "page.member_dialog.visible", title: "编辑成员弹窗可见", object: "page.member_dialog", operator: "visible" },
      { id: "page.member_dialog.fill_name", title: "输入新姓名", object: "page.member_dialog", operator: "fill_name", params: { valueFrom: "data.updatedName" } },
      { id: "page.member_dialog.fill_email", title: "输入新邮箱", object: "page.member_dialog", operator: "fill_email", params: { valueFrom: "data.updatedEmail" } },
      { id: "page.member_dialog.select_role", title: "选择管理员角色", object: "page.member_dialog", operator: "select_role", params: { roleFrom: "data.updatedRole" } },
      { id: "page.member_dialog.submit", title: "保存成员编辑", object: "page.member_dialog", operator: "submit" },
    ],
  },

  S1: {
    description: "编辑接口成功，数据库和成员管理页显示更新后的成员资料",
    assertions: [
      { id: "api.user_update.response_ok", title: "编辑成员接口响应成功", object: "api.response", operator: "ok", params: { responseFrom: "runtime.updateUserResponse" } },
      { id: "db.editable_member.updated", title: "数据库中成员资料已更新", object: "db.editable_member", operator: "updated" },
      { id: "page.member_row.updated.visible", title: "成员管理列表显示已编辑成员", object: "page.member_row", operator: "visible", params: { textFrom: "data.updatedEmail" } },
      { id: "page.member_row.original.absent", title: "成员管理列表不显示原测试成员", object: "page.member_row", operator: "absent", params: { textFrom: "data.originalEmail" } },
      { id: "session.admin.still_authenticated", title: "管理员仍保持登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除测试成员并退出登录",
    steps: [
      { id: "db.editable_member.delete", title: "删除测试成员", object: "db.editable_member", operator: "delete" },
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "ory.admin_identity.exists", title: "管理员 Ory 身份仍然存在", object: "ory.identity", operator: "exists", params: { emailFrom: "data.adminEmail" } },
      { id: "db.admin.active", title: "预置管理员账号仍然可用", object: "db.admin", operator: "active", params: { emailFrom: "data.adminEmail" } },
      { id: "db.editable_member.absent", title: "测试成员不存在", object: "db.editable_member", operator: "absent" },
    ],
  },
} satisfies StateCaseSpec<AdminEditMemberCaseData>;
