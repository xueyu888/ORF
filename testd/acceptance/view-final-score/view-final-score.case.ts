import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { ViewFinalScoreCaseData } from "./_support/view-final-score.context";

export const viewFinalScoreCase = {
  id: "acceptance.view-final-score",
  title: "查看最终分数",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "final-score", "member", "happy-path"],

  data: {
    primaryEmail: "orf-member-view-final-score-primary-e2e@orf.local",
    primaryPassword: "OrfMemberViewFinalScorePrimaryE2E!2026",
    primaryName: "ORF Member View Final Score Primary E2E",
    otherEmail: "orf-member-view-final-score-other-e2e@orf.local",
    otherPassword: "OrfMemberViewFinalScoreOtherE2E!2026",
    otherName: "ORF Member View Final Score Other E2E",
    memberRole: "member",
    cleanupEmails: ["orf-member-view-final-score-primary-e2e@orf.local", "orf-member-view-final-score-other-e2e@orf.local"],
    primaryMemberNames: ["ORF Member View Final Score Primary E2E"],
    otherMemberNames: ["ORF Member View Final Score Other E2E"],
    primaryObjectiveId: "obj-testd-view-final-score-primary",
    primaryObjectiveTitle: "E2E-VIEW-FINAL-SCORE: 登录成员目标前置",
    otherObjectiveId: "obj-testd-view-final-score-other",
    otherObjectiveTitle: "E2E-VIEW-FINAL-SCORE: 其他成员目标前置",
    primaryPoints: 42,
    otherPoints: 28,
    primaryLedgerId: "points-testd-view-final-score-primary",
    otherLedgerId: "points-testd-view-final-score-other",
    reason: "E2E-FINAL-SCORE: 查看最终分数",
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
    description: "准备两个互不共享目标的普通成员账号、两个 settled 目标和两条积分流水，登录其中一个普通成员",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.final_score_ledger.delete_residue", title: "删除本用例残留的测试积分流水，积分流水 reason 为 `E2E-FINAL-SCORE: 查看最终分数`", object: "db.final_score_ledger", operator: "delete", params: { reasonFrom: "data.reason" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.primary_objective.delete_residue", title: "删除标题为 `E2E-VIEW-FINAL-SCORE: 登录成员目标前置` 的本用例残留登录成员目标及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.primaryObjectiveTitle" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.other_objective.delete_residue", title: "删除标题为 `E2E-VIEW-FINAL-SCORE: 其他成员目标前置` 的本用例残留其他成员目标及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.otherObjectiveTitle" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.primary_member_identity.upsert", title: "准备登录普通成员认证身份，邮箱为 `orf-member-view-final-score-primary-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.primaryEmail", nameFrom: "data.primaryName", passwordFrom: "data.primaryPassword", saveAs: "primaryMemberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.primary_member.upsert", title: "准备登录普通成员用户和默认团队成员关系，邮箱为 `orf-member-view-final-score-primary-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.primaryEmail", nameFrom: "data.primaryName", roleFrom: "data.memberRole", status: "active", identityIdFrom: "runtime.primaryMemberIdentity.id", saveAs: "primaryMemberUser" } },
      { source: { caseStepId: "Setup-6", method: "api" }, id: "ory.other_member_identity.upsert", title: "准备其他普通成员认证身份，邮箱为 `orf-member-view-final-score-other-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.otherEmail", nameFrom: "data.otherName", passwordFrom: "data.otherPassword", saveAs: "otherMemberIdentity" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.other_member.upsert", title: "准备其他普通成员用户和默认团队成员关系，邮箱为 `orf-member-view-final-score-other-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.otherEmail", nameFrom: "data.otherName", roleFrom: "data.memberRole", status: "active", identityIdFrom: "runtime.otherMemberIdentity.id", saveAs: "otherMemberUser" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.primary_objective.upsert_final_score_target", title: "创建本用例登录成员独占目标，标题为 `E2E-VIEW-FINAL-SCORE: 登录成员目标前置`", object: "db.objective", operator: "upsert", params: { idFrom: "data.primaryObjectiveId", titleFrom: "data.primaryObjectiveTitle", teamIdFrom: "runtime.primaryMemberUser.teamId", stage: "goalFrozen", flowStatus: "settled", status: "Draft", saveAs: "primaryFixtureObjective" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.primary_final_score_target.prepare", title: "设置本用例登录成员独占目标为 `settled`，挑战者仅包含登录普通成员，目标结算积分为 `42`", object: "db.final_score_target", operator: "prepare", params: { objectiveIdFrom: "runtime.primaryFixtureObjective.id", memberNamesFrom: "data.primaryMemberNames", pointsFrom: "data.primaryPoints", saveAs: "primaryFinalScoreTarget" } },
      { source: { caseStepId: "Setup-10", method: "prisma" }, id: "db.primary_final_score_ledger.create", title: "创建登录普通成员对本用例登录成员独占目标的测试积分流水，积分为 `42`", object: "db.final_score_ledger", operator: "create", params: { idFrom: "data.primaryLedgerId", targetFrom: "runtime.primaryFinalScoreTarget", userIdFrom: "runtime.primaryMemberUser.userId", memberNameFrom: "data.primaryName", pointsFrom: "data.primaryPoints", reasonFrom: "data.reason", saveAs: "primaryFinalScoreLedger" } },
      { source: { caseStepId: "Setup-11", method: "prisma" }, id: "db.other_objective.upsert_final_score_target", title: "创建本用例其他成员独占目标，标题为 `E2E-VIEW-FINAL-SCORE: 其他成员目标前置`", object: "db.objective", operator: "upsert", params: { idFrom: "data.otherObjectiveId", titleFrom: "data.otherObjectiveTitle", teamIdFrom: "runtime.primaryMemberUser.teamId", stage: "goalFrozen", flowStatus: "settled", status: "Draft", saveAs: "otherFixtureObjective" } },
      { source: { caseStepId: "Setup-12", method: "prisma" }, id: "db.other_final_score_target.prepare", title: "设置本用例其他成员独占目标为 `settled`，挑战者仅包含其他普通成员，目标结算积分为 `28`", object: "db.final_score_target", operator: "prepare", params: { objectiveIdFrom: "runtime.otherFixtureObjective.id", memberNamesFrom: "data.otherMemberNames", pointsFrom: "data.otherPoints", saveAs: "otherFinalScoreTarget" } },
      { source: { caseStepId: "Setup-13", method: "prisma" }, id: "db.other_final_score_ledger.create", title: "创建其他普通成员对本用例其他成员独占目标的测试积分流水，积分为 `28`", object: "db.final_score_ledger", operator: "create", params: { idFrom: "data.otherLedgerId", targetFrom: "runtime.otherFinalScoreTarget", userIdFrom: "runtime.otherMemberUser.userId", memberNameFrom: "data.otherName", pointsFrom: "data.otherPoints", reasonFrom: "data.reason", saveAs: "otherFinalScoreLedger" } },
      { source: { caseStepId: "Setup-14", method: "api" }, id: "ory.primary_member_sessions.revoke", title: "撤销登录普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.primaryEmail" } },
      { source: { caseStepId: "Setup-15", method: "api" }, id: "ory.other_member_sessions.revoke", title: "撤销其他普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.otherEmail" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-17", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-18", method: "playwright" }, id: "fill.primary_email", title: "在邮箱输入框输入登录普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.primaryEmail" } },
      { source: { caseStepId: "Setup-19", method: "playwright" }, id: "fill.primary_password", title: "在密码输入框输入登录普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.primaryPassword" } },
      { source: { caseStepId: "Setup-20", method: "playwright" }, id: "click.sign_in", title: "点击 `Sign In` 登录操作", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { source: { caseStepId: "Setup-21", method: "api" }, id: "session.primary_member.authenticated", title: "当前会话 应为 登录普通成员的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.primaryEmail", roleFrom: "data.memberRole", status: "active" } },
    ],
  },

  S0: {
    description: "登录普通成员已登录，两个互不共享目标已结算且两个成员的积分流水存在",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.primary_member.authenticated", title: "当前会话 应为 邮箱 `orf-member-view-final-score-primary-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.primaryEmail", roleFrom: "data.memberRole", status: "active" } },
      { source: { caseStepId: "S0-2", method: "prisma" }, id: "db.primary_final_score_target.settled_for_primary_member", title: "本用例登录成员独占目标 应为 `settled`，且挑战者仅包含登录普通成员", object: "db.final_score_target", operator: "settled_for_member", params: { targetFrom: "runtime.primaryFinalScoreTarget", memberNameFrom: "data.primaryName" } },
      { source: { caseStepId: "S0-3", method: "prisma" }, id: "db.other_final_score_target.settled_for_other_member", title: "本用例其他成员独占目标 应为 `settled`，且挑战者仅包含其他普通成员", object: "db.final_score_target", operator: "settled_for_member", params: { targetFrom: "runtime.otherFinalScoreTarget", memberNameFrom: "data.otherName" } },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "db.primary_final_score_ledger.present", title: "数据库中 应存在 登录普通成员对本用例登录成员独占目标的测试积分流水，积分为 `42`", object: "db.final_score_ledger", operator: "present", params: { targetFrom: "runtime.primaryFinalScoreTarget", memberNameFrom: "data.primaryName", pointsFrom: "data.primaryPoints" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.other_final_score_ledger.present", title: "数据库中 应存在 其他普通成员对本用例其他成员独占目标的测试积分流水，积分为 `28`", object: "db.final_score_ledger", operator: "present", params: { targetFrom: "runtime.otherFinalScoreTarget", memberNameFrom: "data.otherName", pointsFrom: "data.otherPoints" } },
    ],
  },

  Action: {
    description: "登录普通成员打开统计页面查看所有成员最终分数",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.reports", title: "登录普通成员打开统计页面", object: "page", operator: "goto", params: { path: "/reports" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "click.all_time", title: "登录普通成员点击统计页面的 `全部` 时间范围按钮", object: "page", operator: "click", params: { role: "button", name: "全部", exact: true } },
    ],
  },

  S1: {
    description: "统计页面展示两个无共同目标普通成员的最终分数，数据库积分流水保持一致",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.reports", title: "当前页面 应为 统计页面", object: "page.url", operator: "match", params: { pattern: "/reports$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "page.primary_final_score.visible", title: "成员积分排行榜中登录普通成员所在行 应显示最终积分 `42.0`", object: "page.final_score", operator: "visible", params: { memberNameFrom: "data.primaryName", pointsFrom: "data.primaryPoints" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "page.other_final_score.visible", title: "成员积分排行榜中其他普通成员所在行 应显示最终积分 `28.0`", object: "page.final_score", operator: "visible", params: { memberNameFrom: "data.otherName", pointsFrom: "data.otherPoints" } },
      { source: { caseStepId: "S1-4", method: "prisma" }, id: "db.primary_final_score_ledger.present", title: "数据库中 登录普通成员对本用例登录成员独占目标的测试积分流水 应保持为 `42`", object: "db.final_score_ledger", operator: "present", params: { targetFrom: "runtime.primaryFinalScoreTarget", memberNameFrom: "data.primaryName", pointsFrom: "data.primaryPoints" } },
      { source: { caseStepId: "S1-5", method: "prisma" }, id: "db.other_final_score_ledger.present", title: "数据库中 其他普通成员对本用例其他成员独占目标的测试积分流水 应保持为 `28`", object: "db.final_score_ledger", operator: "present", params: { targetFrom: "runtime.otherFinalScoreTarget", memberNameFrom: "data.otherName", pointsFrom: "data.otherPoints" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "session.primary_member.still_authenticated", title: "当前会话 应仍为 登录普通成员的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.primaryEmail", roleFrom: "data.memberRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除本用例创建的积分流水、两个目标、两个普通成员账号和页面会话状态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.final_score_ledger.delete", title: "删除本用例创建的测试积分流水", object: "db.final_score_ledger", operator: "delete", params: { reasonFrom: "data.reason" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.primary_objective.delete", title: "删除本用例登录成员独占目标及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "data.primaryObjectiveId", titleFrom: "data.primaryObjectiveTitle" } },
      { source: { caseStepId: "Clean-3", method: "prisma" }, id: "db.other_objective.delete", title: "删除本用例其他成员独占目标及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "data.otherObjectiveId", titleFrom: "data.otherObjectiveTitle" } },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.primary_member_sessions.revoke", title: "撤销登录普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.primaryEmail" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.other_member_sessions.revoke", title: "撤销其他普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.otherEmail" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "ory.primary_member_identity.delete", title: "删除登录普通成员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.primaryEmail" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.other_member_identity.delete", title: "删除其他普通成员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.otherEmail" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.members.delete_memberships", title: "删除两个普通成员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailsFrom: "data.cleanupEmails" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.members.delete", title: "删除两个普通成员用户", object: "db.user", operator: "delete", params: { emailsFrom: "data.cleanupEmails" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.final_score_ledger.absent", title: "reason 为 `E2E-FINAL-SCORE: 查看最终分数` 的测试积分流水 应不存在", object: "db.final_score_ledger", operator: "absent", params: { reasonFrom: "data.reason" } },
      { source: { caseStepId: "Clean-14", method: "prisma" }, id: "db.primary_objective.absent", title: "标题为 `E2E-VIEW-FINAL-SCORE: 登录成员目标前置` 的本用例登录成员目标 应不存在", object: "db.objective", operator: "absent", params: { idFrom: "data.primaryObjectiveId", titleFrom: "data.primaryObjectiveTitle" } },
      { source: { caseStepId: "Clean-15", method: "prisma" }, id: "db.other_objective.absent", title: "标题为 `E2E-VIEW-FINAL-SCORE: 其他成员目标前置` 的本用例其他成员目标 应不存在", object: "db.objective", operator: "absent", params: { idFrom: "data.otherObjectiveId", titleFrom: "data.otherObjectiveTitle" } },
      { source: { caseStepId: "Clean-16", method: "prisma" }, id: "db.members.absent", title: "登录普通成员和其他普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailsFrom: "data.cleanupEmails" } },
    ],
  },
} satisfies StateCaseSpec<ViewFinalScoreCaseData>;
