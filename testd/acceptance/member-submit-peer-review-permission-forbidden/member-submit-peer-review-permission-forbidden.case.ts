import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MemberSubmitPeerReviewPermissionForbiddenCaseData } from "./_support/member-submit-peer-review-permission-forbidden.context";

export const memberSubmitPeerReviewPermissionForbiddenCase = {
  id: "acceptance.member-submit-peer-review.permission-forbidden",
  title: "成员提交匿名互评-管理员和非参与成员不可互评",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "peer-review", "permission", "negative-path"],

  data: {
    adminEmail: "orf-admin-peer-review-permission-forbidden-e2e@orf.local",
    adminPassword: "OrfAdminPeerReviewPermissionForbiddenE2E!2026",
    adminName: "ORF Admin Peer Review Permission Forbidden E2E",
    adminRole: "admin",
    memberEmail: "orf-member-peer-review-permission-forbidden-e2e@orf.local",
    memberPassword: "OrfMemberPeerReviewPermissionForbiddenE2E!2026",
    memberName: "ORF Member Peer Review Permission Forbidden E2E",
    memberRole: "member",
    cleanupEmails: [
      "orf-admin-peer-review-permission-forbidden-e2e@orf.local",
      "orf-member-peer-review-permission-forbidden-e2e@orf.local",
    ],
    challengerName: "ORF Peer Review Permission Challenger E2E",
    collaboratorName: "ORF Peer Review Permission Collaborator E2E",
    target: {
      id: "obj-testd-peer-review-permission-forbidden",
      title: "E2E-PEER-REVIEW-PERMISSION-FORBIDDEN: 待验收目标",
      stage: "goalFrozen",
      flowStatus: "submitted",
      lootSubmittedAt: "present",
    },
    loot: {
      body: "E2E-PEER-REVIEW-PERMISSION-FORBIDDEN-LOOT: 前置战利品",
      submittedBy: "ORF Peer Review Permission Challenger E2E",
    },
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "api" }, id: "frontend.login_entry.accessible", title: "前端登录页入口 应可访问", object: "frontend.login_entry", operator: "accessible" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.endpoint.accessible", title: "当前会话查询能力 应可用", object: "auth.session", operator: "accessible" },
      { source: { caseStepId: "B-5", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-6", method: "prisma" }, id: "db.schema.current", title: "ORF 数据库 schema 应为 当前测试版本", object: "db.schema", operator: "current" },
      { source: { caseStepId: "B-7", method: "api" }, id: "ory.admin_public.ready", title: "Ory/Kratos 认证服务的管理和公共访问能力 应可用", object: "ory.admin_public", operator: "ready" },
      { source: { caseStepId: "B-8", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-9", method: "playwright" }, id: "cookie.absent", title: "当前浏览器 应不存在 Ory 登录会话 cookie", object: "browser.cookie", operator: "absent" },
      { source: { caseStepId: "B-10", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备管理员、非参与成员、本用例独占待验收目标和前置战利品，并以管理员身份进入挑战工作台",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.permission_peer_review.delete_residue", title: "删除 本用例残留的无互评权限用户匿名互评记录", object: "db.permission_peer_review", operator: "delete_residue" },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.permission_peer_review_loot.delete_residue", title: "删除 本用例残留的权限边界前置战利品", object: "db.permission_peer_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.permission_peer_review_target.delete_residue", title: "删除 本用例残留的权限边界互评目标及其派生数据", object: "db.permission_peer_review_target", operator: "delete_residue" },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-peer-review-permission-forbidden-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.admin.upsert", title: "准备邮箱为 `orf-admin-peer-review-permission-forbidden-e2e@orf.local`、角色为 `admin`、状态为 `active` 的管理员用户和默认团队成员关系", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-6", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-peer-review-permission-forbidden-e2e@orf.local`、使用固定测试密码的非参与成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.member.upsert", title: "准备邮箱为 `orf-member-peer-review-permission-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的非参与成员用户和默认团队成员关系", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.permission_peer_review_target.upsert", title: "创建标题为 `E2E-PEER-REVIEW-PERMISSION-FORBIDDEN: 待验收目标`、流转状态为 `submitted`、阶段为 `goalFrozen` 的本用例权限边界互评目标", object: "db.permission_peer_review_target", operator: "upsert", params: { fixtureFrom: "data.target", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "permissionTarget" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.permission_peer_review_loot.create", title: "为本用例权限边界互评目标创建内容为 `E2E-PEER-REVIEW-PERMISSION-FORBIDDEN-LOOT: 前置战利品` 的前置战利品", object: "db.permission_peer_review_loot", operator: "create", params: { targetFrom: "runtime.permissionTarget", lootFrom: "data.loot", saveAs: "permissionLoot" } },
      { source: { caseStepId: "Setup-10", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-11", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销非参与成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-13", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "fill.admin_email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "fill.admin_password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "click.admin_sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.permission_peer_review_login", operator: "submit_admin" },
      { source: { caseStepId: "Setup-17", method: "playwright" }, id: "page.goto.tasks", title: "管理员打开 挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
      { source: { caseStepId: "Setup-18", method: "playwright" }, id: "page.all_challenges.click", title: "管理员切换到 \"所有挑战\" 视图", object: "page", operator: "click", params: { role: "button", name: "所有挑战" } },
    ],
  },

  S0: {
    description: "管理员位于挑战工作台，本用例目标为可提交匿名互评的待验收目标",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.admin.authenticated", title: "当前会话 应为 邮箱为 `orf-admin-peer-review-permission-forbidden-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S0-3", method: "playwright" }, id: "all_challenges.view.available", title: "\"所有挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "所有挑战" } },
      { source: { caseStepId: "S0-4", method: "playwright" }, id: "permission_target.visible", title: "本用例权限边界互评目标面板 应可见", object: "page.permission_peer_review_target", operator: "visible" },
      { source: { caseStepId: "S0-5", method: "playwright" }, id: "admin_submit_peer_review_action.absent", title: "本用例权限边界互评目标的 \"提交匿名互评\" 入口 应不可见", object: "page.permission_peer_review_target", operator: "submit_action_absent" },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "permission_target.ready_for_peer_review", title: "本用例权限边界互评目标 应为 流转状态 `submitted`、阶段 `goalFrozen`、战利品提交时间已存在且挑战者仅包含 \"ORF Peer Review Permission Challenger E2E\" 和 \"ORF Peer Review Permission Collaborator E2E\"", object: "db.permission_peer_review_target", operator: "ready_for_peer_review", params: { fixtureFrom: "data.target" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "permission_loot.present", title: "本用例权限边界互评目标 应存在 前置战利品", object: "db.permission_peer_review_loot", operator: "present", params: { targetFrom: "runtime.permissionTarget", lootFrom: "runtime.permissionLoot" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "permission_peer_review.absent", title: "本用例权限边界互评目标 应不存在 管理员和非参与成员提交的匿名互评", object: "db.permission_peer_review", operator: "absent" },
    ],
  },

  Action: {
    description: "切换为非参与成员并进入挑战工作台",
    steps: [
      { source: { caseStepId: "Action-1", method: "api" }, id: "auth.logout_admin", title: "注销管理员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "fill.member_email", title: "在邮箱输入框输入非参与成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.memberEmail" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "fill.member_password", title: "在密码输入框输入非参与成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.memberPassword" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "click.member_sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.permission_peer_review_login", operator: "submit_member" },
      { source: { caseStepId: "Action-7", method: "playwright" }, id: "page.goto.tasks", title: "非参与成员打开 挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
    ],
  },

  S1: {
    description: "非参与成员看不到本用例目标和提交匿名互评入口，数据库不新增匿名互评",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "session.member.authenticated", title: "当前会话 应为 邮箱为 `orf-member-peer-review-permission-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.memberEmail", roleFrom: "data.memberRole", status: "active" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "my_challenges.view.available", title: "\"我的挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "我的挑战" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "permission_target.absent", title: "本用例权限边界互评目标面板 应不可见", object: "page.permission_peer_review_target", operator: "absent" },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "member_submit_peer_review_action.absent", title: "本用例权限边界互评目标的 \"提交匿名互评\" 入口 应不可见", object: "page.permission_peer_review_target", operator: "submit_action_absent" },
      { source: { caseStepId: "S1-6", method: "api" }, id: "member_workbench.target_absent", title: "非参与成员挑战工作台数据 应不包含 本用例权限边界互评目标", object: "api.permission_peer_review_member_workbench", operator: "target_absent" },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "permission_target.still_ready_for_peer_review", title: "本用例权限边界互评目标 应仍为 流转状态 `submitted`、阶段 `goalFrozen`、战利品提交时间已存在且挑战者仅包含 \"ORF Peer Review Permission Challenger E2E\" 和 \"ORF Peer Review Permission Collaborator E2E\"", object: "db.permission_peer_review_target", operator: "ready_for_peer_review", params: { fixtureFrom: "data.target" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "permission_loot.still_present", title: "本用例权限边界互评目标 应仍存在 前置战利品", object: "db.permission_peer_review_loot", operator: "present", params: { targetFrom: "runtime.permissionTarget", lootFrom: "runtime.permissionLoot" } },
      { source: { caseStepId: "S1-9", method: "prisma" }, id: "permission_peer_review.still_absent", title: "本用例权限边界互评目标 应仍不存在 管理员和非参与成员提交的匿名互评", object: "db.permission_peer_review", operator: "absent" },
    ],
  },

  Clean: {
    description: "删除权限边界互评目标、前置战利品、测试用户和浏览器运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.permission_peer_review.delete", title: "删除 本用例残留的无互评权限用户匿名互评记录", object: "db.permission_peer_review", operator: "delete_residue" },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.permission_peer_review_loot.delete", title: "删除 本用例权限边界前置战利品", object: "db.permission_peer_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Clean-3", method: "prisma" }, id: "db.permission_peer_review_target.delete", title: "删除 本用例权限边界互评目标及其派生数据", object: "db.permission_peer_review_target", operator: "delete_residue" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销非参与成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-peer-review-permission-forbidden-e2e@orf.local` 的管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-peer-review-permission-forbidden-e2e@orf.local` 的非参与成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.users.delete_memberships", title: "删除管理员和非参与成员的默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailsFrom: "data.cleanupEmails" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.users.delete", title: "删除管理员和非参与成员用户", object: "db.user", operator: "delete", params: { emailsFrom: "data.cleanupEmails" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.permission_peer_review.absent", title: "应不存在 本用例无互评权限用户匿名互评记录", object: "db.permission_peer_review", operator: "absent" },
      { source: { caseStepId: "Clean-14", method: "prisma" }, id: "db.permission_peer_review_loot.absent", title: "应不存在 本用例权限边界前置战利品", object: "db.permission_peer_review_loot", operator: "absent" },
      { source: { caseStepId: "Clean-15", method: "prisma" }, id: "db.permission_peer_review_target.absent", title: "应不存在 本用例权限边界互评目标", object: "db.permission_peer_review_target", operator: "absent" },
      { source: { caseStepId: "Clean-16", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-peer-review-permission-forbidden-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-17", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-peer-review-permission-forbidden-e2e@orf.local` 的非参与成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-18", method: "prisma" }, id: "db.users.absent", title: "管理员和非参与成员用户 应不存在", object: "db.user", operator: "absent", params: { emailsFrom: "data.cleanupEmails" } },
    ],
  },
} satisfies StateCaseSpec<MemberSubmitPeerReviewPermissionForbiddenCaseData>;
