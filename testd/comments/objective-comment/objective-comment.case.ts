import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { ObjectiveCommentCaseData } from "./_support/objective-comment.context";

export const objectiveCommentCreateCase = {
  id: "comments.objective.create",
  title: "管理员可以在计划页面给目标新增评论",
  model: STATE_CASE_MODEL,
  tags: ["comments", "objective", "create", "admin", "happy-path"],

  data: {
    email: "zrx831@gmail.com",
    password: "123123123",
    name: "zrx",
    role: "admin",
    commentBody: "E2E-PLAN-COMMENT: 需要补充边界样例覆盖情况",
    commentBodyPrefix: "E2E-PLAN-COMMENT:",
  },

  B: {
    description: "系统已有可评论目标，当前浏览器未登录，且没有本用例评论残留",
    assertions: [
      {
        id: "backend.ready",
        title: "后端服务可用",
        object: "api.health",
        operator: "ok",
      },
      {
        id: "db.ready",
        title: "数据库可连接",
        object: "db",
        operator: "ready",
      },
      {
        id: "ory.ready",
        title: "Ory Admin API 可用",
        object: "ory.admin",
        operator: "ready",
      },
      {
        id: "ory.identity.exists",
        title: "Ory 测试身份已存在",
        object: "ory.identity",
        operator: "exists",
        params: {
          emailFrom: "data.email",
        },
      },
      {
        id: "db.member.fixture.exists",
        title: "ORF 管理员基准夹具存在",
        object: "db.member.fixture",
        operator: "exists",
      },
      {
        id: "db.objective.fixture.exists",
        title: "当前用户可见目标基准夹具存在",
        object: "db.objective.fixture",
        operator: "exists",
      },
      {
        id: "db.test_comments.absent",
        title: "不存在本用例评论残留",
        object: "db.test_comments",
        operator: "absent",
        params: {
          prefixFrom: "data.commentBodyPrefix",
        },
      },
      {
        id: "protected.redirects_to_auth",
        title: "计划页受保护且未登录会回到登录页",
        object: "page.protected",
        operator: "redirects_to_auth",
        params: {
          path: "/tasks",
          pattern: "/auth$",
        },
      },
      {
        id: "session.unauthenticated",
        title: "后端 session 未登录",
        object: "auth.session",
        operator: "unauthenticated",
      },
      {
        id: "cookie.absent",
        title: "浏览器不存在登录 cookie",
        object: "browser.cookie",
        operator: "absent",
      },
      {
        id: "storage.empty",
        title: "浏览器 storage 不含登录态",
        object: "browser.auth_storage",
        operator: "empty",
      },
    ],
  },

  Setup: {
    description: "登录管理员，进入计划页并打开一个可见目标的评论窗口",
    steps: [
      {
        id: "browser.clear",
        title: "清理浏览器状态",
        object: "browser",
        operator: "clear_state",
      },
      {
        id: "page.goto.auth",
        title: "打开登录页",
        object: "page",
        operator: "goto",
        params: {
          path: "/auth",
        },
      },
      {
        id: "fill.email",
        title: "输入邮箱",
        object: "page",
        operator: "fill",
        params: {
          label: "Email",
          valueFrom: "data.email",
        },
      },
      {
        id: "fill.password",
        title: "输入密码",
        object: "page",
        operator: "fill",
        params: {
          label: "Password",
          exact: true,
          valueFrom: "data.password",
        },
      },
      {
        id: "click.sign_in",
        title: "点击登录按钮",
        object: "page",
        operator: "click",
        params: {
          role: "button",
          name: "Sign In",
        },
      },
      {
        id: "session.authenticated",
        title: "等待后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: {
          emailFrom: "data.email",
          roleFrom: "data.role",
        },
      },
      {
        id: "page.goto.tasks",
        title: "打开计划页",
        object: "page",
        operator: "goto",
        params: {
          path: "/tasks",
        },
      },
      {
        id: "api.select_objective_target",
        title: "选择当前管理员可见目标作为评论对象",
        object: "api.my_challenges",
        operator: "select_objective_target",
        params: {
          saveAs: "commentTarget",
        },
      },
      {
        id: "page.open_objective_comment",
        title: "打开目标评论窗口",
        object: "page.objective_comment",
        operator: "open",
        params: {
          targetFrom: "runtime.commentTarget",
        },
      },
    ],
  },

  S0: {
    description: "评论窗口绑定当前目标，评论输入区可用，测试评论尚不存在",
    assertions: [
      {
        id: "session.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: {
          emailFrom: "data.email",
          roleFrom: "data.role",
        },
      },
      {
        id: "api.objective_target.present",
        title: "我的挑战数据中存在所选目标",
        object: "api.my_challenges.objective_target",
        operator: "present",
        params: {
          targetFrom: "runtime.commentTarget",
        },
      },
      {
        id: "url.tasks",
        title: "当前页面是计划页",
        object: "page.url",
        operator: "match",
        params: {
          pattern: "/tasks$",
        },
      },
      {
        id: "objective_row.visible",
        title: "所选目标行可见",
        object: "page.objective_row",
        operator: "visible",
        params: {
          targetFrom: "runtime.commentTarget",
        },
      },
      {
        id: "comment_panel.title",
        title: "评论窗口标题匹配所选目标",
        object: "page.comment_panel",
        operator: "title",
        params: {
          targetFrom: "runtime.commentTarget",
        },
      },
      {
        id: "comment_composer.ready",
        title: "评论输入框可用",
        object: "page.comment_composer",
        operator: "ready",
      },
      {
        id: "comment_send.disabled",
        title: "空评论不能发送",
        object: "page.comment_send",
        operator: "disabled",
      },
      {
        id: "db.test_comments.absent",
        title: "数据库中不存在本用例评论正文",
        object: "db.test_comments",
        operator: "absent",
        params: {
          prefixFrom: "data.commentBodyPrefix",
        },
      },
    ],
  },

  Action: {
    description: "输入并提交一条目标外层评论",
    steps: [
      {
        id: "capture.comment_response",
        title: "开始捕获新增评论接口响应",
        object: "api",
        operator: "capture_response",
        params: {
          urlEndsWith: "/api/comments",
          method: "POST",
          saveAs: "commentResponse",
        },
      },
      {
        id: "fill.comment",
        title: "输入评论正文",
        object: "page.comment_composer",
        operator: "fill",
        params: {
          valueFrom: "data.commentBody",
        },
      },
      {
        id: "submit.comment",
        title: "提交评论",
        object: "page.comment_composer",
        operator: "submit",
      },
    ],
  },

  S1: {
    description: "评论在 UI、API 和数据库中都绑定到所选目标",
    assertions: [
      {
        id: "comment_response.matches",
        title: "新增评论接口响应成功且目标匹配",
        object: "api.comment_response",
        operator: "matches",
        params: {
          responseFrom: "runtime.commentResponse",
          targetFrom: "runtime.commentTarget",
          bodyFrom: "data.commentBody",
        },
      },
      {
        id: "comment.author.visible",
        title: "评论作者显示为当前管理员",
        object: "page.comment_author",
        operator: "visible",
        params: {
          authorFrom: "data.name",
        },
      },
      {
        id: "comment.body.visible",
        title: "评论正文显示在窗口中",
        object: "page.comment_body",
        operator: "visible",
        params: {
          bodyFrom: "data.commentBody",
        },
      },
      {
        id: "comment_composer.empty",
        title: "提交后输入框清空并回到默认状态",
        object: "page.comment_composer",
        operator: "empty",
      },
      {
        id: "comment_panel.close",
        title: "关闭评论窗口",
        object: "page.comment_panel",
        operator: "close",
      },
      {
        id: "objective_comment_badge.visible",
        title: "目标行显示评论数量入口",
        object: "page.objective_comment_badge",
        operator: "visible",
        params: {
          targetFrom: "runtime.commentTarget",
        },
      },
      {
        id: "objective_comment_badge.open",
        title: "通过评论数量入口重新打开评论窗口",
        object: "page.objective_comment_badge",
        operator: "open",
        params: {
          targetFrom: "runtime.commentTarget",
        },
      },
      {
        id: "comment.body.visible.after_reopen",
        title: "重新打开后仍能看到评论正文",
        object: "page.comment_body",
        operator: "visible",
        params: {
          bodyFrom: "data.commentBody",
        },
      },
      {
        id: "api.my_challenges.comment.present",
        title: "我的挑战接口返回新增评论",
        object: "api.my_challenges.comment",
        operator: "present",
        params: {
          targetFrom: "runtime.commentTarget",
          bodyFrom: "data.commentBody",
          authorFrom: "data.name",
        },
      },
      {
        id: "db.comment.persisted",
        title: "数据库中持久化了目标外层评论",
        object: "db.comment",
        operator: "persisted",
        params: {
          targetFrom: "runtime.commentTarget",
          bodyFrom: "data.commentBody",
          emailFrom: "data.email",
        },
      },
    ],
  },

  Clean: {
    description: "删除本用例评论并退出登录，保留目标数据和管理员夹具",
    steps: [
      {
        id: "comment_panel.close",
        title: "关闭评论窗口",
        object: "page.comment_panel",
        operator: "close",
        params: {
          optional: true,
        },
      },
      {
        id: "db.test_comments.delete",
        title: "删除本用例评论数据",
        object: "db.test_comments",
        operator: "delete",
        params: {
          prefixFrom: "data.commentBodyPrefix",
        },
      },
      {
        id: "db.test_comments.absent",
        title: "确认本用例评论数据已清理",
        object: "db.test_comments",
        operator: "absent",
        params: {
          prefixFrom: "data.commentBodyPrefix",
        },
      },
      {
        id: "auth.logout",
        title: "退出当前登录态",
        object: "auth",
        operator: "logout",
      },
      {
        id: "browser.clear",
        title: "清理浏览器状态",
        object: "browser",
        operator: "clear_state",
      },
      {
        id: "db.member.fixture.exists",
        title: "管理员夹具仍然存在",
        object: "db.member.fixture",
        operator: "exists",
      },
      {
        id: "db.objective.fixture.exists",
        title: "可见目标夹具仍然存在",
        object: "db.objective.fixture",
        operator: "exists",
      },
      {
        id: "ory.identity.exists",
        title: "Ory 测试身份仍然存在",
        object: "ory.identity",
        operator: "exists",
        params: {
          emailFrom: "data.email",
        },
      },
    ],
  },
} satisfies StateCaseSpec<ObjectiveCommentCaseData>;
