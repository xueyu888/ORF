import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MemberSubmitLootStageForbiddenCaseData } from "./_support/member-submit-loot-stage-forbidden.context";

export const memberSubmitLootStageForbiddenCase = {
  id: "acceptance.member-submit-loot.stage-forbidden",
  title: "成员提交战利品-发布和评估阶段不可提交",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "loot", "stage", "negative-path"],

  data: {
    email: "orf-member-loot-stage-forbidden-e2e@orf.local",
    password: "OrfMemberLootStageForbiddenE2E!2026",
    name: "ORF Member Loot Stage Forbidden E2E",
    role: "member",
    targets: {
      resultClaiming: {
        id: "obj-testd-loot-stage-forbidden-result-claiming",
        title: "E2E-LOOT-STAGE-FORBIDDEN: 发布阶段目标",
        stage: "resultClaiming",
        flowStatus: "open",
        confirmedAt: "absent",
      },
      reestimate: {
        id: "obj-testd-loot-stage-forbidden-reestimate",
        title: "E2E-LOOT-STAGE-FORBIDDEN: 评估阶段目标",
        stage: "orfReestimate",
        flowStatus: "reestimating",
        confirmedAt: "absent",
      },
    },
    results: {
      resultClaiming: {
        title: "E2E-LOOT-STAGE-FORBIDDEN: 发布阶段前置指标",
        metricName: "E2E 提交战利品发布阶段边界指标完成率",
      },
      reestimate: {
        title: "E2E-LOOT-STAGE-FORBIDDEN: 评估阶段前置指标",
        metricName: "E2E 提交战利品评估阶段边界指标完成率",
      },
    },
    lootBody: "E2E-LOOT-STAGE-FORBIDDEN-BODY: 非实施阶段完成说明",
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
    description: "准备普通成员、发布阶段目标、评估阶段目标和各自前置指标，并以普通成员身份完成登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.stage_loot.delete_residue", title: "删除 本用例残留的非实施阶段测试战利品", object: "db.stage_loot", operator: "delete", params: { bodyFrom: "data.lootBody" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.stage_loot_result.delete_residue", title: "删除 本用例残留的非实施阶段前置指标", object: "db.stage_loot_result", operator: "delete_residue" },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.stage_loot_target.delete_residue", title: "删除 本用例残留的非实施阶段目标及其派生数据", object: "db.stage_loot_target", operator: "delete_residue" },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.member.upsert", title: "准备邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户和默认团队成员关系", object: "db.user", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.result_claiming_loot_target.upsert", title: "创建标题为 `E2E-LOOT-STAGE-FORBIDDEN: 发布阶段目标`、流转状态为 `open`、阶段为 `resultClaiming` 的本用例发布阶段目标", object: "db.stage_loot_target", operator: "upsert", params: { fixtureFrom: "data.targets.resultClaiming", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "resultClaimingTarget" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.result_claiming_loot_result.create", title: "为本用例发布阶段目标创建标题为 `E2E-LOOT-STAGE-FORBIDDEN: 发布阶段前置指标` 的前置指标", object: "db.stage_loot_result", operator: "create", params: { targetFrom: "runtime.resultClaimingTarget", resultFrom: "data.results.resultClaiming", saveAs: "resultClaimingResult" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.reestimate_loot_target.upsert", title: "创建标题为 `E2E-LOOT-STAGE-FORBIDDEN: 评估阶段目标`、流转状态为 `reestimating`、阶段为 `orfReestimate` 的本用例评估阶段目标", object: "db.stage_loot_target", operator: "upsert", params: { fixtureFrom: "data.targets.reestimate", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "reestimateTarget" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.reestimate_loot_result.create", title: "为本用例评估阶段目标创建标题为 `E2E-LOOT-STAGE-FORBIDDEN: 评估阶段前置指标` 的前置指标", object: "db.stage_loot_result", operator: "create", params: { targetFrom: "runtime.reestimateTarget", resultFrom: "data.results.reestimate", saveAs: "reestimateResult" } },
      { source: { caseStepId: "Setup-10", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-13", method: "playwright" }, id: "fill.member_email", title: "在邮箱输入框输入普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "fill.member_password", title: "在密码输入框输入普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "click.member_sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.stage_login", operator: "submit_member" },
    ],
  },

  S0: {
    description: "普通成员已登录，发布阶段目标和评估阶段目标均包含该普通成员为挑战者",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.member.authenticated", title: "当前会话 应为 邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
      { source: { caseStepId: "S0-2", method: "prisma" }, id: "stage_targets.states", title: "两个本用例非实施阶段目标 应为 各自预设的流转状态、阶段、冻结确认时间为空且挑战者仅包含 \"ORF Member Loot Stage Forbidden E2E\"", object: "db.stage_loot_target", operator: "states" },
      { source: { caseStepId: "S0-3", method: "prisma" }, id: "stage_results.present", title: "两个本用例非实施阶段目标 应均存在 前置指标", object: "db.stage_loot_result", operator: "all_present" },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "stage_loot.absent", title: "两个本用例非实施阶段目标 应不存在 非实施阶段测试战利品", object: "db.stage_loot", operator: "absent", params: { bodyFrom: "data.lootBody" } },
    ],
  },

  Action: {
    description: "普通成员进入挑战工作台",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.tasks", title: "普通成员打开 挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
    ],
  },

  S1: {
    description: "发布阶段目标和评估阶段目标可见，但提交战利品入口不可见，数据库不新增战利品",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "my_challenges.view.available", title: "\"我的挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "stage_targets.visible", title: "两个本用例非实施阶段目标面板 应均可见", object: "page.stage_loot_targets", operator: "visible" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "stage_targets.submit_action_absent", title: "两个本用例非实施阶段目标的 \"提交战利品\" 入口 应均不可见", object: "page.stage_loot_targets", operator: "submit_action_absent" },
      { source: { caseStepId: "S1-5", method: "api" }, id: "member_workbench.targets_present", title: "普通成员挑战工作台数据 应包含 两个本用例非实施阶段目标", object: "api.stage_member_workbench", operator: "targets_present" },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "stage_targets.states_unchanged", title: "两个本用例非实施阶段目标的流转状态、阶段、冻结确认时间和挑战者列表 应保持不变", object: "db.stage_loot_target", operator: "states" },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "stage_results.still_present", title: "两个本用例非实施阶段目标 应仍存在 前置指标", object: "db.stage_loot_result", operator: "all_present" },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "stage_loot.still_absent", title: "两个本用例非实施阶段目标 应仍不存在 非实施阶段测试战利品", object: "db.stage_loot", operator: "absent", params: { bodyFrom: "data.lootBody" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "session.member.still_authenticated", title: "当前会话 应仍为 邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
    ],
  },

  Clean: {
    description: "删除非实施阶段目标、前置指标、测试用户和浏览器运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.stage_loot.delete", title: "删除 本用例残留的非实施阶段测试战利品", object: "db.stage_loot", operator: "delete", params: { bodyFrom: "data.lootBody" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.stage_loot_result.delete", title: "删除 本用例非实施阶段前置指标", object: "db.stage_loot_result", operator: "delete_residue" },
      { source: { caseStepId: "Clean-3", method: "prisma" }, id: "db.stage_loot_target.delete", title: "删除 本用例非实施阶段目标及其派生数据", object: "db.stage_loot_target", operator: "delete_residue" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local` 的普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member.delete_membership", title: "删除邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local` 的普通成员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.member.delete", title: "删除邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local` 的普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.stage_loot.absent", title: "应不存在 本用例非实施阶段测试战利品", object: "db.stage_loot", operator: "absent", params: { bodyFrom: "data.lootBody" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.stage_loot_result.absent", title: "应不存在 本用例非实施阶段前置指标", object: "db.stage_loot_result", operator: "absent" },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.stage_loot_target.absent", title: "应不存在 本用例非实施阶段目标", object: "db.stage_loot_target", operator: "absent" },
      { source: { caseStepId: "Clean-14", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-15", method: "prisma" }, id: "db.member.absent", title: "邮箱为 `orf-member-loot-stage-forbidden-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<MemberSubmitLootStageForbiddenCaseData>;
