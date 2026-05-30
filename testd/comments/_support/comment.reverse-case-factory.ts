import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { CommentCaseData, CommentTargetKind } from "./comment.context";

type ReverseCommentCaseKind =
  | "admin-create-forbidden"
  | "member-create-forbidden"
  | "reply-forbidden"
  | "edit-forbidden"
  | "delete-forbidden"
  | "image-invalid-file";

type ReverseCommentCaseDefinition = {
  actorLabel: string;
  id: string;
  kind: ReverseCommentCaseKind;
  secondaryLabel?: string;
  slug: string;
  tags: string[];
  title: string;
};

const targetTypes = ["objective", "task"] as const satisfies readonly CommentTargetKind[];

export function createReverseCommentCaseVariants(
  definition: ReverseCommentCaseDefinition,
): StateCaseSpec<CommentCaseData>[] {
  return targetTypes.map((targetType) => createReverseCommentCase(definition, targetType));
}

function createReverseCommentCase(
  definition: ReverseCommentCaseDefinition,
  targetType: CommentTargetKind,
): StateCaseSpec<CommentCaseData> {
  const targetLabel = targetType === "objective" ? "目标" : "任务";
  const marker = `E2E-COMMENT-${definition.slug.toUpperCase()}-${targetType.toUpperCase()}:`;
  const data = createReverseCaseData(definition, targetType, marker);

  return {
    id: `${definition.id}.${targetType}`,
    title: `${definition.title}（${targetLabel}）`,
    model: STATE_CASE_MODEL,
    tags: [...definition.tags, targetType],
    data,
    B: {
      description: "基准状态",
      assertions: baseAssertions(),
    },
    Setup: {
      description: "构造 S0",
      steps: setupSteps(definition),
    },
    S0: {
      description: "Action 前状态",
      assertions: s0Assertions(definition),
    },
    Action: {
      description: "被测业务动作",
      steps: actionSteps(definition),
    },
    S1: {
      description: "Action 后状态",
      assertions: s1Assertions(definition),
    },
    Clean: {
      description: "恢复 B",
      steps: cleanSteps(definition),
    },
  };
}

function createReverseCaseData(
  definition: ReverseCommentCaseDefinition,
  targetType: CommentTargetKind,
  marker: string,
): CommentCaseData {
  const targetLabel = targetType === "objective" ? "目标" : "任务";
  const actorName = `ORF Comment ${pascal(definition.slug)} Actor ${pascal(targetType)}`;
  const secondaryName = `ORF Comment ${pascal(definition.slug)} Participant ${pascal(targetType)}`;
  const data = {
    email: `orf-comment-${definition.slug}-${targetType}@orf.local`,
    password: `OrfComment${pascal(definition.slug)}${pascal(targetType)}!2026`,
    name: actorName,
    role: "member" as const,
    secondaryEmail: `orf-comment-${definition.slug}-${targetType}-participant@orf.local`,
    secondaryPassword: `OrfComment${pascal(definition.slug)}${pascal(targetType)}Participant!2026`,
    secondaryName,
    secondaryRole: "member" as const,
    objectiveId: `obj-testd-comment-${definition.slug}-${targetType}`,
    objectiveTitle: `E2E-COMMENT-${definition.slug.toUpperCase()}-${targetType.toUpperCase()}: ${targetLabel}前置目标`,
    taskId: `task-testd-comment-${definition.slug}-${targetType}`,
    taskTitle: `E2E-COMMENT-${definition.slug.toUpperCase()}-${targetType.toUpperCase()}: ${targetLabel}前置任务`,
    commentTargetType: targetType,
    commentBodyMarker: marker,
  } satisfies CommentCaseData;

  if (definition.kind === "reply-forbidden") {
    return {
      ...data,
      rootCommentBody: `${marker} 可回复外层评论正文`,
      replyBody: `${marker} 非参与成员回复正文`,
    };
  }

  if (definition.kind === "edit-forbidden") {
    return {
      ...data,
      rootCommentBody: `${marker} 原始评论正文`,
      editedCommentBody: `${marker} 非作者编辑后评论正文`,
    };
  }

  if (definition.kind === "delete-forbidden") {
    return {
      ...data,
      commentBody: `${marker} 待删除评论正文`,
    };
  }

  if (definition.kind === "image-invalid-file") {
    return {
      ...data,
      invalidFileName: `comment-${definition.slug}-${targetType}.txt`,
      commentBody: `${marker} 非图片文件评论正文`,
    };
  }

  return {
    ...data,
    commentBody: `${marker} 非参与成员新增评论正文`,
  };
}

