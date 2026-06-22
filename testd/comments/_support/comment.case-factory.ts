import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { CommentCaseData, CommentTargetKind } from "./comment.context";

type CommentCaseKind = "create" | "reply" | "edit" | "delete" | "image";

type CommentCaseDefinition = {
  actorRole: "admin" | "member";
  id: string;
  kind: CommentCaseKind;
  slug: string;
  tags: string[];
  title: string;
};

const targetTypes = ["objective", "task"] as const satisfies readonly CommentTargetKind[];

export function createCommentCaseVariants(definition: CommentCaseDefinition): StateCaseSpec<CommentCaseData>[] {
  return targetTypes.map((targetType) => createCommentCase(definition, targetType));
}

function createCommentCase(definition: CommentCaseDefinition, targetType: CommentTargetKind): StateCaseSpec<CommentCaseData> {
  const targetLabel = targetType === "objective" ? "目标" : "任务";
  const actorLabel = definition.actorRole === "admin" ? "管理员" : "普通成员";
  const marker = `E2E-COMMENT-${definition.slug.toUpperCase()}-${targetType.toUpperCase()}:`;
  const data = createCaseData(definition, targetType, marker);

  return {
    id: `${definition.id}.${targetType}`,
    title: `${definition.title}（${targetLabel}）`,
    model: STATE_CASE_MODEL,
    tags: [...definition.tags, targetType],
    data,
    B: {
      description: "基准状态",
      assertions: createBaseAssertions(),
    },
    Setup: {
      description: "构造 S0",
      steps: createSetupSteps(definition, actorLabel),
    },
    S0: {
      description: "Action 前状态",
      assertions: createS0Assertions(definition, actorLabel),
    },
    Action: {
      description: "被测业务动作",
      steps: createActionSteps(definition),
    },
    S1: {
      description: "Action 后状态",
      assertions: createS1Assertions(definition, actorLabel),
    },
    Clean: {
      description: "恢复 B",
      steps: createCleanSteps(definition, actorLabel),
    },
  };
}

function createCaseData(definition: CommentCaseDefinition, targetType: CommentTargetKind, marker: string): CommentCaseData {
  const targetLabel = targetType === "objective" ? "目标" : "任务";
  const accountRole = definition.actorRole === "admin" ? "admin" : "member";
  const accountLabel = definition.actorRole === "admin" ? "Admin" : "Member";
  const email = `orf-comment-${definition.slug}-${targetType}@orf.local`;
  const base = {
    email,
    password: `OrfComment${pascal(definition.slug)}${pascal(targetType)}!2026`,
    name: `ORF Comment ${accountLabel} ${pascal(definition.slug)} ${pascal(targetType)}`,
    role: accountRole,
    objectiveId: `obj-testd-comment-${definition.slug}-${targetType}`,
    objectiveTitle: `E2E-COMMENT-${definition.slug.toUpperCase()}-${targetType.toUpperCase()}: ${targetLabel}前置目标`,
    taskId: `task-testd-comment-${definition.slug}-${targetType}`,
    taskTitle: `E2E-COMMENT-${definition.slug.toUpperCase()}-${targetType.toUpperCase()}: ${targetLabel}前置任务`,
    commentTargetType: targetType,
    commentBodyMarker: marker,
  } satisfies CommentCaseData;

  if (definition.kind === "create") {
    return {
      ...base,
      commentBody: `${marker} ${targetLabel}新增评论正文`,
    };
  }

  if (definition.kind === "reply") {
    return {
      ...base,
      rootCommentBody: `${marker} 可回复外层评论正文`,
      replyBody: `${marker} 回复正文`,
    };
  }

  if (definition.kind === "edit") {
    return {
      ...base,
      rootCommentBody: `${marker} 原始评论正文`,
      editedCommentBody: `${marker} 编辑后评论正文`,
    };
  }

  if (definition.kind === "delete") {
    return {
      ...base,
      commentBody: `${marker} 待删除评论正文`,
    };
  }

  return {
    ...base,
    commentBody: `${marker} 图片评论正文`,
    imageFileName: `comment-${definition.slug}-${targetType}.png`,
  };
}

