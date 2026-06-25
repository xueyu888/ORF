import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { AdminRecruitChallengerNeedAcceptCaseData } from "./_support/admin-recruit-challenger-need-accept.context";

export const adminRecruitChallengerNeedAcceptCase = {
  id: "target.admin-recruit-challenger-need-accept",
  title: "管理员征召挑战者后被征召挑战者需接受挑战",
  model: STATE_CASE_MODEL,
  tags: ["target", "recruit", "admin", "member", "happy-path"],

  data: {
    adminEmail: "orf-admin-recruit-need-accept-e2e@orf.local",
    adminPassword: "OrfAdminRecruitNeedAcceptE2E!2026",
    adminName: "ORF Admin Recruit Need Accept E2E",
    adminRole: "admin",
    adminStatus: "active",
    memberEmail: "orf-member-recruit-need-accept-e2e@orf.local",
    memberPassword: "OrfMemberRecruitNeedAcceptE2E!2026",
    memberName: "ORF Member Recruit Need Accept E2E",
    memberRole: "member",
    memberStatus: "active",
    projectName: "E2E-PROJECT-RECRUIT-NEED-ACCEPT",
    objectiveTitle: "E2E-TARGET-RECRUIT-NEED-ACCEPT",
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
    description: "准备管理员、被征召挑战者、项目和未发布目标，并进入项目筛选后的我的挑战",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.project.delete_residue", title: "删除 本用例残留的项目 `E2E-PROJECT-RECRUIT-NEED-ACCEPT`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-recruit-need-accept-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-recruit-need-accept-e2e@orf.local`、使用固定测试密码的被征召挑战者登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active` 的本用例被征召挑战者用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.project.upsert", title: "准备 本用例项目 `E2E-PROJECT-RECRUIT-NEED-ACCEPT`", object: "db.project", operator: "upsert", params: { nameFrom: "data.projectName", teamIdFrom: "runtime.adminUser.teamId", saveAs: "fixtureProject" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.objective.upsert_unpublished", title: "准备 属于项目 `E2E-PROJECT-RECRUIT-NEED-ACCEPT`、标题为 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的未发布目标", object: "db.project_objective", operator: "upsert_unpublished", params: { titleFrom: "data.objectiveTitle", projectFrom: "runtime.fixtureProject", adminUserFrom: "runtime.adminUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "auth.login.admin", title: "使用 本用例管理员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.adminEmail", passwordFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "page.goto.tasks", title: "打开 我的挑战", object: "page.challenge", operator: "goto" },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "scope.all.select", title: "切换到 \"所有挑战\" 视图", object: "page.challenge_scope", operator: "select", params: { label: "所有挑战" } },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "project.select", title: "选择项目筛选 `E2E-PROJECT-RECRUIT-NEED-ACCEPT`", object: "page.challenge_project_filter", operator: "select", params: { projectNameFrom: "data.projectName" } },
    ],
  },

  S0: {
    description: "目标已发布并处于可征召的 Action 起点",
    assertions: [
      { source: { caseStepId: "S0-1", method: "playwright" }, id: "objective.visible.in_project", title: "项目 `E2E-PROJECT-RECRUIT-NEED-ACCEPT` 中应显示目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT`", object: "page.challenge_objective", operator: "visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "objective.publish.click", title: "点击目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的 \"发布\" 操作", object: "page.challenge_objective", operator: "publish", params: { objectiveFrom: "runtime.fixtureObjective", saveAs: "publishedObjective" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "publish.result.ok", title: "发布目标结果 应成功", object: "api.publish_objective_result", operator: "ok", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "db.objective.published_at", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的发布时间 应不为空", object: "db.objective_publication", operator: "published", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "S0-5", method: "playwright" }, id: "objective.recruiting.visible", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 处于征召阶段", object: "page.challenge_objective", operator: "recruiting_visible", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "S0-6", method: "playwright" }, id: "objective.recruit.enabled", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的 \"征召\" 操作 应可点击", object: "page.challenge_objective", operator: "recruit_action_enabled", params: { objectiveFrom: "runtime.publishedObjective" } },
    ],
  },

  Action: {
    description: "管理员征召本用例被征召挑战者",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "objective.recruit.click", title: "点击目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的 \"征召\" 操作", object: "page.challenge_objective", operator: "recruit", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "recruit.dialog.visible", title: "\"征召挑战者\" 弹窗 应可见", object: "page.recruit_dialog", operator: "visible" },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "recruit.member.check", title: "勾选 本用例被征召挑战者", object: "page.recruit_dialog.member", operator: "check", params: { memberNameFrom: "data.memberName" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "recruit.submit", title: "点击 \"发送征召\" 操作", object: "page.recruit_dialog", operator: "submit", params: { objectiveFrom: "runtime.publishedObjective", saveAs: "recruitedObjective" } },
      { source: { caseStepId: "Action-5", method: "api" }, id: "recruit.result.ok", title: "征召挑战者结果 应成功", object: "api.recruit_result", operator: "ok", params: { objectiveFrom: "runtime.recruitedObjective", memberUserFrom: "runtime.memberUser" } },
    ],
  },

  S1: {
    description: "目标进入待响应征召，被征召挑战者在悬赏大厅可接受挑战",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "admin.pending_recruitment.visible", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的 \"待响应征召\" 区域 应可见", object: "page.challenge_objective.recruitment", operator: "visible", params: { objectiveFrom: "runtime.recruitedObjective" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "admin.member.waiting_accept", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 中 本用例被征召挑战者 的状态 应显示为 \"已征召，等待接受\"", object: "page.challenge_objective.recruitment", operator: "member_waiting_accept", params: { objectiveFrom: "runtime.recruitedObjective", memberNameFrom: "data.memberName" } },
      { source: { caseStepId: "S1-3", method: "prisma" }, id: "db.assigned.contains", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的待响应征召挑战者 应包含 本用例被征召挑战者", object: "db.objective_assignment", operator: "contains_member", params: { objectiveFrom: "runtime.recruitedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-4", method: "prisma" }, id: "db.challengers.excludes", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的当前挑战者 应不包含 本用例被征召挑战者", object: "db.objective_challengers", operator: "excludes_member", params: { objectiveFrom: "runtime.recruitedObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "member.open_bounty_all", title: "使用 本用例被征召挑战者账号 打开 悬赏大厅的 \"全部\" 视图", object: "page.bounty_hall", operator: "open_all_as_member", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "bounty.api.accept_allowed", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 对当前被征召挑战者 应允许接受挑战", object: "api.bounty_hall", operator: "accept_allowed", params: { objectiveFrom: "runtime.recruitedObjective" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "bounty.participation.pending", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的参与状态 应显示为 \"待响应征召\"", object: "page.bounty_hall.objective", operator: "participation_pending_recruitment", params: { objectiveFrom: "runtime.recruitedObjective" } },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "bounty.accept.enabled", title: "目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 的 \"接受挑战\" 操作 应可点击", object: "page.bounty_hall.objective", operator: "accept_action_enabled", params: { objectiveFrom: "runtime.recruitedObjective" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、项目、账号身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_created", title: "删除 本用例创建的目标 `E2E-TARGET-RECRUIT-NEED-ACCEPT` 及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "runtime.fixtureObjective.id", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.project.delete_created", title: "删除 本用例创建的项目 `E2E-PROJECT-RECRUIT-NEED-ACCEPT`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前被征召挑战者登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例被征召挑战者登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例被征召挑战者用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
    ],
  },
} satisfies StateCaseSpec<AdminRecruitChallengerNeedAcceptCaseData>;
