import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminReviewLootCaseData } from "./_support/admin-review-loot.context";

export const adminReviewLootCase = {
  id: "acceptance.loot.review.admin",
  title: "管理员可以验收战利品",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "loot", "admin", "happy-path"],

  data: {
    adminEmail: "zrx831@gmail.com",
    adminPassword: "123123123",
    adminRole: "admin",
    memberName: "ORF Member E2E",
    resultTitle: "E2E-REVIEW-RESULT: 管理员验收战利品指标",
    metricName: "管理员验收战利品指标",
    lootBody: "E2E-REVIEW-LOOT-BODY: 管理员验收战利品完成说明",
    evidenceText: "E2E-REVIEW-EVIDENCE: 验收证据",
    points: 42,
    reason: "E2E-REVIEW-LOOT: 管理员验收战利品",
  },

  B: {
    description: "系统服务、Ory、数据库和预置账号可用，当前浏览器未登录且测试数据不存在",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      { id: "ory.admin_identity.exists", title: "管理员 Ory 身份存在", object: "ory.identity", operator: "exists", params: { emailFrom: "data.adminEmail" } },
      { id: "db.admin.active", title: "预置管理员账号可用", object: "db.admin", operator: "active", params: { emailFrom: "data.adminEmail" } },
      { id: "db.member.active", title: "预置普通成员账号可用", object: "db.member", operator: "active", params: { memberNameFrom: "data.memberName" } },
      { id: "db.review_loot_target.available", title: "存在可构造管理员验收战利品起点的目标", object: "db.review_loot_target", operator: "available" },
      { id: "db.review_loot_result.absent", title: "测试指标不存在", object: "db.review_loot_result", operator: "absent", params: { titleFrom: "data.resultTitle" } },
      { id: "db.review_loot.absent", title: "测试战利品不存在", object: "db.review_loot", operator: "absent", params: { bodyFrom: "data.lootBody" } },
      { id: "db.review_loot_ledger.absent", title: "测试积分流水不存在", object: "db.review_loot_ledger", operator: "absent", params: { reasonFrom: "data.reason" } },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备已提交战利品的目标，登录管理员并进入目标战利品页面",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "db.review_loot_target.select", title: "选择可构造管理员验收战利品起点的目标", object: "db.review_loot_target", operator: "select", params: { saveAs: "reviewLootTarget" } },
      {
        id: "db.review_loot_target.original_state_recorded",
        title: "记录目标原始状态",
        object: "db.review_loot_target",
        operator: "original_state_recorded",
        params: { targetFrom: "runtime.reviewLootTarget" },
      },
      {
        id: "db.review_loot_target.prepare",
        title: "准备目标为可验收战利品状态",
        object: "db.review_loot_target",
        operator: "prepare",
        params: { targetFrom: "runtime.reviewLootTarget", memberNameFrom: "data.memberName" },
      },
      {
        id: "db.review_loot_result.create",
        title: "创建验收前置指标",
        object: "db.review_loot_result",
        operator: "create",
        params: { targetFrom: "runtime.reviewLootTarget", titleFrom: "data.resultTitle", metricNameFrom: "data.metricName", pointsFrom: "data.points", saveAs: "reviewLootResult" },
      },
      {
        id: "db.review_loot.create",
        title: "创建测试战利品",
        object: "db.review_loot",
        operator: "create",
        params: {
          targetFrom: "runtime.reviewLootTarget",
          resultFrom: "runtime.reviewLootResult",
          bodyFrom: "data.lootBody",
          evidenceTextFrom: "data.evidenceText",
          memberNameFrom: "data.memberName",
          saveAs: "reviewLoot",
        },
      },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入管理员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.adminEmail" } },
      { id: "fill.password", title: "输入管理员密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.adminPassword" } },
      { id: "click.sign_in", title: "点击登录按钮", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { id: "session.admin.authenticated", title: "等待管理员 session 已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { id: "page.goto.loot", title: "打开目标战利品页面", object: "page.review_loot", operator: "goto", params: { targetFrom: "runtime.reviewLootTarget" } },
    ],
  },

  S0: {
    description: "管理员已登录并位于目标战利品页面，目标可验收结算",
    assertions: [
      { id: "session.admin.authenticated", title: "后端 session 已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { id: "url.loot", title: "当前页面是目标战利品页面", object: "page.url", operator: "match", params: { pattern: "/objectives/.+/loot$" } },
      { id: "review_loot_form.visible", title: "验收战利品表单可见", object: "page.review_loot_form", operator: "visible" },
      { id: "db.review_loot_target.submitted", title: "目标处于待验收状态", object: "db.review_loot_target", operator: "submitted", params: { targetFrom: "runtime.reviewLootTarget" } },
      { id: "db.review_loot_result.present", title: "目标存在测试指标", object: "db.review_loot_result", operator: "present", params: { targetFrom: "runtime.reviewLootTarget", resultFrom: "runtime.reviewLootResult" } },
      { id: "db.review_loot.present", title: "目标存在测试战利品", object: "db.review_loot", operator: "present", params: { targetFrom: "runtime.reviewLootTarget", lootFrom: "runtime.reviewLoot" } },
      { id: "db.review_loot_ledger.absent", title: "测试积分流水不存在", object: "db.review_loot_ledger", operator: "absent", params: { reasonFrom: "data.reason" } },
    ],
  },

  Action: {
    description: "管理员通过页面验收战利品并结算",
    steps: [
      { id: "capture.review_loot_response", title: "监听验收战利品请求", object: "api.review_loot", operator: "capture_response", params: { targetFrom: "runtime.reviewLootTarget", saveAs: "reviewLootResponse" } },
      { id: "click.review_loot", title: "点击验收并结算", object: "page", operator: "click", params: { role: "button", name: "验收并结算" } },
    ],
  },

  S1: {
    description: "目标已结算，积分流水已经生成，管理员仍保持登录",
    assertions: [
      { id: "review_loot_response.ok", title: "验收战利品接口响应成功", object: "api.response", operator: "ok", params: { responseFrom: "runtime.reviewLootResponse", status: 200 } },
      { id: "db.review_loot_target.settled", title: "目标已经结算", object: "db.review_loot_target", operator: "settled", params: { targetFrom: "runtime.reviewLootTarget", pointsFrom: "data.points" } },
      { id: "db.review_loot_ledger.present", title: "数据库存在测试积分流水", object: "db.review_loot_ledger", operator: "present", params: { targetFrom: "runtime.reviewLootTarget", memberNameFrom: "data.memberName", pointsFrom: "data.points" } },
      { id: "url.reports", title: "当前页面是统计页面", object: "page.url", operator: "match", params: { pattern: "/reports$" } },
      { id: "session.admin.still_authenticated", title: "管理员仍保持登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除测试积分流水、战利品和指标，恢复目标原始状态并退出登录",
    steps: [
      { id: "db.review_loot_ledger.delete", title: "删除测试积分流水", object: "db.review_loot_ledger", operator: "delete", params: { reasonFrom: "data.reason" } },
      { id: "db.review_loot.delete", title: "删除测试战利品", object: "db.review_loot", operator: "delete", params: { bodyFrom: "data.lootBody", lootFrom: "runtime.reviewLoot" } },
      { id: "db.review_loot_result.delete", title: "删除测试指标", object: "db.review_loot_result", operator: "delete", params: { titleFrom: "data.resultTitle", resultFrom: "runtime.reviewLootResult" } },
      { id: "db.review_loot_target.restore", title: "恢复目标原始状态", object: "db.review_loot_target", operator: "restore", params: { targetFrom: "runtime.reviewLootTarget" } },
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "ory.admin_identity.exists", title: "管理员 Ory 身份仍然存在", object: "ory.identity", operator: "exists", params: { emailFrom: "data.adminEmail" } },
      { id: "db.admin.active", title: "预置管理员账号仍然可用", object: "db.admin", operator: "active", params: { emailFrom: "data.adminEmail" } },
      { id: "db.member.active", title: "预置普通成员账号仍然可用", object: "db.member", operator: "active", params: { memberNameFrom: "data.memberName" } },
    ],
  },
} satisfies StateCaseSpec<AdminReviewLootCaseData>;
