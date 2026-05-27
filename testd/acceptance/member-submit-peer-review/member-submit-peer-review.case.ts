import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MemberSubmitPeerReviewCaseData } from "./_support/member-submit-peer-review.context";

export const memberSubmitPeerReviewCase = {
  id: "acceptance.peer_review.submit.member",
  title: "成员可以提交匿名互评",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "peer-review", "member", "happy-path"],

  data: {
    email: "orf-member-e2e@orf.local",
    password: "OrfMemberE2E!2026",
    name: "ORF Member E2E",
    role: "member",
    lootBody: "E2E-PEER-LOOT-BODY: 匿名互评前置战利品",
    ratio: "1",
  },

  B: {
    description: "系统服务、Ory、数据库和预置普通成员可用，当前浏览器未登录且测试战利品和测试匿名互评不存在",
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
      { id: "db.peer_review_target.available", title: "存在可构造成员提交匿名互评起点的目标", object: "db.peer_review_target", operator: "available" },
      {
        id: "db.peer_review_loot.absent",
        title: "测试战利品不存在",
        object: "db.peer_review_loot",
        operator: "absent",
        params: { bodyFrom: "data.lootBody" },
      },
      {
        id: "db.peer_review.absent_without_target",
        title: "测试匿名互评不存在",
        object: "db.peer_review",
        operator: "absent",
        params: { reviewerFrom: "data.name" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备已提交战利品的目标，登录普通成员并进入目标战利品页面",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "db.peer_review_target.select",
        title: "选择可构造成员提交匿名互评起点的目标",
        object: "db.peer_review_target",
        operator: "select",
        params: { saveAs: "peerReviewTarget" },
      },
      {
        id: "db.peer_review_target.original_state_recorded",
        title: "记录目标原始状态",
        object: "db.peer_review_target",
        operator: "original_state_recorded",
        params: { targetFrom: "runtime.peerReviewTarget" },
      },
      {
        id: "db.peer_review_target.prepare",
        title: "准备目标为可提交匿名互评状态",
        object: "db.peer_review_target",
        operator: "prepare",
        params: { targetFrom: "runtime.peerReviewTarget", memberNameFrom: "data.name" },
      },
      {
        id: "db.peer_review_loot.create",
        title: "准备匿名互评前置战利品",
        object: "db.peer_review_loot",
        operator: "create",
        params: {
          targetFrom: "runtime.peerReviewTarget",
          bodyFrom: "data.lootBody",
          memberNameFrom: "data.name",
          saveAs: "peerReviewLoot",
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
      {
        id: "page.goto.loot",
        title: "打开目标战利品页面",
        object: "page.peer_review",
        operator: "goto",
        params: { targetFrom: "runtime.peerReviewTarget" },
      },
    ],
  },

  S0: {
    description: "普通成员已登录并位于目标战利品页面，目标可提交匿名互评",
    assertions: [
      {
        id: "session.member.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "url.loot", title: "当前页面是目标战利品页面", object: "page.url", operator: "match", params: { pattern: "/objectives/.+/loot$" } },
      { id: "peer_review_form.visible", title: "匿名互评表单可见", object: "page.peer_review_form", operator: "visible" },
      {
        id: "db.peer_review_target.submitted_for_member",
        title: "目标处于待验收状态且挑战者为普通成员",
        object: "db.peer_review_target",
        operator: "submitted_for_member",
        params: { targetFrom: "runtime.peerReviewTarget", memberNameFrom: "data.name" },
      },
      {
        id: "db.peer_review_loot.present",
        title: "目标存在测试战利品",
        object: "db.peer_review_loot",
        operator: "present",
        params: { targetFrom: "runtime.peerReviewTarget", lootFrom: "runtime.peerReviewLoot" },
      },
      {
        id: "db.peer_review.absent",
        title: "目标不存在测试匿名互评",
        object: "db.peer_review",
        operator: "absent",
        params: { targetFrom: "runtime.peerReviewTarget", reviewerFrom: "data.name" },
      },
    ],
  },

  Action: {
    description: "普通成员通过页面提交测试匿名互评",
    steps: [
      {
        id: "fill.member_ratio",
        title: "输入普通成员贡献比例",
        object: "page",
        operator: "fill",
        params: { labelFrom: "data.name", valueFrom: "data.ratio" },
      },
      {
        id: "capture.submit_peer_review_response",
        title: "监听提交匿名互评请求",
        object: "api.peer_review_submit",
        operator: "capture_response",
        params: { targetFrom: "runtime.peerReviewTarget", saveAs: "submitPeerReviewResponse" },
      },
      { id: "click.submit_peer_review", title: "点击提交匿名互评", object: "page", operator: "click", params: { role: "button", name: "提交匿名互评" } },
      {
        id: "submit_peer_review_response.record",
        title: "记录提交的匿名互评",
        object: "api.peer_review_submit_response",
        operator: "record_review",
        params: { responseFrom: "runtime.submitPeerReviewResponse", saveAs: "submittedPeerReview" },
      },
    ],
  },

  S1: {
    description: "测试匿名互评已经持久化，普通成员仍保持登录",
    assertions: [
      {
        id: "submit_peer_review_response.ok",
        title: "提交匿名互评接口响应成功",
        object: "api.response",
        operator: "ok",
        params: { responseFrom: "runtime.submitPeerReviewResponse", status: 200 },
      },
      {
        id: "submitted_peer_review.matches",
        title: "提交匿名互评接口返回内容正确",
        object: "api.peer_review_submit_response",
        operator: "matches",
        params: {
          reviewFrom: "runtime.submittedPeerReview",
          targetFrom: "runtime.peerReviewTarget",
          reviewerFrom: "data.name",
          ratioFrom: "data.ratio",
        },
      },
      {
        id: "db.peer_review.present",
        title: "数据库存在测试匿名互评",
        object: "db.peer_review",
        operator: "present",
        params: { targetFrom: "runtime.peerReviewTarget", reviewerFrom: "data.name", ratioFrom: "data.ratio" },
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
    description: "删除测试匿名互评和测试战利品，恢复目标原始状态并退出登录",
    steps: [
      {
        id: "db.peer_review.delete",
        title: "删除测试匿名互评",
        object: "db.peer_review",
        operator: "delete",
        params: { targetFrom: "runtime.peerReviewTarget", reviewerFrom: "data.name", reviewFrom: "runtime.submittedPeerReview" },
      },
      {
        id: "db.peer_review_loot.delete",
        title: "删除测试战利品",
        object: "db.peer_review_loot",
        operator: "delete",
        params: { bodyFrom: "data.lootBody", lootFrom: "runtime.peerReviewLoot" },
      },
      {
        id: "db.peer_review_target.restore",
        title: "恢复目标原始状态",
        object: "db.peer_review_target",
        operator: "restore",
        params: { targetFrom: "runtime.peerReviewTarget" },
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
} satisfies StateCaseSpec<MemberSubmitPeerReviewCaseData>;
