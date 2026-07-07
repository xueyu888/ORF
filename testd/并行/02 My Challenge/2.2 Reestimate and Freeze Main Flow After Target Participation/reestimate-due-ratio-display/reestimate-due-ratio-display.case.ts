import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { ReestimateDueRatioCaseData } from "./_support/reestimate-due-ratio-display.context";

export const reestimateDueRatioDisplayCase = {
  id: "target.reestimate-due-ratio-display",
  title: "重估完成期限按剩余验收周期50%计算并展示",
  model: STATE_CASE_MODEL,
  tags: ["target", "reestimate", "member", "deadline"],

  data: {
    memberEmail: "orf-member-reestimate-due-ratio-e2e@orf.local",
    memberPassword: "OrfMemberReestimateDueRatioE2E!2026",
    memberName: "ORF Member Reestimate Due Ratio E2E",
    memberRole: "member",
    memberStatus: "active",
    targetPrefix: "E2E-TARGET-REESTIMATE-DUE-RATIO",
    target: {
      title: "E2E-TARGET-REESTIMATE-DUE-RATIO",
      stage: "resultClaiming",
      flowStatus: "recruiting",
      finalDueOffsetDays: 8,
    },
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
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-REESTIMATE-DUE-RATIO` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-reestimate-due-ratio-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Reestimate Due Ratio E2E` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.recruited_objective.prepare", title: "准备 标题为 `E2E-TARGET-REESTIMATE-DUE-RATIO`、阶段为 `resultClaiming`、流转状态为 `recruiting`、最终验收截止日为运行时当前日期后 `8` 天、待响应征召挑战者包含本用例普通成员、当前挑战者不包含本用例普通成员的目标", object: "db.recruited_objective_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.target", saveAs: "objective" } },
      { source: { caseStepId: "Setup-5", method: "playwright" }, id: "auth.login.member", title: "使用 本用例普通成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-reestimate-due-ratio-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Reestimate Due Ratio E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.recruited_objective.exists", title: "应存在 标题为 `E2E-TARGET-REESTIMATE-DUE-RATIO`、阶段为 `resultClaiming`、流转状态为 `recruiting` 的目标", object: "db.recruited_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.recruited_objective.final_due_offset", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的最终验收截止日 应为运行时当前日期后 `8` 天", object: "db.recruited_objective_fixture", operator: "final_due_offset_matches", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.recruited_objective.assigned_contains", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的待响应征召挑战者 应包含本用例普通成员", object: "db.recruited_objective_fixture", operator: "assigned_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.recruited_objective.challenger_excludes", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的当前挑战者 应不包含本用例普通成员", object: "db.recruited_objective_fixture", operator: "challenger_excludes", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.recruited_objective.accepted_at_absent", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的接受时间 应不存在", object: "db.recruited_objective_fixture", operator: "accepted_at_absent", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.recruited_objective.reestimate_due_absent", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的重估完成期限 应不存在", object: "db.recruited_objective_fixture", operator: "reestimate_due_absent", params: { targetFrom: "data.target" } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "member.open_bounty_related", title: "普通成员打开 悬赏大厅的 \"我的相关\" 视图", object: "page.bounty_hall", operator: "open_related" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "member.accept_recruited_objective", title: "点击目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的 \"接受挑战\" 操作", object: "page.bounty_hall.objective", operator: "accept", params: { titleFrom: "data.target.title", saveAs: "acceptedObjective" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "member.open_my_challenges", title: "普通成员打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-REESTIMATE-DUE-RATIO`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "objective.status.reestimating", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的状态 应显示为 重估中", object: "page.challenge_objective", operator: "status_visible", params: { titleFrom: "data.target.title", statusLabel: "重估中" } },
      { source: { caseStepId: "S1-5", method: "prisma" }, id: "db.reestimate_objective.flow", title: "标题为 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的目标阶段 应为 `orfReestimate`，流转状态 应为 `reestimating`", object: "db.reestimate_objective", operator: "stage_flow_matches", params: { titleFrom: "data.target.title", stage: "orfReestimate", flowStatus: "reestimating" } },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.reestimate_objective.challenger_contains", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的当前挑战者 应包含本用例普通成员", object: "db.reestimate_objective", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.reestimate_objective.accepted_at_present", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的接受时间 应存在", object: "db.reestimate_objective", operator: "accepted_at_present", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "db.reestimate_objective.due_rule", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的重估完成期限 应等于 接受时间到最终验收截止日当日 `23:59` 的剩余验收周期按 `50%` 比例并以 `12` 小时粒度取整后的时间", object: "db.reestimate_objective", operator: "reestimate_due_matches_rule", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "api.my_challenges.contains_objective", title: "我的挑战数据 应包含目标 `E2E-TARGET-REESTIMATE-DUE-RATIO`", object: "api.my_challenges", operator: "contains_objective", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.my_challenges.stage_flow", title: "我的挑战数据中目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的阶段 应为 `orfReestimate`，流转状态 应为 `reestimating`", object: "api.my_challenges", operator: "objective_stage_flow_matches", params: { titleFrom: "data.target.title", stage: "orfReestimate", flowStatus: "reestimating" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.my_challenges.due_rule", title: "我的挑战数据中目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的重估完成期限 应等于 接受时间到最终验收截止日当日 `23:59` 的剩余验收周期按 `50%` 比例并以 `12` 小时粒度取整后的时间", object: "api.my_challenges", operator: "objective_reestimate_due_matches_rule", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-12", method: "playwright" }, id: "page.time_summary.reestimate_visible", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的时间摘要 应显示 重估剩余时间", object: "page.objective_time_summary", operator: "reestimate_remaining_visible", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-13", method: "playwright" }, id: "page.time_summary.reestimate_due_tooltip", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的时间摘要提示 应显示 按 `50%` 规则计算出的重估截止时间", object: "page.objective_time_summary", operator: "reestimate_due_tooltip_matches_rule", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-14", method: "playwright" }, id: "page.time_summary.final_visible", title: "目标 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的时间摘要 应显示 最终剩余时间", object: "page.objective_time_summary", operator: "final_remaining_visible", params: { titleFrom: "data.target.title" } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-REESTIMATE-DUE-RATIO` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前普通成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-REESTIMATE-DUE-RATIO` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-reestimate-due-ratio-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-reestimate-due-ratio-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<ReestimateDueRatioCaseData>;
