import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { AdminReviewAcceptedSettledEditNoDeleteCaseData } from "./_support/admin-review-accepted-settled-edit-no-delete.context";

export const adminReviewAcceptedSettledEditNoDeleteCase = {
  id: "target.admin-review-accepted-settled-edit-no-delete",
  title: "验证管理员在待验收已验收已结算阶段可修改目标不可删除目标",
  model: STATE_CASE_MODEL,
  tags: ["target", "edit", "delete", "admin", "permission", "lifecycle-locked"],

  data: {
    adminEmail: "orf-admin-target-edit-no-delete-e2e@orf.local",
    adminPassword: "OrfAdminTargetEditNoDeleteE2E!2026",
    adminName: "ORF Admin Target Edit No Delete E2E",
    adminRole: "admin",
    adminStatus: "active",
    targetPrefix: "E2E-TARGET-ADMIN-EDIT-NO-DELETE",
    modifiedTargetPrefix: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED",
    deleteObjectivePermissionKey: "objective.delete",
    originalTargets: [
      {
        key: "submitted",
        title: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-SUBMITTED",
        modifiedTitle: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED",
        stage: "goalFrozen",
        flowStatus: "submitted",
      },
      {
        key: "accepted",
        title: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-ACCEPTED",
        modifiedTitle: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED",
        stage: "goalFrozen",
        flowStatus: "accepted",
      },
      {
        key: "settled",
        title: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-SETTLED",
        modifiedTitle: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED",
        stage: "goalFrozen",
        flowStatus: "settled",
      },
    ],
    editTargets: [
      {
        key: "submitted",
        title: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED",
        stage: "goalFrozen",
        flowStatus: "submitted",
      },
      {
        key: "accepted",
        title: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED",
        stage: "goalFrozen",
        flowStatus: "accepted",
      },
      {
        key: "settled",
        title: "E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED",
        stage: "goalFrozen",
        flowStatus: "settled",
      },
    ],
  },

  B: {
    description: "基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-5", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "构造 S0",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-ADMIN-EDIT-NO-DELETE` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-target-edit-no-delete-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active`、名称为 `ORF Admin Target Edit No Delete E2E` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.submitted_objective.prepare", title: "准备 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SUBMITTED`、阶段为 `goalFrozen`、流转状态为 `submitted` 的待验收目标", object: "db.objective_stage_fixture", operator: "prepare", params: { adminUserFrom: "runtime.adminUser", targetFrom: "data.originalTargets.0" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.accepted_objective.prepare", title: "准备 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-ACCEPTED`、阶段为 `goalFrozen`、流转状态为 `accepted` 的已验收目标", object: "db.objective_stage_fixture", operator: "prepare", params: { adminUserFrom: "runtime.adminUser", targetFrom: "data.originalTargets.1" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.settled_objective.prepare", title: "准备 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SETTLED`、阶段为 `goalFrozen`、流转状态为 `settled` 的已结算目标", object: "db.objective_stage_fixture", operator: "prepare", params: { adminUserFrom: "runtime.adminUser", targetFrom: "data.originalTargets.2" } },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "auth.login.admin", title: "使用 本用例管理员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.adminEmail", passwordFrom: "data.adminPassword" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-target-edit-no-delete-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.adminRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Admin Target Edit No Delete E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.adminName" } },
      { source: { caseStepId: "S0-5", method: "api" }, id: "permission.objective_content_edit.granted", title: "当前管理员的目标内容编辑权限 应为 已授权", object: "api.objective_content_edit_permission", operator: "admin_granted" },
      { source: { caseStepId: "S0-6", method: "api" }, id: "permission.delete.granted", title: "当前管理员的目标删除权限 应为 已授权", object: "api.permissions", operator: "admin_granted", params: { permissionKeyFrom: "data.deleteObjectivePermissionKey" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.submitted_objective.exists", title: "应存在 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SUBMITTED`、阶段为 `goalFrozen`、流转状态为 `submitted` 的目标", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.originalTargets.0" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.accepted_objective.exists", title: "应存在 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-ACCEPTED`、阶段为 `goalFrozen`、流转状态为 `accepted` 的目标", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.originalTargets.1" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.settled_objective.exists", title: "应存在 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SETTLED`、阶段为 `goalFrozen`、流转状态为 `settled` 的目标", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.originalTargets.2" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.modified_objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.modifiedTargetPrefix" } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "admin.open_my_challenges", title: "管理员打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "admin.select_all_scope", title: "管理员切换到 \"所有挑战\" 视图", object: "page.challenge_scope", operator: "select", params: { label: "所有挑战" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "edit_submitted.click", title: "点击目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SUBMITTED` 的 \"编辑\" 操作", object: "page.challenge_objective_menu", operator: "click_edit", params: { titleFrom: "data.originalTargets.0.title" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "edit_submitted.submit_title", title: "将目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SUBMITTED` 的标题修改为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED`", object: "page.objective_title_editor", operator: "submit_title", params: { oldTitleFrom: "data.originalTargets.0.title", newTitleFrom: "data.originalTargets.0.modifiedTitle" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "edit_accepted.click", title: "点击目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-ACCEPTED` 的 \"编辑\" 操作", object: "page.challenge_objective_menu", operator: "click_edit", params: { titleFrom: "data.originalTargets.1.title" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "edit_accepted.submit_title", title: "将目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-ACCEPTED` 的标题修改为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED`", object: "page.objective_title_editor", operator: "submit_title", params: { oldTitleFrom: "data.originalTargets.1.title", newTitleFrom: "data.originalTargets.1.modifiedTitle" } },
      { source: { caseStepId: "Action-7", method: "playwright" }, id: "edit_settled.click", title: "点击目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SETTLED` 的 \"编辑\" 操作", object: "page.challenge_objective_menu", operator: "click_edit", params: { titleFrom: "data.originalTargets.2.title" } },
      { source: { caseStepId: "Action-8", method: "playwright" }, id: "edit_settled.submit_title", title: "将目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SETTLED` 的标题修改为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED`", object: "page.objective_title_editor", operator: "submit_title", params: { oldTitleFrom: "data.originalTargets.2.title", newTitleFrom: "data.originalTargets.2.modifiedTitle" } },
      { source: { caseStepId: "Action-9", method: "playwright" }, id: "delete_submitted.click", title: "点击目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED` 的 \"删除\" 操作", object: "page.challenge_objective_menu", operator: "click_delete", params: { titleFrom: "data.editTargets.0.title" } },
      { source: { caseStepId: "Action-10", method: "playwright" }, id: "delete_submitted.confirm", title: "在删除目标确认弹窗中点击 \"确定\" 操作", object: "page.objective_delete_confirm", operator: "confirm" },
      { source: { caseStepId: "Action-11", method: "api" }, id: "delete_submitted.lifecycle_locked", title: "删除目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED` 的结果 应为 生命周期锁定", object: "api.objective_delete_result", operator: "lifecycle_locked", params: { titleFrom: "data.editTargets.0.title" } },
      { source: { caseStepId: "Action-12", method: "playwright" }, id: "delete_accepted.click", title: "点击目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED` 的 \"删除\" 操作", object: "page.challenge_objective_menu", operator: "click_delete", params: { titleFrom: "data.editTargets.1.title" } },
      { source: { caseStepId: "Action-13", method: "playwright" }, id: "delete_accepted.confirm", title: "在删除目标确认弹窗中点击 \"确定\" 操作", object: "page.objective_delete_confirm", operator: "confirm" },
      { source: { caseStepId: "Action-14", method: "api" }, id: "delete_accepted.lifecycle_locked", title: "删除目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED` 的结果 应为 生命周期锁定", object: "api.objective_delete_result", operator: "lifecycle_locked", params: { titleFrom: "data.editTargets.1.title" } },
      { source: { caseStepId: "Action-15", method: "playwright" }, id: "delete_settled.click", title: "点击目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED` 的 \"删除\" 操作", object: "page.challenge_objective_menu", operator: "click_delete", params: { titleFrom: "data.editTargets.2.title" } },
      { source: { caseStepId: "Action-16", method: "playwright" }, id: "delete_settled.confirm", title: "在删除目标确认弹窗中点击 \"确定\" 操作", object: "page.objective_delete_confirm", operator: "confirm" },
      { source: { caseStepId: "Action-17", method: "api" }, id: "delete_settled.lifecycle_locked", title: "删除目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED` 的结果 应为 生命周期锁定", object: "api.objective_delete_result", operator: "lifecycle_locked", params: { titleFrom: "data.editTargets.2.title" } },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "scope.all.selected", title: "\"所有挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "所有挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "delete.toast.failed", title: "页面 应提示 删除目标失败", object: "page.challenge_toast", operator: "delete_failed" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "modified_submitted.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.editTargets.0.title" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "modified_accepted.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.editTargets.1.title" } },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "modified_settled.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.editTargets.2.title" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "original_submitted.hidden", title: "我的挑战列表 应不显示目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SUBMITTED`", object: "page.challenge_objectives", operator: "hidden_title", params: { titleFrom: "data.originalTargets.0.title" } },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "original_accepted.hidden", title: "我的挑战列表 应不显示目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-ACCEPTED`", object: "page.challenge_objectives", operator: "hidden_title", params: { titleFrom: "data.originalTargets.1.title" } },
      { source: { caseStepId: "S1-9", method: "playwright" }, id: "original_settled.hidden", title: "我的挑战列表 应不显示目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SETTLED`", object: "page.challenge_objectives", operator: "hidden_title", params: { titleFrom: "data.originalTargets.2.title" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.modified_submitted.contains", title: "我的挑战数据 应包含目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED`", object: "api.my_challenges", operator: "contains_title", params: { titleFrom: "data.editTargets.0.title" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.modified_accepted.contains", title: "我的挑战数据 应包含目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED`", object: "api.my_challenges", operator: "contains_title", params: { titleFrom: "data.editTargets.1.title" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "api.modified_settled.contains", title: "我的挑战数据 应包含目标 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED`", object: "api.my_challenges", operator: "contains_title", params: { titleFrom: "data.editTargets.2.title" } },
      { source: { caseStepId: "S1-13", method: "api" }, id: "permission.objective_content_edit.still_granted", title: "当前管理员的目标内容编辑权限 应仍为 已授权", object: "api.objective_content_edit_permission", operator: "admin_granted" },
      { source: { caseStepId: "S1-14", method: "api" }, id: "permission.delete.still_granted", title: "当前管理员的目标删除权限 应仍为 已授权", object: "api.permissions", operator: "admin_granted", params: { permissionKeyFrom: "data.deleteObjectivePermissionKey" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.modified_submitted.unchanged", title: "标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SUBMITTED` 的目标阶段 应仍为 `goalFrozen`，流转状态 应仍为 `submitted`", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.editTargets.0" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.modified_accepted.unchanged", title: "标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-ACCEPTED` 的目标阶段 应仍为 `goalFrozen`，流转状态 应仍为 `accepted`", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.editTargets.1" } },
      { source: { caseStepId: "S1-17", method: "prisma" }, id: "db.modified_settled.unchanged", title: "标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-MODIFIED-SETTLED` 的目标阶段 应仍为 `goalFrozen`，流转状态 应仍为 `settled`", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.editTargets.2" } },
      { source: { caseStepId: "S1-18", method: "prisma" }, id: "db.original_submitted.absent", title: "应不存在 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SUBMITTED` 的目标", object: "db.objective", operator: "absent_by_title", params: { titleFrom: "data.originalTargets.0.title" } },
      { source: { caseStepId: "S1-19", method: "prisma" }, id: "db.original_accepted.absent", title: "应不存在 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-ACCEPTED` 的目标", object: "db.objective", operator: "absent_by_title", params: { titleFrom: "data.originalTargets.1.title" } },
      { source: { caseStepId: "S1-20", method: "prisma" }, id: "db.original_settled.absent", title: "应不存在 标题为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE-SETTLED` 的目标", object: "db.objective", operator: "absent_by_title", params: { titleFrom: "data.originalTargets.2.title" } },
      { source: { caseStepId: "S1-21", method: "prisma" }, id: "db.objectives_by_prefix.count", title: "标题前缀为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE` 的本用例目标数量 应为 `3`", object: "db.objectives_by_prefix", operator: "count", params: { prefixFrom: "data.targetPrefix", count: 3 } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-ADMIN-EDIT-NO-DELETE` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前管理员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-ADMIN-EDIT-NO-DELETE` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-target-edit-no-delete-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-target-edit-no-delete-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<AdminReviewAcceptedSettledEditNoDeleteCaseData>;
