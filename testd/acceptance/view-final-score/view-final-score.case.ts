import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { ViewFinalScoreCaseData } from "./_support/view-final-score.context";

export const viewFinalScoreCase = {
  id: "acceptance.final_score.view.member",
  title: "成员可以查看最终分数",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "final-score", "member", "happy-path"],

  data: {
    email: "orf-member-e2e@orf.local",
    password: "OrfMemberE2E!2026",
    name: "ORF Member E2E",
    role: "member",
    points: 42,
    reason: "E2E-FINAL-SCORE: 查看最终分数",
  },

  B: {
    description: "系统服务、Ory、数据库和预置普通成员可用，当前浏览器未登录且测试积分流水不存在",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      {
        id: "ory.member_identity.exists",
        title: "普通成员 Ory 身份存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.member.active", title: "预置普通成员账号可用", object: "db.member", operator: "active", params: { emailFrom: "data.email" } },
      { id: "db.final_score_target.available", title: "存在可构造最终分数查看起点的目标", object: "db.final_score_target", operator: "available" },
      {
        id: "db.final_score_ledger.absent",
        title: "测试积分流水不存在",
        object: "db.final_score_ledger",
        operator: "absent",
        params: { reasonFrom: "data.reason" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备已结算目标和积分流水，登录普通成员",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "db.final_score_target.select",
        title: "选择可构造最终分数查看起点的目标",
        object: "db.final_score_target",
        operator: "select",
        params: { saveAs: "finalScoreTarget" },
      },
      {
        id: "db.final_score_target.original_state_recorded",
        title: "记录目标原始状态",
        object: "db.final_score_target",
        operator: "original_state_recorded",
        params: { targetFrom: "runtime.finalScoreTarget" },
      },
      {
        id: "db.final_score_target.prepare",
        title: "准备目标为已结算状态",
        object: "db.final_score_target",
        operator: "prepare",
        params: { targetFrom: "runtime.finalScoreTarget", memberNameFrom: "data.name", pointsFrom: "data.points" },
      },
      {
        id: "db.final_score_ledger.create",
        title: "创建测试积分流水",
        object: "db.final_score_ledger",
        operator: "create",
        params: {
          targetFrom: "runtime.finalScoreTarget",
          emailFrom: "data.email",
          memberNameFrom: "data.name",
          pointsFrom: "data.points",
          reasonFrom: "data.reason",
          saveAs: "finalScoreLedger",
        },
      },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入普通成员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      {
        id: "fill.password",
        title: "输入普通成员密码",
        object: "page",
        operator: "fill",
        params: { label: "Password", exact: true, valueFrom: "data.password" },
      },
      { id: "click.sign_in", title: "点击登录按钮", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      {
        id: "session.member.authenticated",
        title: "等待普通成员 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
    ],
  },

  S0: {
    description: "普通成员已登录，目标已结算且积分流水存在",
    assertions: [
      {
        id: "session.member.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      {
        id: "db.final_score_target.settled_for_member",
        title: "目标处于已结算状态且挑战者为普通成员",
        object: "db.final_score_target",
        operator: "settled_for_member",
        params: { targetFrom: "runtime.finalScoreTarget", memberNameFrom: "data.name" },
      },
      {
        id: "db.final_score_ledger.present",
        title: "数据库存在测试积分流水",
        object: "db.final_score_ledger",
        operator: "present",
        params: { targetFrom: "runtime.finalScoreTarget", memberNameFrom: "data.name", pointsFrom: "data.points" },
      },
    ],
  },

  Action: {
    description: "普通成员打开统计页面查看最终分数",
    steps: [
      { id: "page.goto.reports", title: "打开统计页面", object: "page", operator: "goto", params: { path: "/reports" } },
      { id: "click.all_time", title: "选择全部时间", object: "page", operator: "click", params: { role: "button", name: "全部时间" } },
    ],
  },

  S1: {
    description: "统计页面展示普通成员最终分数，数据库积分流水保持一致",
    assertions: [
      { id: "url.reports", title: "当前页面是统计页面", object: "page.url", operator: "match", params: { pattern: "/reports$" } },
      {
        id: "page.final_score.visible",
        title: "统计页面显示普通成员最终分数",
        object: "page.final_score",
        operator: "visible",
        params: { memberNameFrom: "data.name", pointsFrom: "data.points" },
      },
      {
        id: "db.final_score_ledger.present",
        title: "数据库积分流水保持一致",
        object: "db.final_score_ledger",
        operator: "present",
        params: { targetFrom: "runtime.finalScoreTarget", memberNameFrom: "data.name", pointsFrom: "data.points" },
      },
      {
        id: "session.member.still_authenticated",
        title: "普通成员仍保持登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
    ],
  },

  Clean: {
    description: "删除测试积分流水，恢复目标原始状态并退出登录",
    steps: [
      {
        id: "db.final_score_ledger.delete",
        title: "删除测试积分流水",
        object: "db.final_score_ledger",
        operator: "delete",
        params: { reasonFrom: "data.reason", ledgerFrom: "runtime.finalScoreLedger" },
      },
      {
        id: "db.final_score_target.restore",
        title: "恢复目标原始状态",
        object: "db.final_score_target",
        operator: "restore",
        params: { targetFrom: "runtime.finalScoreTarget" },
      },
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "ory.member_identity.exists",
        title: "普通成员 Ory 身份仍然存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.member.active", title: "预置普通成员账号仍然可用", object: "db.member", operator: "active", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<ViewFinalScoreCaseData>;
