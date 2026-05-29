import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminReviewLootMemberForbiddenCaseData } from "./_support/admin-review-loot-member-forbidden.context";

export const adminReviewLootMemberForbiddenCase = {
  id: "acceptance.admin-review-loot.member-forbidden",
  title: "管理员验收战利品-普通成员不可验收",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "review-loot", "permission", "negative-path"],

  data: {
    email: "orf-member-review-loot-forbidden-e2e@orf.local",
    password: "OrfMemberReviewLootForbiddenE2E!2026",
    name: "ORF Member Review Loot Forbidden E2E",
    role: "member",
    target: {
      id: "obj-testd-review-loot-member-forbidden",
      title: "E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 待验收目标",
      stage: "goalFrozen",
      flowStatus: "submitted",
      lootSubmittedAt: "present",
      acceptedResult: "absent",
      objectiveBasePoints: 0,
      objectiveSettlementPoints: "absent",
    },
    result: {
      title: "E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 前置指标",
      metricName: "E2E 普通成员不可验收战利品指标完成率",
      points: 42,
    },
    loot: {
      body: "E2E-REVIEW-LOOT-MEMBER-FORBIDDEN-BODY: 普通成员提交的战利品说明",
      submittedBy: "ORF Member Review Loot Forbidden E2E",
      evidenceText: "E2E-REVIEW-LOOT-MEMBER-FORBIDDEN-EVIDENCE: 完成证据",
    },
    reason: "E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 普通成员不可验收",
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
    description: "准备普通成员、待验收目标、前置指标和前置战利品，并以普通成员身份完成登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.member_review_loot_ledger.delete_residue", title: "删除 reason 为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 普通成员不可验收` 的本用例残留测试积分流水", object: "db.member_review_loot_ledger", operator: "delete_residue" },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.member_review_loot.delete_residue", title: "删除内容为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN-BODY: 普通成员提交的战利品说明` 的本用例残留测试战利品", object: "db.member_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_review_loot_result.delete_residue", title: "删除标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 前置指标` 的本用例残留前置指标", object: "db.member_review_loot_result", operator: "delete_residue" },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.member_review_loot_target.delete_residue", title: "删除标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 待验收目标` 的本用例残留目标及其派生数据", object: "db.member_review_loot_target", operator: "delete_residue" },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.member_identity.upsert", title: "准备普通成员认证身份，邮箱为 `orf-member-review-loot-forbidden-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.member.upsert", title: "准备普通成员用户和默认团队成员关系，邮箱为 `orf-member-review-loot-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.member_review_loot_target.upsert", title: "创建标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 待验收目标`、流转状态为 `submitted`、阶段为 `goalFrozen` 的本用例待验收目标", object: "db.member_review_loot_target", operator: "upsert", params: { fixtureFrom: "data.target", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "reviewLootTarget" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.member_review_loot_result.create", title: "为本用例待验收目标创建标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 前置指标`、指标积分为 `42` 的前置指标", object: "db.member_review_loot_result", operator: "create", params: { targetFrom: "runtime.reviewLootTarget", resultFrom: "data.result", saveAs: "reviewLootResult" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.member_review_loot.create", title: "为本用例待验收目标创建普通成员提交的前置战利品，前置指标声明为 `completed`", object: "db.member_review_loot", operator: "create", params: { targetFrom: "runtime.reviewLootTarget", resultFrom: "runtime.reviewLootResult", lootFrom: "data.loot", saveAs: "reviewLoot" } },
      { source: { caseStepId: "Setup-10", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-13", method: "playwright" }, id: "fill.member_email", title: "在邮箱输入框输入普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "fill.member_password", title: "在密码输入框输入普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "click.member_sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.member_review_loot_login", operator: "submit_member" },
    ],
  },

  S0: {
    description: "普通成员已登录，目标处于待验收状态且存在普通成员提交的前置战利品",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.member.authenticated", title: "当前会话 应为 邮箱 `orf-member-review-loot-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
      { source: { caseStepId: "S0-2", method: "prisma" }, id: "member_review_loot_target.submitted", title: "本用例待验收目标 应为 `submitted`，阶段为 `goalFrozen`，战利品提交时间已存在，挑战者仅包含普通成员", object: "db.member_review_loot_target", operator: "submitted", params: { fixtureFrom: "data.target" } },
      { source: { caseStepId: "S0-3", method: "prisma" }, id: "member_review_loot_result.present", title: "本用例待验收目标 应存在 指标积分为 `42` 的前置指标", object: "db.member_review_loot_result", operator: "present", params: { targetFrom: "runtime.reviewLootTarget", resultFrom: "runtime.reviewLootResult" } },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "member_review_loot.present", title: "本用例待验收目标 应存在 普通成员提交的前置战利品，且前置指标声明为 `completed`", object: "db.member_review_loot", operator: "present", params: { targetFrom: "runtime.reviewLootTarget", resultFrom: "runtime.reviewLootResult", lootFrom: "runtime.reviewLoot" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "member_review_loot_ledger.absent", title: "reason 为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 普通成员不可验收` 的测试积分流水 应不存在", object: "db.member_review_loot_ledger", operator: "absent" },
    ],
  },

  Action: {
    description: "普通成员进入挑战工作台",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.tasks", title: "普通成员打开挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
    ],
  },

  S1: {
    description: "普通成员可看到本用例待验收目标，但看不到验收战利品入口，数据库验收状态不变化",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "my_challenges.view.available", title: "\"我的挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "member_review_loot_target.visible", title: "本用例待验收目标面板 应可见", object: "page.member_review_loot_target", operator: "visible" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "member_review_loot_target.review_action_absent", title: "本用例待验收目标的 \"验收战利品\" 入口 应不可见", object: "page.member_review_loot_target", operator: "review_action_absent" },
      { source: { caseStepId: "S1-5", method: "api" }, id: "member_workbench.target_present", title: "普通成员挑战工作台数据 应包含 本用例待验收目标", object: "api.member_review_loot_workbench", operator: "target_present" },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "member_review_loot_target.states", title: "本用例待验收目标的流转状态、阶段、战利品提交时间和挑战者列表 应保持不变", object: "db.member_review_loot_target", operator: "states" },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "member_review_loot_result.unreviewed", title: "本用例前置指标的验收结果 应仍为 `unreviewed`", object: "db.member_review_loot_result", operator: "unreviewed", params: { resultFrom: "runtime.reviewLootResult" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "member_review_loot.still_present", title: "本用例待验收目标 应仍存在 普通成员提交的前置战利品", object: "db.member_review_loot", operator: "present", params: { targetFrom: "runtime.reviewLootTarget", resultFrom: "runtime.reviewLootResult", lootFrom: "runtime.reviewLoot" } },
      { source: { caseStepId: "S1-9", method: "prisma" }, id: "member_review_loot_ledger.still_absent", title: "reason 为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 普通成员不可验收` 的测试积分流水 应仍不存在", object: "db.member_review_loot_ledger", operator: "absent" },
      { source: { caseStepId: "S1-10", method: "api" }, id: "session.member.still_authenticated", title: "当前会话 应仍为 邮箱 `orf-member-review-loot-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
    ],
  },

  Clean: {
    description: "删除待验收目标、前置指标、前置战利品、测试用户和浏览器运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.member_review_loot_ledger.delete", title: "删除 reason 为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 普通成员不可验收` 的本用例测试积分流水", object: "db.member_review_loot_ledger", operator: "delete_residue" },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.member_review_loot.delete", title: "删除内容为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN-BODY: 普通成员提交的战利品说明` 的本用例测试战利品", object: "db.member_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Clean-3", method: "prisma" }, id: "db.member_review_loot_result.delete", title: "删除标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 前置指标` 的本用例前置指标", object: "db.member_review_loot_result", operator: "delete_residue" },
      { source: { caseStepId: "Clean-4", method: "prisma" }, id: "db.member_review_loot_target.delete", title: "删除标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 待验收目标` 的本用例目标及其派生数据", object: "db.member_review_loot_target", operator: "delete_residue" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-6", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-7", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-review-loot-forbidden-e2e@orf.local` 的普通成员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.member.delete_membership", title: "删除邮箱为 `orf-member-review-loot-forbidden-e2e@orf.local` 的普通成员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.member.delete", title: "删除邮箱为 `orf-member-review-loot-forbidden-e2e@orf.local` 的普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.member_review_loot_ledger.absent", title: "reason 为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 普通成员不可验收` 的测试积分流水 应不存在", object: "db.member_review_loot_ledger", operator: "absent" },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.member_review_loot.absent", title: "内容为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN-BODY: 普通成员提交的战利品说明` 的测试战利品 应不存在", object: "db.member_review_loot", operator: "absent" },
      { source: { caseStepId: "Clean-14", method: "prisma" }, id: "db.member_review_loot_result.absent", title: "标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 前置指标` 的前置指标 应不存在", object: "db.member_review_loot_result", operator: "absent" },
      { source: { caseStepId: "Clean-15", method: "prisma" }, id: "db.member_review_loot_target.absent", title: "标题为 `E2E-REVIEW-LOOT-MEMBER-FORBIDDEN: 待验收目标` 的本用例目标 应不存在", object: "db.member_review_loot_target", operator: "absent" },
      { source: { caseStepId: "Clean-16", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-review-loot-forbidden-e2e@orf.local` 的普通成员认证身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-17", method: "prisma" }, id: "db.member.absent", title: "邮箱为 `orf-member-review-loot-forbidden-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<AdminReviewLootMemberForbiddenCaseData>;
