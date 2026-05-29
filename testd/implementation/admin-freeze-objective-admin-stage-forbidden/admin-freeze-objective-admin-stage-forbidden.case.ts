import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminFreezeObjectiveAdminStageForbiddenCaseData } from "./_support/admin-freeze-objective-admin-stage-forbidden.context";

export const adminFreezeObjectiveAdminStageForbiddenCase = {
  id: "implementation.admin-freeze-objective.admin-stage-forbidden",
  title: "管理员冻结目标进入实施阶段-管理员不可冻结评估阶段之外目标",
  model: STATE_CASE_MODEL,
  tags: ["implementation", "objective", "freeze", "admin", "stage", "negative-path"],

  data: {
    email: "orf-admin-freeze-stage-forbidden-e2e@orf.local",
    password: "OrfAdminFreezeStageForbiddenE2E!2026",
    name: "ORF Admin Freeze Stage Forbidden E2E",
    role: "admin",
    targets: {
      goalSetting: {
        id: "obj-testd-admin-freeze-stage-forbidden-goal-setting",
        title: "E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 目标设定阶段",
        stage: "goalSetting",
        flowStatus: "candidate",
        confirmedAt: "absent",
      },
      resultClaiming: {
        id: "obj-testd-admin-freeze-stage-forbidden-result-claiming",
        title: "E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 结果申领阶段",
        stage: "resultClaiming",
        flowStatus: "open",
        confirmedAt: "absent",
      },
      goalFrozen: {
        id: "obj-testd-admin-freeze-stage-forbidden-goal-frozen",
        title: "E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 实施阶段",
        stage: "goalFrozen",
        flowStatus: "frozen",
        confirmedAt: "present",
      },
    },
    results: {
      goalSetting: {
        title: "E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 目标设定阶段前置指标",
        metricName: "E2E 管理员不可冻结目标设定阶段指标完成率",
      },
      resultClaiming: {
        title: "E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 结果申领阶段前置指标",
        metricName: "E2E 管理员不可冻结结果申领阶段指标完成率",
      },
      goalFrozen: {
        title: "E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 实施阶段前置指标",
        metricName: "E2E 管理员不可冻结实施阶段指标完成率",
      },
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
    description: "准备管理员账号、三个评估阶段之外的本用例独占目标和对应冻结前置指标，并完成管理员登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.admin_stage_forbidden_results.delete_residue", title: "删除 本用例残留的三个非评估阶段冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "delete_residue" },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.admin_stage_forbidden_targets.delete_residue", title: "删除 本用例残留的三个非评估阶段冻结目标及其派生数据", object: "db.admin_stage_forbidden_targets", operator: "delete_residue" },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-freeze-stage-forbidden-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.admin.upsert", title: "准备邮箱为 `orf-admin-freeze-stage-forbidden-e2e@orf.local`、角色为 `admin`、状态为 `active` 的管理员用户和默认团队成员关系", object: "db.user", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.goal_setting_target.upsert", title: "创建标题为 `E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 目标设定阶段`、流转状态为 `candidate`、阶段为 `goalSetting` 的本用例目标设定阶段冻结目标", object: "db.admin_stage_forbidden_targets", operator: "upsert", params: { fixtureFrom: "data.targets.goalSetting", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "goalSettingTarget" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.result_claiming_target.upsert", title: "创建标题为 `E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 结果申领阶段`、流转状态为 `open`、阶段为 `resultClaiming` 的本用例结果申领阶段冻结目标", object: "db.admin_stage_forbidden_targets", operator: "upsert", params: { fixtureFrom: "data.targets.resultClaiming", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "resultClaimingTarget" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.goal_frozen_target.upsert", title: "创建标题为 `E2E-FREEZE-ADMIN-STAGE-FORBIDDEN: 实施阶段`、流转状态为 `frozen`、阶段为 `goalFrozen` 且冻结确认时间已存在的本用例实施阶段冻结目标", object: "db.admin_stage_forbidden_targets", operator: "upsert", params: { fixtureFrom: "data.targets.goalFrozen", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "goalFrozenTarget" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.goal_setting_result.create", title: "为本用例目标设定阶段冻结目标创建冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "create", params: { targetFrom: "runtime.goalSettingTarget", resultFrom: "data.results.goalSetting", saveAs: "goalSettingResult" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.result_claiming_result.create", title: "为本用例结果申领阶段冻结目标创建冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "create", params: { targetFrom: "runtime.resultClaimingTarget", resultFrom: "data.results.resultClaiming", saveAs: "resultClaimingResult" } },
      { source: { caseStepId: "Setup-10", method: "prisma" }, id: "db.goal_frozen_result.create", title: "为本用例实施阶段冻结目标创建冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "create", params: { targetFrom: "runtime.goalFrozenTarget", resultFrom: "data.results.goalFrozen", saveAs: "goalFrozenResult" } },
      { source: { caseStepId: "Setup-11", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-13", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "fill.password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
    ],
  },

  S0: {
    description: "管理员已登录，三个本用例目标均处于评估阶段之外，且每个目标均存在冻结前置指标",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-freeze-stage-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.goal_setting_target.state", title: "本用例目标设定阶段冻结目标 应为 流转状态 `candidate`、阶段 `goalSetting` 且冻结确认时间为空", object: "db.admin_stage_forbidden_targets", operator: "state", params: { fixtureFrom: "data.targets.goalSetting" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.result_claiming_target.state", title: "本用例结果申领阶段冻结目标 应为 流转状态 `open`、阶段 `resultClaiming` 且冻结确认时间为空", object: "db.admin_stage_forbidden_targets", operator: "state", params: { fixtureFrom: "data.targets.resultClaiming" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.goal_frozen_target.state", title: "本用例实施阶段冻结目标 应为 流转状态 `frozen`、阶段 `goalFrozen` 且冻结确认时间已存在", object: "db.admin_stage_forbidden_targets", operator: "state", params: { fixtureFrom: "data.targets.goalFrozen" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.goal_setting_result.present", title: "本用例目标设定阶段冻结目标 应存在 冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "present", params: { targetFrom: "runtime.goalSettingTarget", resultFrom: "runtime.goalSettingResult" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.result_claiming_result.present", title: "本用例结果申领阶段冻结目标 应存在 冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "present", params: { targetFrom: "runtime.resultClaimingTarget", resultFrom: "runtime.resultClaimingResult" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.goal_frozen_result.present", title: "本用例实施阶段冻结目标 应存在 冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "present", params: { targetFrom: "runtime.goalFrozenTarget", resultFrom: "runtime.goalFrozenResult" } },
    ],
  },

  Action: {
    description: "管理员进入挑战工作台并打开所有挑战视图",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.tasks", title: "管理员打开 挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "page.all_challenges.click", title: "管理员切换到 \"所有挑战\" 视图", object: "page", operator: "click", params: { role: "button", name: "所有挑战" } },
    ],
  },

  S1: {
    description: "管理员能看到三个非评估阶段目标但看不到冻结入口，三个目标状态保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "all_challenges.view.available", title: "\"所有挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "所有挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "admin_stage_forbidden_targets.visible", title: "三个本用例非评估阶段冻结目标面板 应均可见", object: "page.admin_stage_forbidden_targets", operator: "visible" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "admin_stage_forbidden_targets.freeze_absent", title: "三个本用例非评估阶段冻结目标的 \"冻结\" 操作 应均不可见", object: "page.admin_stage_forbidden_targets", operator: "freeze_absent" },
      { source: { caseStepId: "S1-5", method: "api" }, id: "api.admin_workbench.targets_present", title: "管理员挑战工作台数据 应包含 三个本用例非评估阶段冻结目标", object: "api.admin_workbench", operator: "targets_present" },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.admin_stage_forbidden_targets.states_unchanged", title: "三个本用例非评估阶段冻结目标的流转状态、阶段和冻结确认时间 应保持不变", object: "db.admin_stage_forbidden_targets", operator: "all_states" },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.goal_setting_result.still_present", title: "本用例目标设定阶段冻结目标 应仍存在 冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "present", params: { targetFrom: "runtime.goalSettingTarget", resultFrom: "runtime.goalSettingResult" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "db.result_claiming_result.still_present", title: "本用例结果申领阶段冻结目标 应仍存在 冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "present", params: { targetFrom: "runtime.resultClaimingTarget", resultFrom: "runtime.resultClaimingResult" } },
      { source: { caseStepId: "S1-9", method: "prisma" }, id: "db.goal_frozen_result.still_present", title: "本用例实施阶段冻结目标 应仍存在 冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "present", params: { targetFrom: "runtime.goalFrozenTarget", resultFrom: "runtime.goalFrozenResult" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-11", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-freeze-stage-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S1-13", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
    ],
  },

  Clean: {
    description: "删除三个冻结前置指标、三个非评估阶段目标、管理员账号和浏览器运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.admin_stage_forbidden_results.delete", title: "删除 本用例创建的三个非评估阶段冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "delete_residue" },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.admin_stage_forbidden_targets.delete", title: "删除 本用例三个非评估阶段冻结目标及其派生数据", object: "db.admin_stage_forbidden_targets", operator: "delete_residue" },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-freeze-stage-forbidden-e2e@orf.local` 的管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.admin_membership.delete", title: "删除邮箱为 `orf-admin-freeze-stage-forbidden-e2e@orf.local` 的管理员用户默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.admin_user.delete", title: "删除邮箱为 `orf-admin-freeze-stage-forbidden-e2e@orf.local` 的管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.admin_stage_forbidden_results.absent", title: "应不存在 本用例三个非评估阶段冻结前置指标", object: "db.admin_stage_forbidden_results", operator: "absent" },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.admin_stage_forbidden_targets.absent", title: "应不存在 本用例三个非评估阶段冻结目标", object: "db.admin_stage_forbidden_targets", operator: "absent" },
      { source: { caseStepId: "Clean-12", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-freeze-stage-forbidden-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-freeze-stage-forbidden-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<AdminFreezeObjectiveAdminStageForbiddenCaseData>;
