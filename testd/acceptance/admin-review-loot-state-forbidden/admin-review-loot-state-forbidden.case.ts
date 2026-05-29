import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminReviewLootStateForbiddenCaseData } from "./_support/admin-review-loot-state-forbidden.context";

export const adminReviewLootStateForbiddenCase = {
  id: "acceptance.admin-review-loot.state-forbidden",
  title: "管理员验收战利品-非待验收目标不可验收",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "review-loot", "state", "negative-path"],

  data: {
    email: "orf-admin-review-loot-state-forbidden-e2e@orf.local",
    password: "OrfAdminReviewLootStateForbiddenE2E!2026",
    name: "ORF Admin Review Loot State Forbidden E2E",
    role: "admin",
    challengerName: "ORF Review Loot State Challenger E2E",
    targets: {
      resultClaiming: {
        id: "obj-testd-review-loot-state-forbidden-result-claiming",
        title: "E2E-REVIEW-LOOT-STATE-FORBIDDEN: 发布阶段目标",
        stage: "resultClaiming",
        flowStatus: "open",
        lootSubmittedAt: "absent",
        acceptedResult: "absent",
        objectiveBasePoints: 0,
        objectiveSettlementPoints: "absent",
      },
      reestimate: {
        id: "obj-testd-review-loot-state-forbidden-reestimate",
        title: "E2E-REVIEW-LOOT-STATE-FORBIDDEN: 评估阶段目标",
        stage: "orfReestimate",
        flowStatus: "reestimating",
        lootSubmittedAt: "absent",
        acceptedResult: "absent",
        objectiveBasePoints: 0,
        objectiveSettlementPoints: "absent",
      },
      frozen: {
        id: "obj-testd-review-loot-state-forbidden-frozen",
        title: "E2E-REVIEW-LOOT-STATE-FORBIDDEN: 实施未提交战利品目标",
        stage: "goalFrozen",
        flowStatus: "frozen",
        lootSubmittedAt: "absent",
        acceptedResult: "absent",
        objectiveBasePoints: 0,
        objectiveSettlementPoints: "absent",
      },
      settled: {
        id: "obj-testd-review-loot-state-forbidden-settled",
        title: "E2E-REVIEW-LOOT-STATE-FORBIDDEN: 已结算目标",
        stage: "goalFrozen",
        flowStatus: "settled",
        lootSubmittedAt: "present",
        acceptedResult: "completed",
        objectiveBasePoints: 42,
        objectiveSettlementPoints: 42,
      },
    },
    result: {
      title: "E2E-REVIEW-LOOT-STATE-FORBIDDEN: 已结算前置指标",
      metricName: "E2E 管理员不可验收非待验收目标指标完成率",
      points: 42,
    },
    loot: {
      settled: {
        body: "E2E-REVIEW-LOOT-STATE-FORBIDDEN-BODY: 已结算前置战利品",
        submittedBy: "ORF Review Loot State Challenger E2E",
        evidenceText: "E2E-REVIEW-LOOT-STATE-FORBIDDEN-EVIDENCE: 已结算完成证据",
      },
    },
    reason: "E2E-REVIEW-LOOT-STATE-FORBIDDEN: 非待验收目标不可验收",
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
    description: "准备管理员、四个非待验收目标和已结算目标前置战利品，并以管理员身份完成登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.state_review_loot_ledger.delete_residue", title: "删除 reason 为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 非待验收目标不可验收` 的本用例残留测试积分流水", object: "db.state_review_loot_ledger", operator: "delete_residue" },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.state_review_loot.delete_residue", title: "删除内容为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN-BODY: 已结算前置战利品` 的本用例残留前置战利品", object: "db.state_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.state_review_loot_result.delete_residue", title: "删除标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 已结算前置指标` 的本用例残留前置指标", object: "db.state_review_loot_result", operator: "delete_residue" },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.state_review_loot_target.delete_residue", title: "删除本用例残留的四个非待验收目标及其派生数据", object: "db.state_review_loot_target", operator: "delete_residue" },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.admin_identity.upsert", title: "准备管理员认证身份，邮箱为 `orf-admin-review-loot-state-forbidden-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.admin.upsert", title: "准备管理员用户和默认团队成员关系，邮箱为 `orf-admin-review-loot-state-forbidden-e2e@orf.local`、角色为 `admin`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.result_claiming_review_loot_target.upsert", title: "创建标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 发布阶段目标`、流转状态为 `open`、阶段为 `resultClaiming` 的本用例发布阶段目标", object: "db.state_review_loot_target", operator: "upsert", params: { fixtureFrom: "data.targets.resultClaiming", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "resultClaimingTarget" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.reestimate_review_loot_target.upsert", title: "创建标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 评估阶段目标`、流转状态为 `reestimating`、阶段为 `orfReestimate` 的本用例评估阶段目标", object: "db.state_review_loot_target", operator: "upsert", params: { fixtureFrom: "data.targets.reestimate", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "reestimateTarget" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.frozen_review_loot_target.upsert", title: "创建标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 实施未提交战利品目标`、流转状态为 `frozen`、阶段为 `goalFrozen` 的本用例实施未提交战利品目标", object: "db.state_review_loot_target", operator: "upsert", params: { fixtureFrom: "data.targets.frozen", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "frozenTarget" } },
      { source: { caseStepId: "Setup-10", method: "prisma" }, id: "db.settled_review_loot_target.upsert", title: "创建标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 已结算目标`、流转状态为 `settled`、阶段为 `goalFrozen` 的本用例已结算目标", object: "db.state_review_loot_target", operator: "upsert", params: { fixtureFrom: "data.targets.settled", teamIdFrom: "runtime.adminUser.teamId", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "settledTarget" } },
      { source: { caseStepId: "Setup-11", method: "prisma" }, id: "db.settled_review_loot_result.create", title: "为本用例已结算目标创建标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 已结算前置指标`、指标积分为 `42` 的前置指标", object: "db.state_review_loot_result", operator: "create", params: { targetFrom: "runtime.settledTarget", resultFrom: "data.result", saveAs: "settledResult" } },
      { source: { caseStepId: "Setup-12", method: "prisma" }, id: "db.settled_review_loot.create", title: "为本用例已结算目标创建内容为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN-BODY: 已结算前置战利品` 的前置战利品", object: "db.state_review_loot", operator: "create", params: { targetFrom: "runtime.settledTarget", resultFrom: "runtime.settledResult", lootFrom: "data.loot.settled", saveAs: "settledLoot" } },
      { source: { caseStepId: "Setup-13", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "fill.admin_email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-17", method: "playwright" }, id: "fill.admin_password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-18", method: "playwright" }, id: "click.admin_sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.state_review_loot_login", operator: "submit_admin" },
    ],
  },

  S0: {
    description: "管理员已登录，四个本用例目标均处于非待验收状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.admin.authenticated", title: "当前会话 应为 邮箱 `orf-admin-review-loot-state-forbidden-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
      { source: { caseStepId: "S0-2", method: "prisma" }, id: "state_review_loot_targets.states", title: "四个本用例非待验收目标 应为 各自预设的流转状态、阶段、战利品提交时间和挑战者列表", object: "db.state_review_loot_target", operator: "states" },
      { source: { caseStepId: "S0-3", method: "prisma" }, id: "settled_review_loot_result.present", title: "本用例已结算目标 应存在 指标积分为 `42` 的前置指标", object: "db.state_review_loot_result", operator: "present", params: { targetFrom: "runtime.settledTarget", resultFrom: "runtime.settledResult" } },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "settled_review_loot.present", title: "本用例已结算目标 应存在 前置战利品", object: "db.state_review_loot", operator: "present", params: { targetFrom: "runtime.settledTarget", resultFrom: "runtime.settledResult", lootFrom: "runtime.settledLoot" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "state_review_loot_ledger.absent", title: "reason 为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 非待验收目标不可验收` 的测试积分流水 应不存在", object: "db.state_review_loot_ledger", operator: "absent" },
    ],
  },

  Action: {
    description: "管理员进入挑战工作台并查看所有挑战",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.tasks", title: "管理员打开挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "page.all_challenges.click", title: "管理员切换到 \"所有挑战\" 视图", object: "page", operator: "click", params: { role: "button", name: "所有挑战" } },
    ],
  },

  S1: {
    description: "四个非待验收目标可见，但验收战利品入口不可见，数据库验收状态不变化",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "all_challenges.view.available", title: "\"所有挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "所有挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "state_review_loot_targets.visible", title: "四个本用例非待验收目标面板 应均可见", object: "page.state_review_loot_targets", operator: "visible" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "state_review_loot_targets.review_action_absent", title: "四个本用例非待验收目标的 \"验收战利品\" 入口 应均不可见", object: "page.state_review_loot_targets", operator: "review_action_absent" },
      { source: { caseStepId: "S1-5", method: "api" }, id: "admin_workbench.targets_present", title: "管理员所有挑战工作台数据 应包含 四个本用例非待验收目标", object: "api.state_review_loot_workbench", operator: "targets_present" },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "state_review_loot_targets.states_unchanged", title: "四个本用例非待验收目标的流转状态、阶段、战利品提交时间和挑战者列表 应保持不变", object: "db.state_review_loot_target", operator: "states" },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "settled_review_loot.still_present", title: "本用例已结算目标 应仍存在 前置战利品", object: "db.state_review_loot", operator: "present", params: { targetFrom: "runtime.settledTarget", resultFrom: "runtime.settledResult", lootFrom: "runtime.settledLoot" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "state_review_loot_ledger.still_absent", title: "reason 为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 非待验收目标不可验收` 的测试积分流水 应仍不存在", object: "db.state_review_loot_ledger", operator: "absent" },
      { source: { caseStepId: "S1-9", method: "api" }, id: "session.admin.still_authenticated", title: "当前会话 应仍为 邮箱 `orf-admin-review-loot-state-forbidden-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
    ],
  },

  Clean: {
    description: "删除四个非待验收目标、前置指标、前置战利品、测试用户和浏览器运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.state_review_loot_ledger.delete", title: "删除 reason 为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 非待验收目标不可验收` 的本用例测试积分流水", object: "db.state_review_loot_ledger", operator: "delete_residue" },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.state_review_loot.delete", title: "删除内容为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN-BODY: 已结算前置战利品` 的本用例前置战利品", object: "db.state_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Clean-3", method: "prisma" }, id: "db.state_review_loot_result.delete", title: "删除标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 已结算前置指标` 的本用例前置指标", object: "db.state_review_loot_result", operator: "delete_residue" },
      { source: { caseStepId: "Clean-4", method: "prisma" }, id: "db.state_review_loot_target.delete", title: "删除本用例四个非待验收目标及其派生数据", object: "db.state_review_loot_target", operator: "delete_residue" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-6", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-7", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-review-loot-state-forbidden-e2e@orf.local` 的管理员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.admin.delete_membership", title: "删除邮箱为 `orf-admin-review-loot-state-forbidden-e2e@orf.local` 的管理员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.admin.delete", title: "删除邮箱为 `orf-admin-review-loot-state-forbidden-e2e@orf.local` 的管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.state_review_loot_ledger.absent", title: "reason 为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 非待验收目标不可验收` 的测试积分流水 应不存在", object: "db.state_review_loot_ledger", operator: "absent" },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.state_review_loot.absent", title: "内容为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN-BODY: 已结算前置战利品` 的前置战利品 应不存在", object: "db.state_review_loot", operator: "absent" },
      { source: { caseStepId: "Clean-14", method: "prisma" }, id: "db.state_review_loot_result.absent", title: "标题为 `E2E-REVIEW-LOOT-STATE-FORBIDDEN: 已结算前置指标` 的前置指标 应不存在", object: "db.state_review_loot_result", operator: "absent" },
      { source: { caseStepId: "Clean-15", method: "prisma" }, id: "db.state_review_loot_target.absent", title: "本用例四个非待验收目标 应不存在", object: "db.state_review_loot_target", operator: "absent" },
      { source: { caseStepId: "Clean-16", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-review-loot-state-forbidden-e2e@orf.local` 的管理员认证身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-17", method: "prisma" }, id: "db.admin.absent", title: "邮箱为 `orf-admin-review-loot-state-forbidden-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<AdminReviewLootStateForbiddenCaseData>;
