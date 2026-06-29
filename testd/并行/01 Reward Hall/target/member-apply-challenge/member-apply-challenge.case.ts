import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberApplyChallengeCaseData } from "./_support/member-apply-challenge.context";

export const memberApplyChallengeCase = {
  id: "reward-hall.member-apply-challenge",
  title: "非指挥官可以主动申请挑战",
  model: STATE_CASE_MODEL,
  tags: ["reward-hall", "target", "apply", "member", "happy-path"],

  data: {
    adminEmail: "orf-admin-member-apply-challenge-e2e@orf.local",
    adminPassword: "OrfAdminMemberApplyChallengeE2E!2026",
    adminName: "ORF Admin Member Apply Challenge E2E",
    adminRole: "admin",
    adminStatus: "active",
    memberEmail: "orf-member-apply-challenge-e2e@orf.local",
    memberPassword: "OrfMemberApplyChallengeE2E!2026",
    memberName: "ORF Member Apply Challenge E2E",
    memberRole: "member",
    memberStatus: "active",
    projectName: "E2E-PROJECT-MEMBER-APPLY-CHALLENGE",
    objectiveTitle: "E2E-TARGET-MEMBER-APPLY-CHALLENGE",
    applicationReason: "我熟悉该目标背景，可以本周内推进重估和执行计划。",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-5", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备开放目标并进入普通成员的悬赏大厅开放中视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.project.delete_residue", title: "删除 本用例残留的项目 `E2E-PROJECT-MEMBER-APPLY-CHALLENGE`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-member-apply-challenge-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-apply-challenge-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.project.upsert", title: "准备 本用例项目 `E2E-PROJECT-MEMBER-APPLY-CHALLENGE`", object: "db.project", operator: "upsert", params: { nameFrom: "data.projectName", teamIdFrom: "runtime.adminUser.teamId", saveAs: "fixtureProject" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.objective.upsert_open", title: "准备 属于项目 `E2E-PROJECT-MEMBER-APPLY-CHALLENGE`、标题为 `E2E-TARGET-MEMBER-APPLY-CHALLENGE`、已发布且流转状态为 `open` 的目标", object: "db.project_objective", operator: "upsert_open", params: { titleFrom: "data.objectiveTitle", projectFrom: "runtime.fixtureProject", adminUserFrom: "runtime.adminUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.challengers.exclude_member", title: "设置目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的当前挑战者不包含 本用例普通成员", object: "db.objective_challengers", operator: "exclude_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-10", method: "prisma" }, id: "db.assigned.exclude_member", title: "设置目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的待响应征召挑战者不包含 本用例普通成员", object: "db.objective_assignment", operator: "exclude_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-11", method: "prisma" }, id: "db.applications.exclude_member", title: "设置目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的挑战申请不包含 本用例普通成员", object: "db.objective_applications", operator: "exclude_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "member.open_bounty_open", title: "使用 本用例普通成员账号 打开 悬赏大厅的 \"开放中\" 视图", object: "page.bounty_hall", operator: "open_open_as_member", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "普通成员可在开放中视图提交申请挑战",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-apply-challenge-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "db.objective.open", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的流转状态 应为 `open`", object: "db.objective_flow_status", operator: "is", params: { objectiveFrom: "runtime.fixtureObjective", flowStatus: "open" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.challengers.excludes", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的当前挑战者 应不包含 本用例普通成员", object: "db.objective_challengers", operator: "excludes_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.assigned.excludes", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的待响应征召挑战者 应不包含 本用例普通成员", object: "db.objective_assignment", operator: "excludes_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.applications.pending_absent", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 应不存在 本用例普通成员的 pending 挑战申请", object: "db.objective_applications", operator: "pending_absent", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-8", method: "api" }, id: "bounty.api.apply_allowed", title: "悬赏大厅数据中目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 对当前普通成员 应允许申请挑战", object: "api.bounty_hall", operator: "apply_allowed", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "bounty.tab.open.selected", title: "\"开放中\" 视图 应处于选中状态", object: "page.bounty_hall.tab", operator: "selected", params: { name: "开放中" } },
      { source: { caseStepId: "S0-10", method: "playwright" }, id: "bounty.objective.visible", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 在悬赏大厅 \"开放中\" 视图中 应可见", object: "page.bounty_hall.objective", operator: "visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-11", method: "playwright" }, id: "bounty.participation.waiting", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的参与状态 应显示为 \"等待申请\"", object: "page.bounty_hall.objective", operator: "participation_waiting_application", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-12", method: "playwright" }, id: "bounty.apply.enabled", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的 \"申请挑战\" 操作 应可点击", object: "page.bounty_hall.objective", operator: "apply_action_enabled", params: { objectiveFrom: "runtime.fixtureObjective" } },
    ],
  },

  Action: {
    description: "普通成员填写申请理由并提交挑战申请",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "bounty.apply.click", title: "点击目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的 \"申请挑战\" 操作", object: "page.bounty_hall.objective", operator: "apply", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "apply.dialog.visible", title: "\"提交后等待指挥官确认\" 确认弹窗 应可见", object: "page.apply_challenge_dialog", operator: "visible" },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "apply.dialog.reason_visible", title: "确认弹窗中的 \"申请理由\" 输入区 应可见", object: "page.apply_challenge_dialog", operator: "reason_visible" },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "apply.dialog.fill_reason", title: "在 \"申请理由\" 输入区填写 `我熟悉该目标背景，可以本周内推进重估和执行计划。`", object: "page.apply_challenge_dialog", operator: "fill_reason", params: { reasonFrom: "data.applicationReason" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "apply.dialog.confirm", title: "点击确认弹窗中的 \"申请挑战\" 操作", object: "page.apply_challenge_dialog", operator: "confirm", params: { objectiveFrom: "runtime.fixtureObjective", saveAs: "appliedObjective" } },
      { source: { caseStepId: "Action-6", method: "api" }, id: "apply.result.recorded", title: "记录 提交挑战申请结果", object: "api.apply_challenge_result", operator: "recorded", params: { objectiveFrom: "runtime.appliedObjective" } },
    ],
  },

  S1: {
    description: "挑战申请进入待指挥官确认，普通成员不会直接成为挑战者",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "apply.result.ok", title: "提交挑战申请结果 应成功", object: "api.apply_challenge_result", operator: "ok", params: { objectiveFrom: "runtime.appliedObjective", memberUserFrom: "runtime.memberUser", reasonFrom: "data.applicationReason" } },
      { source: { caseStepId: "S1-2", method: "api" }, id: "bounty.api.applied", title: "悬赏大厅数据中目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 对当前普通成员 应为 已申请", object: "api.bounty_hall", operator: "applied", params: { objectiveFrom: "runtime.appliedObjective" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "bounty.page.url", title: "页面 应仍为 悬赏大厅", object: "page.bounty_hall", operator: "url" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "bounty.tab.related.selected", title: "\"我的相关\" 视图 应处于选中状态", object: "page.bounty_hall.tab", operator: "selected", params: { name: "我的相关" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "bounty.objective.visible.related", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 在悬赏大厅 \"我的相关\" 视图中 应可见", object: "page.bounty_hall.objective", operator: "visible", params: { objectiveFrom: "runtime.appliedObjective" } },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "bounty.action.applying", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的操作状态 应显示为 \"申请中\"", object: "page.bounty_hall.objective", operator: "action_status_applying", params: { objectiveFrom: "runtime.appliedObjective" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "bounty.participation.applying", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的参与状态 应显示 本用例普通成员处于 \"申请中\"", object: "page.bounty_hall.objective", operator: "participation_applying_member", params: { objectiveFrom: "runtime.appliedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "bounty.reason.visible", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的申请理由 应显示 `我熟悉该目标背景，可以本周内推进重估和执行计划。`", object: "page.bounty_hall.objective", operator: "application_reason_visible", params: { objectiveFrom: "runtime.appliedObjective", reasonFrom: "data.applicationReason" } },
      { source: { caseStepId: "S1-9", method: "prisma" }, id: "db.applications.pending_present", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 应存在 本用例普通成员的 pending 挑战申请", object: "db.objective_applications", operator: "pending_present", params: { objectiveFrom: "runtime.appliedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-10", method: "prisma" }, id: "db.applications.reason", title: "本用例普通成员的 pending 挑战申请理由 应为 `我熟悉该目标背景，可以本周内推进重估和执行计划。`", object: "db.objective_applications", operator: "pending_reason_equals", params: { objectiveFrom: "runtime.appliedObjective", memberUserFrom: "runtime.memberUser", reasonFrom: "data.applicationReason" } },
      { source: { caseStepId: "S1-11", method: "prisma" }, id: "db.objective.applying", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的流转状态 应为 `applying`", object: "db.objective_flow_status", operator: "is", params: { objectiveFrom: "runtime.appliedObjective", flowStatus: "applying" } },
      { source: { caseStepId: "S1-12", method: "prisma" }, id: "db.challengers.still_excludes", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的当前挑战者 应仍不包含 本用例普通成员", object: "db.objective_challengers", operator: "excludes_member", params: { objectiveFrom: "runtime.appliedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-13", method: "prisma" }, id: "db.assigned.still_excludes", title: "目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的待响应征召挑战者 应仍不包含 本用例普通成员", object: "db.objective_assignment", operator: "excludes_member", params: { objectiveFrom: "runtime.appliedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-14", method: "api" }, id: "session.still_authenticated", title: "当前会话 应仍为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-15", method: "api" }, id: "session.email.still", title: "当前会话用户邮箱 应仍为 `orf-member-apply-challenge-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、项目、账号身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_created", title: "删除 本用例创建的目标 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "runtime.fixtureObjective.id", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.project.delete_created", title: "删除 本用例创建的项目 `E2E-PROJECT-MEMBER-APPLY-CHALLENGE`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前普通成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-APPLY-CHALLENGE` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.project.absent", title: "应不存在 名称为 `E2E-PROJECT-MEMBER-APPLY-CHALLENGE` 的项目", object: "db.project", operator: "absent", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-member-apply-challenge-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-12", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-apply-challenge-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-member-apply-challenge-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-14", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-apply-challenge-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
    ],
  },
} satisfies StateCaseSpec<MemberApplyChallengeCaseData>;
