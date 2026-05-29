import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminFreezeObjectiveMemberForbiddenCaseData } from "./_support/admin-freeze-objective-member-forbidden.context";

export const adminFreezeObjectiveMemberForbiddenCase = {
  id: "implementation.admin-freeze-objective.member-forbidden",
  title: "管理员冻结目标进入实施阶段-普通成员不可冻结目标",
  model: STATE_CASE_MODEL,
  tags: ["implementation", "objective", "freeze", "member", "permission", "negative-path"],

  data: {
    email: "orf-member-freeze-forbidden-e2e@orf.local",
    password: "OrfMemberFreezeForbiddenE2E!2026",
    name: "ORF Member Freeze Forbidden E2E",
    role: "member",
    targets: {
      goalSetting: {
        id: "obj-testd-member-freeze-forbidden-goal-setting",
        title: "E2E-FREEZE-MEMBER-FORBIDDEN: 目标设定阶段",
        stage: "goalSetting",
        flowStatus: "candidate",
        confirmedAt: "absent",
      },
      resultClaiming: {
        id: "obj-testd-member-freeze-forbidden-result-claiming",
        title: "E2E-FREEZE-MEMBER-FORBIDDEN: 结果申领阶段",
        stage: "resultClaiming",
        flowStatus: "open",
        confirmedAt: "absent",
      },
      reestimate: {
        id: "obj-testd-member-freeze-forbidden-reestimate",
        title: "E2E-FREEZE-MEMBER-FORBIDDEN: 评估阶段",
        stage: "orfReestimate",
        flowStatus: "reestimating",
        confirmedAt: "absent",
      },
      goalFrozen: {
        id: "obj-testd-member-freeze-forbidden-goal-frozen",
        title: "E2E-FREEZE-MEMBER-FORBIDDEN: 实施阶段",
        stage: "goalFrozen",
        flowStatus: "frozen",
        confirmedAt: "present",
      },
    },
    freezeResult: {
      title: "E2E-FREEZE-MEMBER-FORBIDDEN: 评估阶段冻结前置指标",
      metricName: "E2E 普通成员不可冻结评估阶段指标完成率",
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
    description: "准备普通成员账号、四个阶段的本用例独占目标和评估阶段冻结前置指标，并完成普通成员登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.freeze_result.delete_residue", title: "删除 本用例残留的评估阶段冻结前置指标", object: "db.freeze_result", operator: "delete", params: { titleFrom: "data.freezeResult.title" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.member_freeze_forbidden_targets.delete_residue", title: "删除 本用例残留的四个阶段冻结目标及其派生数据", object: "db.member_freeze_forbidden_targets", operator: "delete_residue" },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-freeze-forbidden-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.member.upsert", title: "准备邮箱为 `orf-member-freeze-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户和默认团队成员关系", object: "db.user", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.goal_setting_target.upsert", title: "创建标题为 `E2E-FREEZE-MEMBER-FORBIDDEN: 目标设定阶段`、流转状态为 `candidate`、阶段为 `goalSetting` 的本用例成员冻结目标", object: "db.member_freeze_forbidden_targets", operator: "upsert", params: { fixtureFrom: "data.targets.goalSetting", teamIdFrom: "runtime.memberUser.teamId", memberNameFrom: "data.name", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "goalSettingTarget" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.result_claiming_target.upsert", title: "创建标题为 `E2E-FREEZE-MEMBER-FORBIDDEN: 结果申领阶段`、流转状态为 `open`、阶段为 `resultClaiming` 的本用例成员冻结目标", object: "db.member_freeze_forbidden_targets", operator: "upsert", params: { fixtureFrom: "data.targets.resultClaiming", teamIdFrom: "runtime.memberUser.teamId", memberNameFrom: "data.name", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "resultClaimingTarget" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.reestimate_target.upsert", title: "创建标题为 `E2E-FREEZE-MEMBER-FORBIDDEN: 评估阶段`、流转状态为 `reestimating`、阶段为 `orfReestimate` 的本用例成员冻结目标", object: "db.member_freeze_forbidden_targets", operator: "upsert", params: { fixtureFrom: "data.targets.reestimate", teamIdFrom: "runtime.memberUser.teamId", memberNameFrom: "data.name", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "reestimateTarget" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.goal_frozen_target.upsert", title: "创建标题为 `E2E-FREEZE-MEMBER-FORBIDDEN: 实施阶段`、流转状态为 `frozen`、阶段为 `goalFrozen` 且冻结确认时间已存在的本用例成员冻结目标", object: "db.member_freeze_forbidden_targets", operator: "upsert", params: { fixtureFrom: "data.targets.goalFrozen", teamIdFrom: "runtime.memberUser.teamId", memberNameFrom: "data.name", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "goalFrozenTarget" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.reestimate_freeze_result.create", title: "为本用例评估阶段成员冻结目标创建标题为 `E2E-FREEZE-MEMBER-FORBIDDEN: 评估阶段冻结前置指标` 的冻结前置指标", object: "db.freeze_result", operator: "create", params: { targetFrom: "runtime.reestimateTarget", titleFrom: "data.freezeResult.title", metricNameFrom: "data.freezeResult.metricName", saveAs: "reestimateFreezeResult" } },
      { source: { caseStepId: "Setup-10", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-13", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "fill.password", title: "在密码输入框输入普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
    ],
  },

  S0: {
    description: "普通成员已登录，四个阶段的本用例目标均包含该普通成员，评估阶段目标具备管理员可冻结前置条件",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-freeze-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.goal_setting_target.state", title: "本用例目标设定阶段成员冻结目标 应为 流转状态 `candidate`、阶段 `goalSetting` 且冻结确认时间为空", object: "db.member_freeze_forbidden_targets", operator: "state", params: { fixtureFrom: "data.targets.goalSetting" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.result_claiming_target.state", title: "本用例结果申领阶段成员冻结目标 应为 流转状态 `open`、阶段 `resultClaiming` 且冻结确认时间为空", object: "db.member_freeze_forbidden_targets", operator: "state", params: { fixtureFrom: "data.targets.resultClaiming" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.reestimate_target.state", title: "本用例评估阶段成员冻结目标 应为 流转状态 `reestimating`、阶段 `orfReestimate` 且冻结确认时间为空", object: "db.member_freeze_forbidden_targets", operator: "state", params: { fixtureFrom: "data.targets.reestimate" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.goal_frozen_target.state", title: "本用例实施阶段成员冻结目标 应为 流转状态 `frozen`、阶段 `goalFrozen` 且冻结确认时间已存在", object: "db.member_freeze_forbidden_targets", operator: "state", params: { fixtureFrom: "data.targets.goalFrozen" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.member_freeze_forbidden_targets.challenger_present", title: "四个本用例成员冻结目标的挑战者列表 应均包含 \"ORF Member Freeze Forbidden E2E\"", object: "db.member_freeze_forbidden_targets", operator: "challenger_present", params: { memberNameFrom: "data.name" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.reestimate_freeze_result.present", title: "本用例评估阶段成员冻结目标 应存在 冻结前置指标", object: "db.freeze_result", operator: "present", params: { targetFrom: "runtime.reestimateTarget", resultFrom: "runtime.reestimateFreezeResult" } },
    ],
  },

  Action: {
    description: "普通成员进入挑战工作台",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.tasks", title: "普通成员打开 挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
    ],
  },

  S1: {
    description: "普通成员能看到四个阶段的本用例目标但看不到冻结入口，四个目标状态保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "my_challenges.view.available", title: "\"我的挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "member_freeze_forbidden_targets.visible", title: "四个本用例成员冻结目标面板 应均可见", object: "page.member_freeze_forbidden_targets", operator: "visible" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "member_freeze_forbidden_targets.freeze_absent", title: "四个本用例成员冻结目标的 \"冻结\" 操作 应均不可见", object: "page.member_freeze_forbidden_targets", operator: "freeze_absent" },
      { source: { caseStepId: "S1-5", method: "api" }, id: "api.member_workbench.targets_present", title: "普通成员挑战工作台数据 应包含 四个本用例成员冻结目标", object: "api.member_workbench", operator: "targets_present" },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.member_freeze_forbidden_targets.states_unchanged", title: "四个本用例成员冻结目标的流转状态、阶段和冻结确认时间 应保持不变", object: "db.member_freeze_forbidden_targets", operator: "all_states" },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.member_freeze_forbidden_targets.challenger_still_present", title: "四个本用例成员冻结目标的挑战者列表 应仍均包含 \"ORF Member Freeze Forbidden E2E\"", object: "db.member_freeze_forbidden_targets", operator: "challenger_present", params: { memberNameFrom: "data.name" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "db.reestimate_freeze_result.still_present", title: "本用例评估阶段成员冻结目标 应仍存在 冻结前置指标", object: "db.freeze_result", operator: "present", params: { targetFrom: "runtime.reestimateTarget", resultFrom: "runtime.reestimateFreezeResult" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-10", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-freeze-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
    ],
  },

  Clean: {
    description: "删除评估阶段冻结前置指标、四个阶段目标、普通成员账号和浏览器运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.freeze_result.delete", title: "删除 本用例创建的评估阶段冻结前置指标", object: "db.freeze_result", operator: "delete", params: { titleFrom: "data.freezeResult.title", resultFrom: "runtime.reestimateFreezeResult" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.member_freeze_forbidden_targets.delete", title: "删除 本用例四个阶段冻结目标及其派生数据", object: "db.member_freeze_forbidden_targets", operator: "delete_residue" },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-freeze-forbidden-e2e@orf.local` 的普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_membership.delete", title: "删除邮箱为 `orf-member-freeze-forbidden-e2e@orf.local` 的普通成员用户默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member_user.delete", title: "删除邮箱为 `orf-member-freeze-forbidden-e2e@orf.local` 的普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.freeze_result.absent", title: "应不存在 标题为 `E2E-FREEZE-MEMBER-FORBIDDEN: 评估阶段冻结前置指标` 的冻结前置指标", object: "db.result", operator: "absent", params: { titleFrom: "data.freezeResult.title" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.member_freeze_forbidden_targets.absent", title: "应不存在 本用例四个阶段冻结目标", object: "db.member_freeze_forbidden_targets", operator: "absent" },
      { source: { caseStepId: "Clean-12", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-freeze-forbidden-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-freeze-forbidden-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<AdminFreezeObjectiveMemberForbiddenCaseData>;
