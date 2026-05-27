import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MemberScoreStatisticsCaseData } from "./_support/member-score-statistics.context";

export const memberScoreStatisticsCase = {
  id: "statistics.member_scores.visible",
  title: "统计页可以显示多个成员分数",
  model: STATE_CASE_MODEL,
  tags: ["statistics", "score", "admin", "happy-path"],

  data: {
    adminEmail: "zrx831@gmail.com",
    adminPassword: "123123123",
    adminRole: "admin",
    firstMemberName: "ORF Member E2E",
    firstMemberPoints: 70,
    secondMemberName: "m2",
    secondMemberPoints: 30,
    reason: "E2E-SCORE-STATS: 成员分数统计",
  },

  B: {
    description: "系统服务、Ory、数据库和预置成员可用，当前浏览器未登录且测试积分流水不存在",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      { id: "ory.admin_identity.exists", title: "管理员 Ory 身份存在", object: "ory.identity", operator: "exists", params: { emailFrom: "data.adminEmail" } },
      { id: "db.admin.active", title: "预置管理员账号可用", object: "db.admin", operator: "active", params: { emailFrom: "data.adminEmail" } },
      { id: "db.first_member.active", title: "第一个普通成员账号可用", object: "db.member", operator: "active", params: { memberNameFrom: "data.firstMemberName" } },
      { id: "db.second_member.active", title: "第二个普通成员账号可用", object: "db.member", operator: "active", params: { memberNameFrom: "data.secondMemberName" } },
      { id: "db.score_statistics_target.available", title: "存在可构造成员分数统计起点的目标", object: "db.score_statistics_target", operator: "available" },
      { id: "db.score_ledger.absent", title: "测试积分流水不存在", object: "db.score_ledger", operator: "absent", params: { reasonFrom: "data.reason" } },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备已结算目标和两个成员的积分流水，登录管理员",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "db.score_statistics_target.select", title: "选择可构造成员分数统计起点的目标", object: "db.score_statistics_target", operator: "select", params: { saveAs: "scoreStatisticsTarget" } },
      {
        id: "db.score_statistics_target.original_state_recorded",
        title: "记录目标原始状态",
        object: "db.score_statistics_target",
        operator: "original_state_recorded",
        params: { targetFrom: "runtime.scoreStatisticsTarget" },
      },
      {
        id: "db.score_statistics_target.prepare",
        title: "准备目标为已结算状态",
        object: "db.score_statistics_target",
        operator: "prepare",
        params: {
          targetFrom: "runtime.scoreStatisticsTarget",
          firstMemberNameFrom: "data.firstMemberName",
          secondMemberNameFrom: "data.secondMemberName",
          firstPointsFrom: "data.firstMemberPoints",
          secondPointsFrom: "data.secondMemberPoints",
        },
      },
      {
        id: "db.score_ledger.create",
        title: "创建测试积分流水",
        object: "db.score_ledger",
        operator: "create",
        params: {
          targetFrom: "runtime.scoreStatisticsTarget",
          firstMemberNameFrom: "data.firstMemberName",
          firstPointsFrom: "data.firstMemberPoints",
          secondMemberNameFrom: "data.secondMemberName",
          secondPointsFrom: "data.secondMemberPoints",
          reasonFrom: "data.reason",
        },
      },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入管理员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.adminEmail" } },
      { id: "fill.password", title: "输入管理员密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.adminPassword" } },
      { id: "click.sign_in", title: "点击登录按钮", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { id: "session.admin.authenticated", title: "等待管理员 session 已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
    ],
  },

  S0: {
    description: "管理员已登录，目标已结算且两个成员积分流水存在",
    assertions: [
      { id: "session.admin.authenticated", title: "后端 session 已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { id: "db.score_statistics_target.settled", title: "目标处于已结算状态", object: "db.score_statistics_target", operator: "settled", params: { targetFrom: "runtime.scoreStatisticsTarget" } },
      { id: "db.score_ledger.first.present", title: "第一个成员积分流水存在", object: "db.score_ledger", operator: "present", params: { targetFrom: "runtime.scoreStatisticsTarget", memberNameFrom: "data.firstMemberName", pointsFrom: "data.firstMemberPoints" } },
      { id: "db.score_ledger.second.present", title: "第二个成员积分流水存在", object: "db.score_ledger", operator: "present", params: { targetFrom: "runtime.scoreStatisticsTarget", memberNameFrom: "data.secondMemberName", pointsFrom: "data.secondMemberPoints" } },
    ],
  },

  Action: {
    description: "管理员打开统计页面查看成员分数",
    steps: [
      { id: "page.goto.reports", title: "打开统计页面", object: "page", operator: "goto", params: { path: "/reports" } },
      { id: "click.all_time", title: "选择全部时间", object: "page", operator: "click", params: { role: "button", name: "全部时间" } },
    ],
  },

  S1: {
    description: "统计页面展示两个成员的积分，数据库积分流水保持一致",
    assertions: [
      { id: "url.reports", title: "当前页面是统计页面", object: "page.url", operator: "match", params: { pattern: "/reports$" } },
      { id: "page.score_statistics.first.visible", title: "统计页面显示第一个成员积分汇总", object: "page.score_statistics", operator: "visible", params: { targetFrom: "runtime.scoreStatisticsTarget", memberNameFrom: "data.firstMemberName" } },
      { id: "page.score_statistics.second.visible", title: "统计页面显示第二个成员积分汇总", object: "page.score_statistics", operator: "visible", params: { targetFrom: "runtime.scoreStatisticsTarget", memberNameFrom: "data.secondMemberName" } },
      { id: "db.score_ledger.first.present", title: "第一个成员数据库积分保持一致", object: "db.score_ledger", operator: "present", params: { targetFrom: "runtime.scoreStatisticsTarget", memberNameFrom: "data.firstMemberName", pointsFrom: "data.firstMemberPoints" } },
      { id: "db.score_ledger.second.present", title: "第二个成员数据库积分保持一致", object: "db.score_ledger", operator: "present", params: { targetFrom: "runtime.scoreStatisticsTarget", memberNameFrom: "data.secondMemberName", pointsFrom: "data.secondMemberPoints" } },
      { id: "session.admin.still_authenticated", title: "管理员仍保持登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除测试积分流水，恢复目标原始状态并退出登录",
    steps: [
      { id: "db.score_ledger.delete", title: "删除测试积分流水", object: "db.score_ledger", operator: "delete", params: { reasonFrom: "data.reason" } },
      { id: "db.score_statistics_target.restore", title: "恢复目标原始状态", object: "db.score_statistics_target", operator: "restore", params: { targetFrom: "runtime.scoreStatisticsTarget" } },
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "ory.admin_identity.exists", title: "管理员 Ory 身份仍然存在", object: "ory.identity", operator: "exists", params: { emailFrom: "data.adminEmail" } },
      { id: "db.admin.active", title: "预置管理员账号仍然可用", object: "db.admin", operator: "active", params: { emailFrom: "data.adminEmail" } },
      { id: "db.first_member.active", title: "第一个普通成员账号仍然可用", object: "db.member", operator: "active", params: { memberNameFrom: "data.firstMemberName" } },
      { id: "db.second_member.active", title: "第二个普通成员账号仍然可用", object: "db.member", operator: "active", params: { memberNameFrom: "data.secondMemberName" } },
    ],
  },
} satisfies StateCaseSpec<MemberScoreStatisticsCaseData>;
