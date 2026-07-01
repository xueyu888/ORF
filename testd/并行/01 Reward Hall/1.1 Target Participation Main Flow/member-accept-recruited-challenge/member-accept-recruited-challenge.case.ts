import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberAcceptRecruitedChallengeCaseData } from "./_support/member-accept-recruited-challenge.context";

export const memberAcceptRecruitedChallengeCase = {
  id: "reward-hall.member-accept-recruited-challenge",
  title: "被征召挑战者成功接受挑战",
  model: STATE_CASE_MODEL,
  tags: ["reward-hall", "target", "recruit", "member", "happy-path"],

  data: {
    adminEmail: "orf-admin-accept-recruited-e2e@orf.local",
    adminPassword: "OrfAdminAcceptRecruitedE2E!2026",
    adminName: "ORF Admin Accept Recruited E2E",
    adminRole: "admin",
    adminStatus: "active",
    memberEmail: "orf-member-accept-recruited-e2e@orf.local",
    memberPassword: "OrfMemberAcceptRecruitedE2E!2026",
    memberName: "ORF Member Accept Recruited E2E",
    memberRole: "member",
    memberStatus: "active",
    projectName: "E2E-PROJECT-ACCEPT-RECRUITED",
    objectiveTitle: "E2E-TARGET-ACCEPT-RECRUITED",
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
    description: "准备已征召目标并进入被征召挑战者的悬赏大厅全部视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的目标 `E2E-TARGET-ACCEPT-RECRUITED` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.project.delete_residue", title: "删除 本用例残留的项目 `E2E-PROJECT-ACCEPT-RECRUITED`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-accept-recruited-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-accept-recruited-e2e@orf.local`、使用固定测试密码的被征召挑战者登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active` 的本用例被征召挑战者用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.project.upsert", title: "准备 本用例项目 `E2E-PROJECT-ACCEPT-RECRUITED`", object: "db.project", operator: "upsert", params: { nameFrom: "data.projectName", teamIdFrom: "runtime.adminUser.teamId", saveAs: "fixtureProject" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.objective.upsert_recruited", title: "准备 属于项目 `E2E-PROJECT-ACCEPT-RECRUITED`、标题为 `E2E-TARGET-ACCEPT-RECRUITED`、已发布且已征召本用例被征召挑战者的目标", object: "db.project_objective", operator: "upsert_recruited", params: { titleFrom: "data.objectiveTitle", projectFrom: "runtime.fixtureProject", adminUserFrom: "runtime.adminUser", memberUserFrom: "runtime.memberUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "member.open_bounty_all", title: "使用 本用例被征召挑战者账号 打开 悬赏大厅的 \"全部\" 视图", object: "page.bounty_hall", operator: "open_all_as_member", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "被征召挑战者在悬赏大厅可接受挑战",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "bounty.api.accept_allowed", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 对当前被征召挑战者 应允许接受挑战", object: "api.bounty_hall", operator: "accept_allowed", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "bounty.objective.visible", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 在悬赏大厅 \"全部\" 视图中 应可见", object: "page.bounty_hall.objective", operator: "visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-3", method: "playwright" }, id: "bounty.participation.pending", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 的参与状态 应显示为 \"待响应征召\"", object: "page.bounty_hall.objective", operator: "participation_pending_recruitment", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-4", method: "playwright" }, id: "bounty.accept.enabled", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 的 \"接受挑战\" 操作 应可点击", object: "page.bounty_hall.objective", operator: "accept_action_enabled", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.assigned.contains", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 的待响应征召挑战者 应包含 本用例被征召挑战者", object: "db.objective_assignment", operator: "contains_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.challengers.excludes", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 的当前挑战者 应不包含 本用例被征召挑战者", object: "db.objective_challengers", operator: "excludes_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
    ],
  },

  Action: {
    description: "被征召挑战者确认接受挑战",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "bounty.accept.click", title: "点击目标 `E2E-TARGET-ACCEPT-RECRUITED` 的 \"接受挑战\" 操作", object: "page.bounty_hall.objective", operator: "accept", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "accept.dialog.visible", title: "\"接受后会进入你的挑战页\" 确认弹窗 应可见", object: "page.accept_challenge_dialog", operator: "visible" },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "accept.dialog.confirm", title: "点击确认弹窗中的 \"接受挑战\" 操作", object: "page.accept_challenge_dialog", operator: "confirm", params: { objectiveFrom: "runtime.fixtureObjective", saveAs: "acceptedObjective" } },
      { source: { caseStepId: "Action-4", method: "api" }, id: "accept.result.ok", title: "接受挑战结果 应成功", object: "api.accept_challenge_result", operator: "ok", params: { objectiveFrom: "runtime.acceptedObjective", memberUserFrom: "runtime.memberUser" } },
    ],
  },

  S1: {
    description: "被征召挑战者成为当前挑战者并进入我的挑战",
    assertions: [
      { source: { caseStepId: "S1-1", method: "prisma" }, id: "db.challengers.contains", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 的当前挑战者 应包含 本用例被征召挑战者", object: "db.objective_challengers", operator: "contains_member", params: { objectiveFrom: "runtime.acceptedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-2", method: "prisma" }, id: "db.assigned.excludes", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 的待响应征召挑战者 应不包含 本用例被征召挑战者", object: "db.objective_assignment", operator: "excludes_member", params: { objectiveFrom: "runtime.acceptedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-3", method: "prisma" }, id: "db.objective.reestimating", title: "目标 `E2E-TARGET-ACCEPT-RECRUITED` 的流程状态 应为 `reestimating`", object: "db.objective_flow_status", operator: "is", params: { objectiveFrom: "runtime.acceptedObjective", flowStatus: "reestimating" } },
      { source: { caseStepId: "S1-4", method: "api" }, id: "bounty.api.accepted", title: "悬赏大厅数据中目标 `E2E-TARGET-ACCEPT-RECRUITED` 对当前被征召挑战者 应为已接受挑战", object: "api.bounty_hall", operator: "accepted", params: { objectiveFrom: "runtime.acceptedObjective" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "page.tasks.url", title: "页面 应跳转到 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "challenge.objective.visible", title: "我的挑战中应显示目标 `E2E-TARGET-ACCEPT-RECRUITED`", object: "page.challenge_objective", operator: "visible", params: { objectiveFrom: "runtime.acceptedObjective" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、项目、账号身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_created", title: "删除 本用例创建的目标 `E2E-TARGET-ACCEPT-RECRUITED` 及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "runtime.fixtureObjective.id", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.project.delete_created", title: "删除 本用例创建的项目 `E2E-PROJECT-ACCEPT-RECRUITED`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前被征召挑战者登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例被征召挑战者登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例被征召挑战者用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
    ],
  },
} satisfies StateCaseSpec<MemberAcceptRecruitedChallengeCaseData>;