function baseAssertions(): StepSpec[] {
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

function setupSteps(definition: ReverseCommentCaseDefinition): StepSpec[] {
  const steps: StepSpec[] = [
    step("Setup-1", "prisma", "db.test_comments.delete_residue", setupDeleteCommentTitle(definition.kind), "db.test_comments", "delete", {
      markerFrom: "data.commentBodyMarker",
      ...(definition.kind === "image-invalid-file" ? { imageFileNameFrom: "data.invalidFileName" } : {}),
    }),
    step("Setup-2", "prisma", "db.comment_fixture.delete_residue", "删除可能残留的本用例目标和任务", "db.comment_fixture", "delete_target_and_task", {
      objectiveIdFrom: "data.objectiveId",
      objectiveTitleFrom: "data.objectiveTitle",
      taskIdFrom: "data.taskId",
      taskTitleFrom: "data.taskTitle",
    }),
    step("Setup-3", "api", "ory.actor_identity.upsert", `准备${definition.actorLabel}登录身份`, "ory.identity", "upsert_password", {
      emailFrom: "data.email",
      nameFrom: "data.name",
      passwordFrom: "data.password",
      saveAs: "actorIdentity",
    }),
    step("Setup-4", "prisma", "db.actor.prepare", `准备状态为 \`active\` 的${definition.actorLabel}用户和默认团队成员关系，角色为 \`member\``, "db.comment_actor", "prepare", {
      emailFrom: "data.email",
      identityIdFrom: "runtime.actorIdentity.id",
      nameFrom: "data.name",
      roleFrom: "data.role",
      saveAs: "actor",
    }),
    step("Setup-5", "prisma", "db.member_comment_manage_permission.snapshot", "记录默认团队 member 角色评论管理权限配置快照", "db.member_comment_manage_permission", "snapshot", {
      teamIdFrom: "runtime.actor.teamId",
      saveAs: "memberCommentManagePermissionSnapshot",
    }),
    step("Setup-6", "prisma", "db.member_comment_manage_permission.disable", "确保默认团队 member 角色不具备 `comment.manage` 权限", "db.member_comment_manage_permission", "disable", {
      teamIdFrom: "runtime.actor.teamId",
    }),
  ];

  let index = 7;
  if (definition.kind !== "image-invalid-file") {
    steps.push(
      step(`Setup-${index++}`, "api", "ory.secondary_identity.upsert", `准备${definition.secondaryLabel ?? "目标参与成员"}登录身份`, "ory.identity", "upsert_password", {
        emailFrom: "data.secondaryEmail",
        nameFrom: "data.secondaryName",
        passwordFrom: "data.secondaryPassword",
        saveAs: "secondaryIdentity",
      }),
      step(`Setup-${index++}`, "prisma", "db.secondary.prepare", `准备状态为 \`active\` 的${definition.secondaryLabel ?? "目标参与成员"}用户和默认团队成员关系，角色为 \`member\``, "db.comment_actor", "prepare", {
        emailFrom: "data.secondaryEmail",
        identityIdFrom: "runtime.secondaryIdentity.id",
        nameFrom: "data.secondaryName",
        roleFrom: "data.secondaryRole",
        saveAs: "secondaryActor",
      }),
    );
  }

  steps.push(
    step(`Setup-${index++}`, "prisma", "db.objective.upsert", objectiveSetupTitle(definition.kind), "db.objective", "upsert", {
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
  );

  if (definition.kind === "edit-forbidden" || definition.kind === "delete-forbidden") {
    steps.push(
      step(`Setup-${index++}`, "prisma", "db.comment_objective.set_actor_participant", "设置非作者普通成员参与该目标", "db.comment_objective", "set_participant", {
        objectiveIdFrom: "runtime.fixtureObjective.id",
        memberNameFrom: "data.name",
      }),
      step(`Setup-${index++}`, "prisma", "db.comment_objective.set_secondary_participant", "设置评论作者普通成员参与该目标", "db.comment_objective", "set_participant", {
        objectiveIdFrom: "runtime.fixtureObjective.id",
        memberNameFrom: "data.secondaryName",
      }),
    );
  } else {
    steps.push(
      step(`Setup-${index++}`, "prisma", "db.comment_objective.set_secondary_participant", participantSetupTitle(definition.kind), "db.comment_objective", "set_participant", {
        objectiveIdFrom: "runtime.fixtureObjective.id",
        memberNameFrom: definition.kind === "image-invalid-file" ? "data.name" : "data.secondaryName",
      }),
    );
  }

  steps.push(
    step(`Setup-${index++}`, "prisma", "db.comment_task.create", "创建该目标下的任务", "db.comment_task", "create", {
      assigneeFrom: definition.kind === "image-invalid-file" ? "data.name" : "data.secondaryName",
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

  if (definition.kind === "reply-forbidden" || definition.kind === "edit-forbidden" || definition.kind === "delete-forbidden") {
    steps.push(
      step(`Setup-${index++}`, "prisma", "db.comment.create_root", rootCommentSetupTitle(definition.kind), "db.comment", "create_root", {
        actorEmailFrom: "data.secondaryEmail",
        actorNameFrom: "data.secondaryName",
        bodyFrom: definition.kind === "delete-forbidden" ? "data.commentBody" : "data.rootCommentBody",
        markerFrom: "data.commentBodyMarker",
        targetFrom: "runtime.commentTarget",
        saveAs: "rootComment",
      }),
    );
  }

  if (definition.kind === "image-invalid-file") {
    steps.push(
      step(`Setup-${index++}`, "mock", "mock.comment_file.prepare", "准备本用例非图片文件", "mock.comment_file", "prepare_text", {
        fileNameFrom: "data.invalidFileName",
        saveAs: "invalidFile",
      }),
    );
  }

  steps.push(
    step(`Setup-${index++}`, "api", "ory.actor_sessions.revoke", `撤销${definition.actorLabel}登录身份可能残留的登录会话`, "ory.sessions", "revoke_by_email", {
      emailFrom: "data.email",
    }),
  );

  if (definition.kind !== "image-invalid-file") {
    steps.push(
      step(`Setup-${index++}`, "api", "ory.secondary_sessions.revoke", `撤销${definition.secondaryLabel ?? "目标参与成员"}登录身份可能残留的登录会话`, "ory.sessions", "revoke_by_email", {
        emailFrom: "data.secondaryEmail",
      }),
    );
  }

  steps.push(
    step(`Setup-${index++}`, "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
    step(`Setup-${index++}`, "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
    step(`Setup-${index++}`, "playwright", "login_form.fill_credentials", `输入${definition.actorLabel}邮箱和密码`, "page.login_form", "fill_credentials", {
      emailFrom: "data.email",
      passwordFrom: "data.password",
    }),
    step(`Setup-${index++}`, "playwright", "page.click.sign_in", "点击 \"Sign In\" 登录操作", "page", "click", {
      role: "button",
      name: "Sign In",
    }),
    step(`Setup-${index++}`, "api", "session.authenticated", `当前会话 应为 ${definition.actorLabel}的已登录会话`, "auth.session", "authenticated", {
      emailFrom: "data.email",
      roleFrom: "data.role",
      status: "active",
    }),
    step(`Setup-${index++}`, "playwright", "page.goto.tasks", "打开 计划页面", "page", "goto", { path: "/tasks" }),
    setupApiTargetStep(`Setup-${index++}`, definition),
  );

  if (definition.kind === "edit-forbidden" || definition.kind === "delete-forbidden" || definition.kind === "image-invalid-file") {
    steps.push(
      step(`Setup-${index++}`, "playwright", "page.comment_target.open", "打开当前评论对象的评论窗口", "page.comment_target", "open_comment_panel", {
        targetFrom: "runtime.commentTarget",
      }),
    );
  }

  return steps;
}

function s0Assertions(definition: ReverseCommentCaseDefinition): StepSpec[] {
  const session = step("S0-1", "api", "session.authenticated", `当前会话 应为 ${definition.actorLabel}的已登录会话`, "auth.session", "authenticated", {
    emailFrom: "data.email",
    roleFrom: "data.role",
    status: "active",
  });

  if (definition.kind === "edit-forbidden") {
    return [
      session,
      step("S0-2", "playwright", "comment_panel.original_body.visible", "评论窗口 应显示 本用例原始评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S0-3", "playwright", "comment_message.edit.hidden", "本用例原始评论的 \"编辑评论\" 操作 应不可见", "page.comment_message", "edit_hidden", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S0-4", "playwright", "comment_message.delete.hidden", "本用例原始评论的 \"删除评论\" 操作 应不可见", "page.comment_message", "delete_hidden", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S0-5", "prisma", "db.comment.original.persisted", "数据库中 应存在 本用例原始评论正文", "db.comment", "root_persisted", {
        authorEmailFrom: "data.secondaryEmail",
        bodyFrom: "data.rootCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S0-6", "prisma", "db.comment.edited.absent", "数据库中 应不存在 本用例编辑后评论正文", "db.comment", "body_absent", {
        bodyFrom: "data.editedCommentBody",
      }),
    ];
  }

  if (definition.kind === "delete-forbidden") {
    return [
      session,
      step("S0-2", "playwright", "comment_panel.body.visible", "评论窗口 应显示 本用例测试评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.commentBody",
      }),
      step("S0-3", "playwright", "comment_message.delete.hidden", "本用例测试评论的 \"删除评论\" 操作 应不可见", "page.comment_message", "delete_hidden", {
        bodyFrom: "data.commentBody",
      }),
      step("S0-4", "playwright", "comment_message.edit.hidden", "本用例测试评论的 \"编辑评论\" 操作 应不可见", "page.comment_message", "edit_hidden", {
        bodyFrom: "data.commentBody",
      }),
      step("S0-5", "prisma", "db.comment.body.persisted", "数据库中 应存在 本用例测试评论正文", "db.comment", "root_persisted", {
        authorEmailFrom: "data.secondaryEmail",
        bodyFrom: "data.commentBody",
        targetFrom: "runtime.commentTarget",
      }),
    ];
  }

  if (definition.kind === "reply-forbidden") {
    return [
      session,
      step("S0-2", "api", "session.role", "当前会话用户角色 应为 `member`", "auth.session.user_role", "equals", { roleFrom: "data.role" }),
      step("S0-3", "prisma", "db.comment_target.not_mutable", "当前评论对象 应属于 非参与普通成员未参与且生命周期允许评论操作的目标", "db.comment_target", "not_mutable", {
        actorNameFrom: "data.name",
        roleFrom: "data.role",
        targetFrom: "runtime.commentTarget",
      }),
      step("S0-4", "api", "api.my_challenges.comment_target.absent", "非参与普通成员计划页数据 应不包含 当前评论对象", "api.my_challenges.comment_target", "absent", {
        targetFrom: "runtime.commentTarget",
      }),
      step("S0-5", "prisma", "db.comment.root.persisted", "数据库中 应存在 可回复外层评论", "db.comment", "root_persisted", {
        authorEmailFrom: "data.secondaryEmail",
        bodyFrom: "data.rootCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S0-6", "prisma", "db.comment.reply.absent", "数据库中 应不存在 本用例回复正文", "db.comment", "body_absent", {
        bodyFrom: "data.replyBody",
      }),
    ];
  }

  if (definition.kind === "image-invalid-file") {
    return [
      session,
      step("S0-2", "playwright", "comment_composer.ready", "评论输入框 应可用于输入评论", "page.comment_composer", "ready"),
      step("S0-3", "playwright", "comment_composer.image_button.enabled", "\"添加图片\" 操作 应可点击", "page.comment_composer", "image_button_enabled"),
      step("S0-4", "prisma", "db.comment.image_absent", "数据库中 应不存在 本用例非图片附件", "db.comment", "image_absent", {
        fileNameFrom: "data.invalidFileName",
      }),
    ];
  }

  return [
    session,
    step("S0-2", "api", "session.role", "当前会话用户角色 应为 `member`", "auth.session.user_role", "equals", { roleFrom: "data.role" }),
    step("S0-3", "prisma", "db.comment_target.not_mutable", `当前评论对象 应属于 ${definition.actorLabel}未参与且生命周期允许新增评论的目标`, "db.comment_target", "not_mutable", {
      actorNameFrom: "data.name",
      roleFrom: "data.role",
      targetFrom: "runtime.commentTarget",
    }),
    step("S0-4", "playwright", "page.url.tasks", "当前页面 应为 计划页面", "page.url", "match", { pattern: "/tasks$" }),
    step("S0-5", "playwright", "comment_target.row.hidden", "当前评论对象行 应不可见", "page.comment_target", "hidden", {
      targetFrom: "runtime.commentTarget",
    }),
    step("S0-6", "api", "api.my_challenges.comment_target.absent", `${definition.actorLabel}计划页数据 应不包含 当前评论对象`, "api.my_challenges.comment_target", "absent", {
      targetFrom: "runtime.commentTarget",
    }),
    step("S0-7", "prisma", "db.comment.body_absent", "数据库中 应不存在 本用例测试评论正文", "db.comment", "body_absent", {
      bodyFrom: "data.commentBody",
    }),
  ];
}

function actionSteps(definition: ReverseCommentCaseDefinition): StepSpec[] {
  if (definition.kind === "reply-forbidden") {
    return [
      step("Action-1", "api", "api.comment_direct.reply", "当前非参与普通成员直接尝试回复可回复外层评论", "api.comment_direct", "reply", {
        bodyFrom: "data.replyBody",
        parentFrom: "runtime.rootComment",
        targetFrom: "runtime.commentTarget",
        saveAs: "replyResponse",
      }),
    ];
  }

  if (definition.kind === "edit-forbidden") {
    return [
      step("Action-1", "api", "api.comment_direct.update", "当前非作者普通成员直接尝试将本用例原始评论更新为本用例编辑后评论正文", "api.comment_direct", "update", {
        bodyFrom: "data.editedCommentBody",
        commentFrom: "runtime.rootComment",
        saveAs: "updateResponse",
      }),
    ];
  }

  if (definition.kind === "delete-forbidden") {
    return [
      step("Action-1", "api", "api.comment_direct.delete", "当前非作者普通成员直接尝试删除本用例测试评论", "api.comment_direct", "delete", {
        commentFrom: "runtime.rootComment",
        saveAs: "deleteResponse",
      }),
    ];
  }

  if (definition.kind === "image-invalid-file") {
    return [
      step("Action-1", "api", "api.comment_attachment_direct.upload", "当前普通成员直接尝试上传本用例非图片文件作为评论图片", "api.comment_attachment_direct", "upload", {
        fileFrom: "runtime.invalidFile",
        targetFrom: "runtime.commentTarget",
        saveAs: "invalidUploadResponse",
      }),
      step("Action-2", "playwright", "comment_composer.choose_file", "通过 \"添加图片\" 操作选择本用例非图片文件", "page.comment_composer", "choose_file", {
        fileFrom: "runtime.invalidFile",
      }),
    ];
  }

  return [
    step("Action-1", "api", "api.comment_direct.create", `当前${definition.actorLabel}直接尝试在当前评论对象新增本用例测试评论`, "api.comment_direct", "create", {
      bodyFrom: "data.commentBody",
      targetFrom: "runtime.commentTarget",
      saveAs: "commentResponse",
    }),
  ];
}

function s1Assertions(definition: ReverseCommentCaseDefinition): StepSpec[] {
  if (definition.kind === "reply-forbidden") {
    return [
      step("S1-1", "api", "api.reply_response.forbidden", "新增回复结果状态码 应为 403 或等价权限错误", "api.comment_response", "forbidden", {
        resultFrom: "runtime.replyResponse",
      }),
      step("S1-2", "api", "api.my_challenges.comment_target.absent", "非参与普通成员计划页数据 应不包含 当前评论对象", "api.my_challenges.comment_target", "absent", {
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-3", "prisma", "db.comment.root.persisted", "数据库中 应仍存在 可回复外层评论", "db.comment", "root_persisted", {
        authorEmailFrom: "data.secondaryEmail",
        bodyFrom: "data.rootCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-4", "prisma", "db.comment.reply.absent", "数据库中 应不存在 本用例回复正文", "db.comment", "body_absent", {
        bodyFrom: "data.replyBody",
      }),
      step("S1-5", "api", "session.authenticated", "当前会话 应为 非参与普通成员的已登录会话", "auth.session", "authenticated", {
        emailFrom: "data.email",
        roleFrom: "data.role",
        status: "active",
      }),
      step("S1-6", "api", "session.role", "当前会话用户角色 应为 `member`", "auth.session.user_role", "equals", { roleFrom: "data.role" }),
    ];
  }

  if (definition.kind === "edit-forbidden") {
    return [
      step("S1-1", "api", "api.update_response.forbidden", "更新评论结果状态码 应为 403 或等价权限错误", "api.comment_response", "forbidden", {
        resultFrom: "runtime.updateResponse",
      }),
      step("S1-2", "playwright", "comment_panel.original.visible", "评论窗口 应仍显示 本用例原始评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.rootCommentBody",
      }),
      step("S1-3", "playwright", "comment_panel.edited.hidden", "评论窗口 应不显示 本用例编辑后评论正文", "page.comment_panel", "body_hidden", {
        bodyFrom: "data.editedCommentBody",
      }),
      step("S1-4", "prisma", "db.comment.original.persisted", "数据库中 应仍存在 本用例原始评论正文", "db.comment", "root_persisted", {
        authorEmailFrom: "data.secondaryEmail",
        bodyFrom: "data.rootCommentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-5", "prisma", "db.comment.edited.absent", "数据库中 应不存在 本用例编辑后评论正文", "db.comment", "body_absent", {
        bodyFrom: "data.editedCommentBody",
      }),
      step("S1-6", "api", "session.authenticated", "当前会话 应为 非作者普通成员的已登录会话", "auth.session", "authenticated", {
        emailFrom: "data.email",
        roleFrom: "data.role",
        status: "active",
      }),
    ];
  }

  if (definition.kind === "delete-forbidden") {
    return [
      step("S1-1", "api", "api.delete_response.forbidden", "删除评论结果状态码 应为 403 或等价权限错误", "api.comment_response", "forbidden", {
        resultFrom: "runtime.deleteResponse",
      }),
      step("S1-2", "playwright", "comment_panel.body.visible", "评论窗口 应仍显示 本用例测试评论正文", "page.comment_panel", "body_visible", {
        bodyFrom: "data.commentBody",
      }),
      step("S1-3", "prisma", "db.comment.body.persisted", "数据库中 应仍存在 本用例测试评论正文", "db.comment", "root_persisted", {
        authorEmailFrom: "data.secondaryEmail",
        bodyFrom: "data.commentBody",
        targetFrom: "runtime.commentTarget",
      }),
      step("S1-4", "api", "session.authenticated", "当前会话 应为 非作者普通成员的已登录会话", "auth.session", "authenticated", {
        emailFrom: "data.email",
        roleFrom: "data.role",
        status: "active",
      }),
    ];
  }

  if (definition.kind === "image-invalid-file") {
    return [
      step("S1-1", "api", "api.image_upload_response.unsupported", "上传非图片文件结果状态码 应为 415 或等价文件类型错误", "api.comment_upload_response", "unsupported", {
        resultFrom: "runtime.invalidUploadResponse",
      }),
      step("S1-2", "playwright", "comment_composer.upload_error", "评论窗口 应显示 非图片文件错误提示", "page.comment_composer", "upload_error_visible", {
        message: "只能上传图片",
      }),
      step("S1-3", "prisma", "db.comment.image_absent", "数据库中 应不存在 本用例非图片附件", "db.comment", "image_absent", {
        fileNameFrom: "data.invalidFileName",
      }),
      step("S1-4", "api", "session.authenticated", "当前会话 应为 普通成员的已登录会话", "auth.session", "authenticated", {
        emailFrom: "data.email",
        roleFrom: "data.role",
        status: "active",
      }),
    ];
  }

  return [
    step("S1-1", "api", "api.comment_response.forbidden", "新增评论结果状态码 应为 403 或等价权限错误", "api.comment_response", "forbidden", {
      resultFrom: "runtime.commentResponse",
    }),
    step("S1-2", "api", "api.my_challenges.comment_target.absent", `${definition.actorLabel}计划页数据 应不包含 当前评论对象`, "api.my_challenges.comment_target", "absent", {
      targetFrom: "runtime.commentTarget",
    }),
    step("S1-3", "prisma", "db.comment.body_absent", "数据库中 应不存在 本用例测试评论正文", "db.comment", "body_absent", {
      bodyFrom: "data.commentBody",
    }),
    step("S1-4", "api", "session.authenticated", `当前会话 应为 ${definition.actorLabel}的已登录会话`, "auth.session", "authenticated", {
      emailFrom: "data.email",
      roleFrom: "data.role",
      status: "active",
    }),
    step("S1-5", "api", "session.role", "当前会话用户角色 应为 `member`", "auth.session.user_role", "equals", { roleFrom: "data.role" }),
  ];
}

function cleanSteps(definition: ReverseCommentCaseDefinition): StepSpec[] {
  const steps: StepSpec[] = [
    step("Clean-1", "playwright", "comment_panel.close", "若评论窗口仍打开，关闭评论窗口", "page.comment_panel", "close", {
      optional: true,
    }),
    step("Clean-2", "prisma", "db.member_comment_manage_permission.restore", "若已记录 member 角色评论管理权限配置快照，恢复该快照", "db.member_comment_manage_permission", "restore_snapshot", {
      snapshotFrom: "runtime.memberCommentManagePermissionSnapshot",
    }),
    step("Clean-3", "prisma", "db.test_comments.delete", cleanDeleteCommentTitle(definition.kind), "db.test_comments", "delete", {
      markerFrom: "data.commentBodyMarker",
      ...(definition.kind === "image-invalid-file" ? { imageFileNameFrom: "data.invalidFileName" } : {}),
    }),
    step("Clean-4", "prisma", "db.comment_task.delete", "删除 本用例创建的任务", "db.comment_task", "delete", {
      taskIdFrom: "data.taskId",
      taskTitleFrom: "data.taskTitle",
    }),
    step("Clean-5", "prisma", "db.objective.delete", "删除 本用例创建的目标及其派生数据", "db.objective", "delete", {
      idFrom: "data.objectiveId",
      titleFrom: "data.objectiveTitle",
    }),
    step("Clean-6", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
    step("Clean-7", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
    step("Clean-8", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
    step("Clean-9", "api", "ory.actor_sessions.revoke", `撤销${definition.actorLabel}登录身份的残留登录会话`, "ory.sessions", "revoke_by_email", {
      emailFrom: "data.email",
    }),
  ];

  let index = 10;
  if (definition.kind !== "image-invalid-file") {
    steps.push(
      step(`Clean-${index++}`, "api", "ory.secondary_sessions.revoke", `撤销${definition.secondaryLabel ?? "目标参与成员"}登录身份的残留登录会话`, "ory.sessions", "revoke_by_email", {
        emailFrom: "data.secondaryEmail",
      }),
      step(`Clean-${index++}`, "api", "ory.actor_identity.delete", `删除${definition.actorLabel}登录身份`, "ory.identity", "delete_by_email", {
        emailFrom: "data.email",
      }),
      step(`Clean-${index++}`, "api", "ory.secondary_identity.delete", `删除${definition.secondaryLabel ?? "目标参与成员"}登录身份`, "ory.identity", "delete_by_email", {
        emailFrom: "data.secondaryEmail",
      }),
      step(`Clean-${index++}`, "prisma", "db.actor.delete", `删除${definition.actorLabel}默认团队成员关系和用户记录`, "db.comment_actor", "delete", {
        emailFrom: "data.email",
      }),
      step(`Clean-${index++}`, "prisma", "db.secondary.delete", `删除${definition.secondaryLabel ?? "目标参与成员"}默认团队成员关系和用户记录`, "db.comment_actor", "delete", {
        emailFrom: "data.secondaryEmail",
      }),
    );
  } else {
    steps.push(
      step(`Clean-${index++}`, "api", "ory.actor_identity.delete", "删除普通成员登录身份", "ory.identity", "delete_by_email", {
        emailFrom: "data.email",
      }),
      step(`Clean-${index++}`, "prisma", "db.actor.delete", "删除普通成员默认团队成员关系和用户记录", "db.comment_actor", "delete", {
        emailFrom: "data.email",
      }),
    );
  }

  steps.push(
    step(`Clean-${index++}`, "prisma", "db.test_comments.absent", cleanAbsentCommentTitle(definition.kind), "db.test_comments", "absent", {
      markerFrom: "data.commentBodyMarker",
      ...(definition.kind === "image-invalid-file" ? { imageFileNameFrom: "data.invalidFileName" } : {}),
    }),
    step(`Clean-${index++}`, "prisma", "db.comment_fixture.absent", "本用例创建的目标和任务 应不存在", "db.comment_fixture", "target_and_task_absent", {
      objectiveIdFrom: "data.objectiveId",
      objectiveTitleFrom: "data.objectiveTitle",
      taskIdFrom: "data.taskId",
      taskTitleFrom: "data.taskTitle",
    }),
    step(`Clean-${index++}`, "api", "ory.actor_identity.absent", `${definition.actorLabel}登录身份 应不存在`, "ory.identity", "absent", {
      emailFrom: "data.email",
    }),
  );

  if (definition.kind !== "image-invalid-file") {
    steps.push(
      step(`Clean-${index++}`, "api", "ory.secondary_identity.absent", `${definition.secondaryLabel ?? "目标参与成员"}登录身份 应不存在`, "ory.identity", "absent", {
        emailFrom: "data.secondaryEmail",
      }),
      step(`Clean-${index++}`, "prisma", "db.actor.absent", `${definition.actorLabel}用户记录 应不存在`, "db.user", "absent", {
        emailFrom: "data.email",
      }),
      step(`Clean-${index++}`, "prisma", "db.secondary.absent", `${definition.secondaryLabel ?? "目标参与成员"}用户记录 应不存在`, "db.user", "absent", {
        emailFrom: "data.secondaryEmail",
      }),
    );
  } else {
    steps.push(
      step(`Clean-${index++}`, "prisma", "db.actor.absent", "普通成员用户记录 应不存在", "db.user", "absent", {
        emailFrom: "data.email",
      }),
    );
  }

  return steps;
}

function setupApiTargetStep(caseStepId: string, definition: ReverseCommentCaseDefinition): StepSpec {
  const present =
    definition.kind === "edit-forbidden" ||
    definition.kind === "delete-forbidden" ||
    definition.kind === "image-invalid-file";

  if (present) {
    return step(caseStepId, "api", "api.my_challenges.comment_target.present", `${definition.actorLabel}计划页数据 应包含 当前评论对象${definition.kind === "edit-forbidden" ? "和本用例原始评论" : definition.kind === "delete-forbidden" ? "和本用例测试评论" : ""}`, "api.my_challenges.comment_target", "present", {
      targetFrom: "runtime.commentTarget",
    });
  }

  return step(caseStepId, "api", "api.my_challenges.comment_target.absent", `${definition.actorLabel}计划页数据 应不包含 当前评论对象`, "api.my_challenges.comment_target", "absent", {
    targetFrom: "runtime.commentTarget",
  });
}

function setupDeleteCommentTitle(kind: ReverseCommentCaseKind) {
  if (kind === "reply-forbidden") return "删除可能残留的本用例测试评论和回复";
  if (kind === "image-invalid-file") return "删除可能残留的本用例测试评论和图片附件";
  return "删除可能残留的本用例测试评论";
}

function objectiveSetupTitle(kind: ReverseCommentCaseKind) {
  return kind === "admin-create-forbidden" || kind === "member-create-forbidden" || kind === "image-invalid-file"
    ? "创建生命周期允许新增评论的目标"
    : "创建生命周期允许评论操作的目标";
}

function participantSetupTitle(kind: ReverseCommentCaseKind) {
  return kind === "image-invalid-file" ? "设置普通成员参与该目标" : "设置目标参与成员参与该目标";
}

function rootCommentSetupTitle(kind: ReverseCommentCaseKind) {
  if (kind === "reply-forbidden") return "创建当前评论对象上的可回复外层评论";
  return "创建评论作者普通成员在当前评论对象上的外层评论";
}

function cleanDeleteCommentTitle(kind: ReverseCommentCaseKind) {
  if (kind === "reply-forbidden") return "删除 本用例创建的测试评论、回复及空线程";
  if (kind === "image-invalid-file") return "删除 本用例创建的测试评论、图片附件及空线程";
  return "删除 本用例创建的测试评论及空线程";
}

function cleanAbsentCommentTitle(kind: ReverseCommentCaseKind) {
  if (kind === "reply-forbidden") return "本用例测试评论和回复 应不存在";
  if (kind === "image-invalid-file") return "本用例测试评论和图片附件 应不存在";
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
