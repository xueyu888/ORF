import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberEnterParticipatedTargetCaseData } from "./_support/member-enter-participated-target.context";

export const memberEnterParticipatedTargetCase = {
  id: "reward-hall.member-enter-participated-target",
  title: "普通成员对已参与目标可进入并查看",
  model: STATE_CASE_MODEL,
  tags: ["reward-hall", "target", "participated", "member", "navigation"],

  data: {
    adminEmail: "orf-admin-member-enter-participated-e2e@orf.local",
    adminPassword: "OrfAdminMemberEnterParticipatedE2E!2026",
    adminName: "ORF Admin Member Enter Participated E2E",
    adminRole: "admin",
    adminStatus: "active",
    memberEmail: "orf-member-enter-participated-e2e@orf.local",
    memberPassword: "OrfMemberEnterParticipatedE2E!2026",
    memberName: "ORF Member Enter Participated E2E",
    memberRole: "member",
    memberStatus: "active",
    projectName: "E2E-PROJECT-MEMBER-ENTER-PARTICIPATED",
    objectiveTitle: "E2E-TARGET-MEMBER-ENTER-PARTICIPATED",
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
    description: "准备普通成员已参与目标并进入悬赏大厅我的相关视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.project.delete_residue", title: "删除 本用例残留的项目 `E2E-PROJECT-MEMBER-ENTER-PARTICIPATED`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-member-enter-participated-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-enter-participated-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.project.upsert", title: "准备 本用例项目 `E2E-PROJECT-MEMBER-ENTER-PARTICIPATED`", object: "db.project", operator: "upsert", params: { nameFrom: "data.projectName", teamIdFrom: "runtime.adminUser.teamId", saveAs: "fixtureProject" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.objective.upsert_participated", title: "准备 属于项目 `E2E-PROJECT-MEMBER-ENTER-PARTICIPATED`、标题为 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED`、已发布、流转状态为 `reestimating` 且当前挑战者包含本用例普通成员的目标", object: "db.project_objective", operator: "upsert_participated", params: { titleFrom: "data.objectiveTitle", projectFrom: "runtime.fixtureProject", adminUserFrom: "runtime.adminUser", memberUserFrom: "runtime.memberUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.assigned.exclude_member", title: "设置目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的待响应征召挑战者不包含 本用例普通成员", object: "db.objective_assignment", operator: "exclude_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-10", method: "prisma" }, id: "db.applications.exclude_member", title: "设置目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的挑战申请不包含 本用例普通成员", object: "db.objective_applications", operator: "exclude_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "member.open_bounty_related", title: "使用 本用例普通成员账号 打开 悬赏大厅的 \"我的相关\" 视图", object: "page.bounty_hall", operator: "open_related_as_member", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "普通成员在悬赏大厅我的相关视图可进入已参与目标",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-enter-participated-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "db.objective.reestimating", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的流转状态 应为 `reestimating`", object: "db.objective_flow_status", operator: "is", params: { objectiveFrom: "runtime.fixtureObjective", flowStatus: "reestimating" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.challengers.contains", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的当前挑战者 应包含 本用例普通成员", object: "db.objective_challengers", operator: "contains_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.assigned.excludes", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的待响应征召挑战者 应不包含 本用例普通成员", object: "db.objective_assignment", operator: "excludes_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.applications.pending_absent", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 应不存在 本用例普通成员的 pending 挑战申请", object: "db.objective_applications", operator: "pending_absent", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-8", method: "api" }, id: "bounty.api.participated", title: "悬赏大厅数据中目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 对当前普通成员 应为 已参与目标", object: "api.bounty_hall", operator: "participated", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "bounty.tab.related.selected", title: "\"我的相关\" 视图 应处于选中状态", object: "page.bounty_hall.tab", operator: "selected", params: { name: "我的相关" } },
      { source: { caseStepId: "S0-10", method: "playwright" }, id: "bounty.objective.visible", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 在悬赏大厅 \"我的相关\" 视图中 应可见", object: "page.bounty_hall.objective", operator: "visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-11", method: "playwright" }, id: "bounty.participation.challenger", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的参与状态 应显示 本用例普通成员为 \"挑战者\"", object: "page.bounty_hall.objective", operator: "participation_challenger_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-12", method: "playwright" }, id: "bounty.enter.enabled", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的 \"进入目标\" 操作 应可点击", object: "page.bounty_hall.objective", operator: "enter_action_enabled", params: { objectiveFrom: "runtime.fixtureObjective" } },
    ],
  },

  Action: {
    description: "普通成员从悬赏大厅进入已参与目标",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "bounty.enter.click", title: "点击目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的 \"进入目标\" 操作", object: "page.bounty_hall.objective", operator: "enter", params: { objectiveFrom: "runtime.fixtureObjective" } },
    ],
  },

  S1: {
    description: "我的挑战打开目标，参与关系保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "challenge.page.anchor", title: "页面地址 应指向目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的我的挑战锚点", object: "page.challenge", operator: "url_anchor", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "challenge.objective.visible", title: "我的挑战中目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 应可见", object: "page.challenge_objective", operator: "visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "challenge.objective.title_visible", title: "我的挑战中目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的标题 应可见", object: "page.challenge_objective", operator: "title_visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S1-5", method: "api" }, id: "session.still_authenticated", title: "当前会话 应仍为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-6", method: "api" }, id: "session.email.still", title: "当前会话用户邮箱 应仍为 `orf-member-enter-participated-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.challengers.still_contains", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的当前挑战者 应仍包含 本用例普通成员", object: "db.objective_challengers", operator: "contains_member", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "db.objective.still_reestimating", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的流转状态 应仍为 `reestimating`", object: "db.objective_flow_status", operator: "is", params: { objectiveFrom: "runtime.fixtureObjective", flowStatus: "reestimating" } },
      { source: { caseStepId: "S1-9", method: "prisma" }, id: "db.applications.still_pending_absent", title: "目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 应仍不存在 本用例普通成员的 pending 挑战申请", object: "db.objective_applications", operator: "pending_absent", params: { objectiveFrom: "runtime.fixtureObjective", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.my_challenges.contains", title: "我的挑战数据中 应包含目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED`", object: "api.my_challenges", operator: "contains_objective", params: { objectiveFrom: "runtime.fixtureObjective" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、项目、账号身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_created", title: "删除 本用例创建的目标 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "runtime.fixtureObjective.id", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.project.delete_created", title: "删除 本用例创建的项目 `E2E-PROJECT-MEMBER-ENTER-PARTICIPATED`", object: "db.project", operator: "delete_by_name", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前普通成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-ENTER-PARTICIPATED` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.project.absent", title: "应不存在 名称为 `E2E-PROJECT-MEMBER-ENTER-PARTICIPATED` 的项目", object: "db.project", operator: "absent", params: { nameFrom: "data.projectName" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-member-enter-participated-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-12", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-enter-participated-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-member-enter-participated-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-14", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-enter-participated-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
    ],
  },
} satisfies StateCaseSpec<MemberEnterParticipatedTargetCaseData>;