function createBaseAssertions(): StepSpec[] {
  return [
    step("B-1", "api", "frontend.ready", "前端服务 应可用", "frontend.service", "available"),
    step("B-2", "api", "backend.ready", "后端服务 应可用", "api.health", "ok"),
    step("B-3", "api", "frontend.login_entry.accessible", "前端登录页入口 应可访问", "frontend.login_entry", "accessible"),
    step("B-4", "api", "session.endpoint.accessible", "当前会话查询能力 应可用", "auth.session", "accessible"),
    step("B-5", "prisma", "db.ready", "ORF 数据库 应可连接", "db", "ready"),
    step("B-6", "prisma", "db.schema.current", "ORF 数据库 schema 应为 当前测试版本", "db.schema", "current"),
    step("B-7", "api", "ory.admin_public.ready", "Ory/Kratos 认证服务的管理和公共访问能力 应可用", "ory.admin_public", "ready"),
    step("B-8", "api", "session.unauthenticated", "当前会话 应为 未登录", "auth.session", "unauthenticated"),
    step("B-9", "playwright", "browser.cookie.absent", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
    step("B-10", "playwright", "browser.auth_storage.empty", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
  ];
}

function createSetupSteps(definition: CommentCaseDefinition, actorLabel: string): StepSpec[] {
  const steps: StepSpec[] = [
    step("Setup-1", "prisma", "db.test_comments.delete_residue", setupDeleteCommentTitle(definition.kind), "db.test_comments", "delete", {
      actorEmailFrom: "data.email",
      markerFrom: "data.commentBodyMarker",
      ...(definition.kind === "image" ? { imageFileNameFrom: "data.imageFileName" } : {}),
    }),
    step("Setup-2", "prisma", "db.comment_fixture.delete_residue", "删除可能残留的本用例目标和任务", "db.comment_fixture", "delete_target_and_task", {
      objectiveIdFrom: "data.objectiveId",
      objectiveTitleFrom: "data.objectiveTitle",
      taskIdFrom: "data.taskId",
      taskTitleFrom: "data.taskTitle",
    }),
    step("Setup-3", "api", "ory.identity.upsert", `准备${actorLabel}登录身份`, "ory.identity", "upsert_password", {
      emailFrom: "data.email",
      nameFrom: "data.name",
      passwordFrom: "data.password",
      saveAs: "loginIdentity",
    }),
    step("Setup-4", "prisma", "db.comment_actor.prepare", `准备状态为 \`active\` 的${actorLabel}用户和默认团队成员关系`, "db.comment_actor", "prepare", {
      emailFrom: "data.email",
      identityIdFrom: "runtime.loginIdentity.id",
      nameFrom: "data.name",
      roleFrom: "data.role",
      saveAs: "actor",
    }),
    step("Setup-5", "prisma", "db.objective.upsert", objectiveSetupTitle(definition.kind), "db.objective", "upsert", {
      idFrom: "data.objectiveId",
      titleFrom: "data.objectiveTitle",
      teamIdFrom: "runtime.actor.teamId",
      stage: "orfReestimate",
      flowStatus: "reestimating",
      status: "Draft",
      createdByFrom: "runtime.actor.userId",
      updatedByFrom: "runtime.actor.userId",
      saveAs: "fixtureObjective",
    }),
  ];

  let index = 6;
  if (definition.actorRole === "member") {
    steps.push(
      step("Setup-6", "prisma", "db.comment_objective.set_participant", "设置普通成员账号身份参与该目标", "db.comment_objective", "set_participant", {
        objectiveIdFrom: "runtime.fixtureObjective.id",
        memberNameFrom: "data.name",
      }),
    );
    index = 7;
  }

  steps.push(
    step(`Setup-${index++}`, "prisma", "db.comment_task.create", "创建该目标下的任务", "db.comment_task", "create", {
      assigneeFrom: "data.name",
      objectiveIdFrom: "runtime.fixtureObjective.id",
      taskIdFrom: "data.taskId",
      taskTitleFrom: "data.taskTitle",
      teamIdFrom: "runtime.actor.teamId",
      userIdFrom: "runtime.actor.userId",
      saveAs: "fixtureTask",
    }),
    step(`Setup-${index++}`, "prisma", "db.comment_target.record", "记录当前评论对象，评论对象为目标或任务", "db.comment_target", "record", {
      objectiveIdFrom: "runtime.fixtureObjective.id",
      taskIdFrom: "runtime.fixtureTask.id",
      targetTypeFrom: "data.commentTargetType",
      saveAs: "commentTarget",
    }),
  );

  if (definition.kind === "reply" || definition.kind === "edit" || definition.kind === "delete") {
    steps.push(
      step(`Setup-${index++}`, "prisma", "db.comment.create_root", rootCommentSetupTitle(definition.kind), "db.comment", "create_root", {
        actorEmailFrom: "data.email",
        actorNameFrom: "data.name",
        bodyFrom: definition.kind === "delete" ? "data.commentBody" : "data.rootCommentBody",
        markerFrom: "data.commentBodyMarker",
        targetFrom: "runtime.commentTarget",
        saveAs: "rootComment",
      }),
    );
  }

  if (definition.kind === "image") {
    steps.push(
      step(`Setup-${index++}`, "mock", "mock.comment_image.prepare", "准备本用例测试图片文件", "mock.comment_image", "prepare", {
        fileNameFrom: "data.imageFileName",
        saveAs: "imageFile",
      }),
    );
  }

  steps.push(
    step(`Setup-${index++}`, "api", "ory.sessions.revoke", `撤销${actorLabel}登录身份可能残留的登录会话`, "ory.sessions", "revoke_by_email", {
      emailFrom: "data.email",
    }),
    step(`Setup-${index++}`, "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
    step(`Setup-${index++}`, "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
    step(`Setup-${index++}`, "playwright", "login_form.fill_credentials", `输入${actorLabel}邮箱和密码`, "page.login_form", "fill_credentials", {
      emailFrom: "data.email",
      passwordFrom: "data.password",
    }),
    step(`Setup-${index++}`, "playwright", "page.click.sign_in", "点击 \"Sign In\" 登录操作", "page", "click", {
      role: "button",
      name: "Sign In",
    }),
    step(`Setup-${index++}`, "api", "session.authenticated", `当前会话 应为 ${actorLabel}的已登录会话`, "auth.session", "authenticated", {
      emailFrom: "data.email",
      roleFrom: "data.role",
      status: "active",
    }),
    step(`Setup-${index++}`, "playwright", "page.goto.tasks", "打开 计划页面", "page", "goto", { path: "/tasks" }),
    step(`Setup-${index++}`, "api", "api.my_challenges.comment_target.present", `${actorLabel}计划页数据 应包含 ${setupApiTargetTitle(definition.kind)}`, "api.my_challenges.comment_target", "present", {
      targetFrom: "runtime.commentTarget",
    }),
    step(`Setup-${index++}`, "playwright", "page.comment_target.open", "打开当前评论对象的评论窗口", "page.comment_target", "open_comment_panel", {
      targetFrom: "runtime.commentTarget",
    }),
  );

  return steps;
}

function createS0Assertions(definition: CommentCaseDefinition, actorLabel: string): StepSpec[] {
  const session = step("S0-1", "api", "session.authenticated", `当前会话 应为 ${actorLabel}的已登录会话`, "auth.session", "authenticated", {
    emailFrom: "data.email",
    roleFrom: "data.role",
    status: "active",
  });

  if (definition.kind === "create") {
    return [
      session,
      step("S0-2", "prisma", "db.comment_target.mutable", `当前评论对象 应属于 ${definition.actorRole === "admin" ? "" : "普通成员账号身份参与且"}生命周期允许新增评论的目标`, "db.comment_target", "mutable", {
        actorNameFrom: "data.name",
        roleFrom: "data.role",
        targetFrom: "runtime.commentTarget",
      }),
      commonPageS0("S0-3", "S0-4", "S0-5"),
      step("S0-6", "playwright", "comment_composer.ready", "评论输入框 应可用于输入评论", "page.comment_composer", "ready"),
      step("S0-7", "prisma", "db.comment.body_absent", "数据库中 应不存在 本用例测试评论正文", "db.comment", "body_absent", {
        bodyFrom: "data.commentBody",
      }),
    ].flat();
  }

  if (definition.kind === "reply") {
    return [
      session,
      step("S0-2", "playwright", "comment_panel.root_body.visible", "评论窗口 应显示 可回复外层评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S0-3", "playwright", "comment_message.reply.enabled", "可回复外层评论的 \"回复评论\" 操作 应可点击", "page.comment_message", "reply_enabled", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S0-4", "prisma", "db.comment.root.persisted", "数据库中 应存在 可回复外层评论", "db.comment", "root_persisted", {
        authorEmailFrom: "data.email",
        bodyFrom: "data.rootCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S0-5", "prisma", "db.comment.reply.absent", "数据库中 应不存在 本用例回复正文", "db.comment", "body_absent", {
        bodyFrom: "data.replyBody",
      }),
    ];
  }

  if (definition.kind === "edit") {
    return [
      session,
      step("S0-2", "playwright", "comment_panel.original_body.visible", "评论窗口 应显示 本用例原始评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S0-3", "playwright", "comment_message.edit.enabled", "本用例原始评论的 \"编辑评论\" 操作 应可点击", "page.comment_message", "edit_enabled", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S0-4", "prisma", "db.comment.original.persisted", "数据库中 应存在 本用例原始评论正文", "db.comment", "root_persisted", {
        authorEmailFrom: "data.email",
        bodyFrom: "data.rootCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S0-5", "prisma", "db.comment.edited.absent", "数据库中 应不存在 本用例编辑后评论正文", "db.comment", "body_absent", {
        bodyFrom: "data.editedCommentBody",
      }),
    ];
  }

  if (definition.kind === "delete") {
    return [
      session,
      step("S0-2", "playwright", "comment_panel.body.visible", "评论窗口 应显示 本用例测试评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.commentBody",
      }),
      step("S0-3", "playwright", "comment_message.delete.enabled", "本用例测试评论的 \"删除评论\" 操作 应可点击", "page.comment_message", "delete_enabled", {
        bodyFrom: "data.commentBody",
      }),
      step("S0-4", "prisma", "db.comment.body.persisted", "数据库中 应存在 本用例测试评论正文", "db.comment", "root_persisted", {
        authorEmailFrom: "data.email",
        bodyFrom: "data.commentBody",
        targetFrom: "runtime.commentTarget",
      }),
    ];
  }

  return [
    session,
    step("S0-2", "playwright", "comment_composer.ready", "评论输入框 应可用于输入评论", "page.comment_composer", "ready"),
    step("S0-3", "playwright", "comment_composer.image_button.enabled", "\"添加图片或附件\" 操作 应可点击", "page.comment_composer", "image_button_enabled"),
    step("S0-4", "prisma", "db.comment.body_absent", "数据库中 应不存在 本用例测试评论正文", "db.comment", "body_absent", {
      bodyFrom: "data.commentBody",
    }),
    step("S0-5", "prisma", "db.comment.image_absent", "数据库中 应不存在 本用例测试图片附件", "db.comment", "image_absent", {
      fileNameFrom: "data.imageFileName",
    }),
  ];
}

function commonPageS0(pageId: string, rowId: string, titleId: string): StepSpec[] {
  return [
    step(pageId, "playwright", "page.url.tasks", "当前页面 应为 计划页面", "page.url", "match", { pattern: "/tasks$" }),
    step(rowId, "playwright", "comment_target.row.visible", "当前评论对象行 应可见", "page.comment_target", "visible", {
      targetFrom: "runtime.commentTarget",
    }),
    step(titleId, "playwright", "comment_panel.title", "评论窗口标题 应为 当前评论对象标题", "page.comment_panel", "title", {
      targetFrom: "runtime.commentTarget",
    }),
  ];
}

function createActionSteps(definition: CommentCaseDefinition): StepSpec[] {
  if (definition.kind === "create") {
    return [
      step("Action-1", "playwright", "comment_composer.fill", "在评论输入框中输入本用例测试评论正文", "page.comment_composer", "fill", {
        valueFrom: "data.commentBody",
      }),
      step("Action-2", "playwright", "comment_composer.submit", "点击 \"发送评论\" 操作", "page.comment_composer", "submit_comment", {
        saveAs: "commentResponse",
      }),
    ];
  }

  if (definition.kind === "reply") {
    return [
      step("Action-1", "playwright", "comment_message.click_reply", "点击 可回复外层评论的 \"回复评论\" 操作", "page.comment_message", "click_reply", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("Action-2", "playwright", "comment_composer.fill_reply", "在回复评论输入框中输入本用例回复正文", "page.comment_composer", "fill_reply", {
        valueFrom: "data.replyBody",
      }),
      step("Action-3", "playwright", "comment_composer.submit_reply", "点击 \"发送回复\" 操作", "page.comment_composer", "submit_reply", {
        saveAs: "replyResponse",
      }),
    ];
  }

  if (definition.kind === "edit") {
    return [
      step("Action-1", "playwright", "comment_message.click_edit", "点击 本用例原始评论的 \"编辑评论\" 操作", "page.comment_message", "click_edit", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("Action-2", "playwright", "comment_composer.fill_edit", "在编辑评论输入框中输入本用例编辑后评论正文", "page.comment_composer", "fill_edit", {
        valueFrom: "data.editedCommentBody",
      }),
      step("Action-3", "playwright", "comment_composer.submit_edit", "点击 \"保存评论\" 操作", "page.comment_composer", "submit_edit", {
        saveAs: "updateResponse",
        urlEndsWithFrom: "runtime.rootComment.messageApiPath",
      }),
    ];
  }

  if (definition.kind === "delete") {
    return [
      step("Action-1", "playwright", "comment_message.delete", "点击并确认 本用例测试评论的 \"删除评论\" 操作", "page.comment_message", "delete", {
        bodyFrom: "data.commentBody",
        saveAs: "deleteResponse",
        urlEndsWithFrom: "runtime.rootComment.messageApiPath",
      }),
    ];
  }

  return [
    step("Action-1", "playwright", "comment_composer.choose_image", "通过 \"添加图片或附件\" 操作选择本用例测试图片文件", "page.comment_composer", "choose_image", {
      fileFrom: "runtime.imageFile",
      saveAs: "imageUploadResponse",
    }),
    step("Action-2", "playwright", "comment_composer.append_body", "在评论输入框中补充本用例测试评论正文", "page.comment_composer", "append", {
      valueFrom: "data.commentBody",
    }),
    step("Action-3", "playwright", "comment_composer.submit", "点击 \"发送评论\" 操作", "page.comment_composer", "submit_comment", {
      saveAs: "commentResponse",
    }),
  ];
}

function createS1Assertions(definition: CommentCaseDefinition, actorLabel: string): StepSpec[] {
  if (definition.kind === "create") {
    return [
      step("S1-1", "api", "api.comment_response.created", "新增评论结果 应成功并关联当前评论对象", "api.comment_response", "created", {
        bodyFrom: "data.commentBody",
        responseFrom: "runtime.commentResponse",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-2", "playwright", "comment_panel.message.visible", `评论窗口 应显示 ${actorLabel}名称和本用例测试评论正文`, "page.comment_panel", "message_visible", {
        authorFrom: "data.name",
        bodyFrom: "data.commentBody",
      }),
      step("S1-3", "playwright", "comment_composer.empty", "评论输入框 应清空", "page.comment_composer", "empty"),
      step("S1-4", "api", "api.my_challenges.comment.present", `${actorLabel}计划页数据 应包含 当前评论对象的评论线程和本用例测试评论`, "api.my_challenges.comment", "present", {
        authorFrom: "data.name",
        bodyFrom: "data.commentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-5", "prisma", "db.comment.root_persisted", "数据库中 应持久化 当前评论对象的外层评论", "db.comment", "root_persisted", {
        authorEmailFrom: "data.email",
        bodyFrom: "data.commentBody",
        targetFrom: "runtime.commentTarget",
      }),
    ];
  }

  if (definition.kind === "reply") {
    return [
      step("S1-1", "api", "api.reply_response.created", "新增回复结果 应成功并关联当前评论对象", "api.comment_response", "reply_created", {
        bodyFrom: "data.replyBody",
        parentFrom: "runtime.rootComment",
        responseFrom: "runtime.replyResponse",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-2", "playwright", "comment_message.reply_count.visible", "可回复外层评论 应显示回复数量入口", "page.comment_message", "reply_count_visible", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S1-3", "playwright", "comment_message.open_replies", "打开可回复外层评论的回复列表", "page.comment_message", "open_replies", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S1-4", "playwright", "comment_panel.reply.visible", "回复列表 应显示 本用例回复正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.replyBody",
      }),
      step("S1-5", "api", "api.my_challenges.reply.present", "普通成员计划页数据 应包含 本用例回复", "api.my_challenges.comment", "reply_present", {
        bodyFrom: "data.replyBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-6", "prisma", "db.comment.reply_persisted", "数据库中 应持久化 本用例回复，并关联可回复外层评论", "db.comment", "reply_persisted", {
        bodyFrom: "data.replyBody",
        parentFrom: "runtime.rootComment",
        targetFrom: "runtime.commentTarget",
      }),
    ];
  }

  if (definition.kind === "edit") {
    return [
      step("S1-1", "api", "api.update_response.updated", "更新评论结果 应成功并关联当前评论对象", "api.comment_response", "updated", {
        bodyFrom: "data.editedCommentBody",
        previousBodyFrom: "data.rootCommentBody",
        responseFrom: "runtime.updateResponse",
      }),
      step("S1-2", "playwright", "comment_panel.edited.visible", "评论窗口 应显示 本用例编辑后评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.editedCommentBody",
      }),
      step("S1-3", "playwright", "comment_panel.original.hidden", "评论窗口 应不显示 本用例原始评论正文", "page.comment_panel", "body_hidden", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S1-4", "api", "api.my_challenges.edited.present", "普通成员计划页数据 应包含 本用例编辑后评论正文", "api.my_challenges.comment", "present", {
        bodyFrom: "data.editedCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-5", "prisma", "db.comment.edited_persisted", "数据库中 应持久化 本用例编辑后评论正文", "db.comment", "root_persisted", {
        authorEmailFrom: "data.email",
        bodyFrom: "data.editedCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
    ];
  }

  if (definition.kind === "delete") {
    return [
      step("S1-1", "api", "api.delete_response.deleted", "删除评论结果 应成功并关联当前评论对象", "api.comment_response", "deleted", {
        commentFrom: "runtime.rootComment",
        responseFrom: "runtime.deleteResponse",
      }),
      step("S1-2", "playwright", "comment_panel.body.hidden", "评论窗口 应不显示 本用例测试评论正文", "page.comment_panel", "body_hidden", {
        bodyFrom: "data.commentBody",
      }),
      step("S1-3", "api", "api.my_challenges.comment.absent", "普通成员计划页数据 应不包含 本用例测试评论", "api.my_challenges.comment", "absent", {
        bodyFrom: "data.commentBody",
      }),
      step("S1-4", "prisma", "db.comment.body_absent", "数据库中 应不存在 本用例测试评论正文", "db.comment", "body_absent", {
        bodyFrom: "data.commentBody",
      }),
    ];
  }

  return [
    step("S1-1", "api", "api.image_upload_response.ok", "上传评论图片结果 应成功", "api.comment_upload_response", "ok", {
      fileNameFrom: "data.imageFileName",
      responseFrom: "runtime.imageUploadResponse",
    }),
    step("S1-2", "api", "api.comment_response.image_created", "新增评论结果 应成功并关联当前评论对象", "api.comment_response", "image_created", {
      responseFrom: "runtime.commentResponse",
      targetFrom: "runtime.commentTarget",
    }),
    step("S1-3", "playwright", "comment_panel.body.visible", "评论窗口 应显示 本用例测试评论正文", "page.comment_panel", "body_visible", {
      bodyFrom: "data.commentBody",
    }),
    step("S1-4", "playwright", "comment_panel.image.visible", "评论窗口的本用例测试评论 应显示 本用例测试图片", "page.comment_panel", "image_visible", {
      bodyFrom: "data.commentBody",
      fileNameFrom: "data.imageFileName",
    }),
    step("S1-5", "api", "api.my_challenges.image_comment.present", "普通成员计划页数据 应包含 当前评论对象的图片评论", "api.my_challenges.comment", "image_present", {
      bodyFrom: "data.commentBody",
      fileNameFrom: "data.imageFileName",
      targetFrom: "runtime.commentTarget",
    }),
    step("S1-6", "prisma", "db.comment.image_persisted", "数据库中 应持久化 本用例测试评论和图片附件关联", "db.comment", "image_persisted", {
      bodyMarkerFrom: "data.commentBodyMarker",
      fileNameFrom: "data.imageFileName",
      targetFrom: "runtime.commentTarget",
    }),
  ];
}

function createCleanSteps(definition: CommentCaseDefinition, actorLabel: string): StepSpec[] {
  const steps = [
    step("Clean-1", "playwright", "comment_panel.close", "若评论窗口仍打开，关闭评论窗口", "page.comment_panel", "close", {
      optional: true,
    }),
    step("Clean-2", "prisma", "db.test_comments.delete", cleanDeleteCommentTitle(definition.kind), "db.test_comments", "delete", {
      actorEmailFrom: "data.email",
      markerFrom: "data.commentBodyMarker",
      ...(definition.kind === "image" ? { imageFileNameFrom: "data.imageFileName", saveAs: "deletedAttachmentObjectKeys" } : {}),
    }),
  ];

  let index = 3;
  if (definition.kind === "image") {
    steps.push(
      step("Clean-3", "api", "api.comment_attachment_storage.delete", "删除 本用例上传的测试图片存储对象", "api.comment_attachment_storage", "delete", {
        objectKeysFrom: "runtime.deletedAttachmentObjectKeys",
      }),
    );
    index = 4;
  }

  steps.push(
    step(`Clean-${index++}`, "prisma", "db.comment_task.delete", "删除 本用例创建的任务", "db.comment_task", "delete", {
      taskIdFrom: "data.taskId",
      taskTitleFrom: "data.taskTitle",
    }),
    step(`Clean-${index++}`, "prisma", "db.objective.delete", "删除 本用例创建的目标及其派生数据", "db.objective", "delete", {
      idFrom: "data.objectiveId",
      titleFrom: "data.objectiveTitle",
    }),
    step(`Clean-${index++}`, "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
    step(`Clean-${index++}`, "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
    step(`Clean-${index++}`, "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
    step(`Clean-${index++}`, "api", "ory.sessions.revoke", `撤销${actorLabel}登录身份的残留登录会话`, "ory.sessions", "revoke_by_email", {
      emailFrom: "data.email",
    }),
    step(`Clean-${index++}`, "api", "ory.identity.delete", `删除${actorLabel}登录身份`, "ory.identity", "delete_by_email", {
      emailFrom: "data.email",
    }),
    step(`Clean-${index++}`, "prisma", "db.comment_actor.delete", `删除${actorLabel}默认团队成员关系和用户记录`, "db.comment_actor", "delete", {
      emailFrom: "data.email",
    }),
    step(`Clean-${index++}`, "prisma", "db.test_comments.absent", cleanAbsentCommentTitle(definition.kind), "db.test_comments", "absent", {
      actorEmailFrom: "data.email",
      markerFrom: "data.commentBodyMarker",
      ...(definition.kind === "image" ? { imageFileNameFrom: "data.imageFileName" } : {}),
    }),
    step(`Clean-${index++}`, "prisma", "db.comment_fixture.absent", "本用例创建的目标和任务 应不存在", "db.comment_fixture", "target_and_task_absent", {
      objectiveIdFrom: "data.objectiveId",
      objectiveTitleFrom: "data.objectiveTitle",
      taskIdFrom: "data.taskId",
      taskTitleFrom: "data.taskTitle",
    }),
  );

  return steps;
}

function setupDeleteCommentTitle(kind: CommentCaseKind) {
  if (kind === "reply") return "删除可能残留的本用例测试评论和回复";
  if (kind === "image") return "删除可能残留的本用例测试评论和图片附件";
  return "删除可能残留的本用例测试评论";
}

function objectiveSetupTitle(kind: CommentCaseKind) {
  return kind === "create" || kind === "image"
    ? "创建生命周期允许新增评论的目标"
    : "创建生命周期允许评论操作的目标";
}

function rootCommentSetupTitle(kind: CommentCaseKind) {
  if (kind === "reply") return "创建当前评论对象上的可回复外层评论";
  return "创建普通成员在当前评论对象上的外层评论";
}

function setupApiTargetTitle(kind: CommentCaseKind) {
  if (kind === "reply") return "当前评论对象和可回复外层评论";
  if (kind === "edit") return "当前评论对象和本用例原始评论";
  if (kind === "delete") return "当前评论对象和本用例测试评论";
  return "当前评论对象";
}

function cleanDeleteCommentTitle(kind: CommentCaseKind) {
  if (kind === "reply") return "删除 本用例创建的测试评论、回复及空线程";
  if (kind === "image") return "删除 本用例创建的测试评论、图片附件及空线程";
  return "删除 本用例创建的测试评论及空线程";
}

function cleanAbsentCommentTitle(kind: CommentCaseKind) {
  if (kind === "reply") return "本用例测试评论和回复 应不存在";
  if (kind === "image") return "本用例测试评论和图片附件 应不存在";
  return "本用例测试评论 应不存在";
}

function step(
  caseStepId: string,
  method: StepExecutionMethod,
  id: string,
  title: string,
  object: string,
  operator: string,
  params?: Record<string, unknown>,
): StepSpec {
  return {
    id,
    title,
    source: { caseStepId, method },
    object,
    operator,
    ...(params ? { params } : {}),
  };
}

function pascal(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`)
    .join("");
}
