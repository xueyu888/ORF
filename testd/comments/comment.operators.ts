import { expect, type Dialog } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../_framework/types";
import { requiredCapturedResponse } from "../_operators/common.operators";
import { requiredString } from "../_operators/params";
import type { CommentCaseData, CommentTarget, FixtureComment, MockImageFile, TestContext } from "./_support/comment.context";
import {
  commentBodyAbsent,
  commentComposer,
  commentImageAbsent,
  commentImagePreviewButton,
  commentMessageRow,
  commentPanel,
  commentTargetAndTaskAbsent,
  commentTargetCanMutate,
  commentTargetFromFixture,
  commentTargetRow,
  createCommentTask,
  createRootFixtureComment,
  deleteCommentActor,
  deleteCommentAttachmentObjects,
  deleteCommentTargetAndTask,
  deleteCommentTask,
  imageCommentPersisted,
  makeMockPngFile,
  myChallengesHasImageComment,
  myChallengesHasReply,
  myChallengesHasRootComment,
  myChallengesHasTarget,
  myChallengesLacksComment,
  myChallengesScopeFor,
  openCommentPanel,
  prepareCommentActor,
  removeTestComments,
  replyCommentPersisted,
  rootCommentPersisted,
  setCommentObjectiveParticipant,
  testCommentsAbsent,
} from "./_support/comment.helpers";

export const commentOperators = {
  "db.test_comments": {
    delete: async ({ params }) => {
      return removeTestComments({
        actorEmail: optionalString(params, "actorEmail"),
        imageFileName: optionalString(params, "imageFileName"),
        marker: requiredString(params, "marker"),
      });
    },

    absent: async ({ params }) => {
      await expect
        .poll(() =>
          testCommentsAbsent({
            actorEmail: optionalString(params, "actorEmail"),
            imageFileName: optionalString(params, "imageFileName"),
            marker: requiredString(params, "marker"),
          }),
        )
        .toBe(true);
    },
  },

  "db.comment_actor": {
    prepare: async ({ params }) =>
      prepareCommentActor({
        email: requiredString(params, "email"),
        identityId: optionalString(params, "identityId"),
        name: requiredString(params, "name"),
        role: requiredRole(params, "role"),
      }),

    delete: async ({ params }) => {
      await deleteCommentActor(requiredString(params, "email"));
    },
  },

  "db.comment_fixture": {
    delete_target_and_task: async ({ params }) => {
      await deleteCommentTargetAndTask({
        objectiveId: requiredString(params, "objectiveId"),
        objectiveTitle: requiredString(params, "objectiveTitle"),
        taskId: requiredString(params, "taskId"),
        taskTitle: requiredString(params, "taskTitle"),
      });
    },

    target_and_task_absent: async ({ params }) => {
      await expect
        .poll(() =>
          commentTargetAndTaskAbsent({
            objectiveId: requiredString(params, "objectiveId"),
            objectiveTitle: requiredString(params, "objectiveTitle"),
            taskId: requiredString(params, "taskId"),
            taskTitle: requiredString(params, "taskTitle"),
          }),
        )
        .toBe(true);
    },
  },

  "db.comment_objective": {
    set_participant: async ({ params }) => {
      await setCommentObjectiveParticipant(requiredString(params, "objectiveId"), requiredString(params, "memberName"));
    },
  },

  "db.comment_task": {
    create: async ({ params }) =>
      createCommentTask({
        assignee: requiredString(params, "assignee"),
        id: requiredString(params, "taskId"),
        linkedObjectiveId: requiredString(params, "objectiveId"),
        teamId: requiredString(params, "teamId"),
        title: requiredString(params, "taskTitle"),
        userId: optionalString(params, "userId"),
      }),

    delete: async ({ params }) => {
      await deleteCommentTask({
        id: optionalString(params, "taskId"),
        title: optionalString(params, "taskTitle"),
      });
    },
  },

  "db.comment_target": {
    record: async ({ params }) =>
      commentTargetFromFixture({
        objectiveId: requiredString(params, "objectiveId"),
        taskId: requiredString(params, "taskId"),
        targetType: requiredTargetType(params, "targetType"),
      }),

    mutable: async ({ params }) => {
      await expect
        .poll(() =>
          commentTargetCanMutate({
            actorName: requiredString(params, "actorName"),
            role: requiredRole(params, "role"),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },
  },

  "db.comment": {
    create_root: async ({ params }) =>
      createRootFixtureComment({
        actorEmail: requiredString(params, "actorEmail"),
        actorName: requiredString(params, "actorName"),
        body: requiredString(params, "body"),
        marker: requiredString(params, "marker"),
        target: requiredCommentTarget(params, "target"),
      }),

    root_persisted: async ({ params }) => {
      await expect
        .poll(() =>
          rootCommentPersisted({
            authorEmail: requiredString(params, "authorEmail"),
            body: requiredString(params, "body"),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    reply_persisted: async ({ params }) => {
      await expect
        .poll(() =>
          replyCommentPersisted({
            body: requiredString(params, "body"),
            parent: requiredFixtureComment(params, "parent"),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    body_absent: async ({ params }) => {
      await expect.poll(() => commentBodyAbsent(requiredString(params, "body"))).toBe(true);
    },

    image_absent: async ({ params }) => {
      await expect.poll(() => commentImageAbsent(requiredString(params, "fileName"))).toBe(true);
    },

    image_persisted: async ({ params }) => {
      await expect
        .poll(() =>
          imageCommentPersisted({
            bodyMarker: requiredString(params, "bodyMarker"),
            fileName: requiredString(params, "fileName"),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },
  },

  "mock.comment_image": {
    prepare: async ({ params }) => makeMockPngFile(requiredString(params, "fileName")),
  },

  "api.my_challenges.comment_target": {
    present: async ({ ctx, data, params }) => {
      await expect
        .poll(() => myChallengesHasTarget(ctx.page, requiredCommentTarget(params, "target"), myChallengesScopeFor(data.role)))
        .toBe(true);
    },
  },

  "api.my_challenges.comment": {
    present: async ({ ctx, data, params }) => {
      await expect
        .poll(() =>
          myChallengesHasRootComment(ctx.page, {
            author: optionalString(params, "author"),
            body: requiredString(params, "body"),
            scope: myChallengesScopeFor(data.role),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    reply_present: async ({ ctx, data, params }) => {
      await expect
        .poll(() =>
          myChallengesHasReply(ctx.page, {
            body: requiredString(params, "body"),
            scope: myChallengesScopeFor(data.role),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    absent: async ({ ctx, data, params }) => {
      await expect
        .poll(() =>
          myChallengesLacksComment(ctx.page, {
            body: requiredString(params, "body"),
            scope: myChallengesScopeFor(data.role),
          }),
        )
        .toBe(true);
    },

    image_present: async ({ ctx, data, params }) => {
      await expect
        .poll(() =>
          myChallengesHasImageComment(ctx.page, {
            body: requiredString(params, "body"),
            fileName: requiredString(params, "fileName"),
            scope: myChallengesScopeFor(data.role),
            target: requiredCommentTarget(params, "target"),
          }),
        )
        .toBe(true);
    },
  },

  "api.comment_response": {
    created: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        commentThread: {
          targetType: requiredCommentTarget(params, "target").type,
          targetId: requiredCommentTarget(params, "target").id,
          messages: expect.arrayContaining([
            expect.objectContaining({
              body: requiredString(params, "body"),
            }),
          ]),
        },
      });
    },

    reply_created: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const parent = requiredFixtureComment(params, "parent");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        commentThread: {
          targetType: requiredCommentTarget(params, "target").type,
          targetId: requiredCommentTarget(params, "target").id,
          messages: expect.arrayContaining([
            expect.objectContaining({
              body: requiredString(params, "body"),
              parentMessageId: parent.messageId,
            }),
          ]),
        },
      });
    },

    updated: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const nextBody = requiredString(params, "body");
      const previousBody = requiredString(params, "previousBody");
      const body = response.body as { commentThread?: { messages?: Array<{ body?: string }> } } | null;
      const messages = body?.commentThread?.messages ?? [];
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(messages.some((message) => message.body === nextBody)).toBe(true);
      expect(messages.some((message) => message.body === previousBody)).toBe(false);
    },

    deleted: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const deleted = requiredFixtureComment(params, "comment");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.url).toContain(deleted.messageApiPath);
      expect(response.body).toMatchObject({ ok: true });
    },

    image_created: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const target = requiredCommentTarget(params, "target");
      const responseBody = response.body as {
        commentThread?: {
          targetId?: string;
          targetType?: string;
        };
      } | null;
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(responseBody).toMatchObject({
        ok: true,
        commentThread: {
          targetId: target.id,
          targetType: target.type,
        },
      });
    },
  },

  "api.comment_upload_response": {
    ok: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        attachment: {
          fileName: requiredString(params, "fileName"),
        },
      });
    },
  },

  "api.comment_attachment_storage": {
    delete: async ({ params }) => {
      await deleteCommentAttachmentObjects(optionalStringArray(params, "objectKeys"));
    },
  },

  "page.login_form": {
    fill_credentials: async ({ ctx, params }) => {
      await ctx.page.getByLabel("Email").fill(requiredString(params, "email"));
      await ctx.page.getByLabel("Password", { exact: true }).fill(requiredString(params, "password"));
    },
  },

  "page.comment_target": {
    visible: async ({ ctx, params }) => {
      await expect(commentTargetRow(ctx.page, requiredCommentTarget(params, "target"))).toBeVisible();
    },

    open_comment_panel: async ({ ctx, params }) => {
      await openCommentPanel(ctx.page, requiredCommentTarget(params, "target"));
      await expect(commentPanel(ctx.page)).toBeVisible();
    },
  },

  "page.comment_panel": {
    title: async ({ ctx, params }) => {
      await expect(commentPanel(ctx.page).locator(".orf-comment-context-title")).toHaveText(requiredCommentTarget(params, "target").title);
    },

    message_visible: async ({ ctx, params }) => {
      const row = commentMessageRow(ctx.page, requiredString(params, "body"));
      await expect(row).toBeVisible();
      const author = optionalString(params, "author");
      if (author) {
        await expect(row.getByText(author, { exact: true }).first()).toBeVisible();
      }
    },

    body_visible: async ({ ctx, params }) => {
      await expect(commentMessageRow(ctx.page, requiredString(params, "body"))).toBeVisible();
    },

    body_hidden: async ({ ctx, params }) => {
      await expect(commentPanel(ctx.page).getByText(requiredString(params, "body"), { exact: true })).toHaveCount(0);
    },

    image_visible: async ({ ctx, params }) => {
      await expect(commentImagePreviewButton(ctx.page, requiredString(params, "fileName"))).toBeVisible();
    },

    close: async ({ ctx, params }) => {
      const button = ctx.page.getByRole("button", { name: "关闭评论窗口" });
      if (params.optional === true && (await button.count()) === 0) {
        return;
      }
      await button.click();
      await expect(commentPanel(ctx.page)).toHaveCount(0);
    },
  },

  "page.comment_composer": {
    ready: async ({ ctx }) => {
      await expect(commentComposer(ctx.page)).toBeVisible();
      await expect(commentComposer(ctx.page)).toBeEnabled();
    },

    fill: async ({ ctx, params }) => {
      await commentComposer(ctx.page).fill(requiredString(params, "value"));
    },

    append: async ({ ctx, params }) => {
      const composer = commentComposer(ctx.page);
      const current = await composer.inputValue();
      const value = requiredString(params, "value");
      await composer.fill(current ? `${current}\n${value}` : value);
    },

    fill_reply: async ({ ctx, params }) => {
      await expect(commentComposer(ctx.page)).toHaveAttribute("placeholder", /回复 |添加回复/);
      await commentComposer(ctx.page).fill(requiredString(params, "value"));
    },

    fill_edit: async ({ ctx, params }) => {
      await expect(commentComposer(ctx.page)).toHaveAttribute("placeholder", "编辑评论...");
      await commentComposer(ctx.page).fill(requiredString(params, "value"));
    },

    submit_comment: async ({ ctx }) => {
      await ctx.page.getByRole("button", { name: "发送评论" }).click();
    },

    submit_reply: async ({ ctx }) => {
      await ctx.page.getByRole("button", { name: "发送回复" }).click();
    },

    submit_edit: async ({ ctx }) => {
      await ctx.page.getByRole("button", { name: "保存评论" }).click();
    },

    empty: async ({ ctx }) => {
      await expect(commentComposer(ctx.page)).toHaveValue("");
    },

    image_button_enabled: async ({ ctx }) => {
      await expect(commentPanel(ctx.page).getByRole("button", { name: "添加图片" })).toBeEnabled();
    },

    choose_image: async ({ ctx, params }) => {
      const file = requiredMockImageFile(params, "file");
      await expect(commentPanel(ctx.page).getByRole("button", { name: "添加图片" })).toBeEnabled();
      await commentPanel(ctx.page).locator('input[type="file"]').setInputFiles({
        buffer: file.buffer,
        mimeType: file.mimeType,
        name: file.fileName,
      });
    },
  },

  "page.comment_message": {
    reply_enabled: async ({ ctx, params }) => {
      await expect(commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: "回复评论" })).toBeEnabled();
    },

    click_reply: async ({ ctx, params }) => {
      await commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: "回复评论" }).click();
    },

    edit_enabled: async ({ ctx, params }) => {
      await expect(commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: "编辑评论" })).toBeEnabled();
    },

    click_edit: async ({ ctx, params }) => {
      await commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: "编辑评论" }).click();
    },

    delete_enabled: async ({ ctx, params }) => {
      await expect(commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: "删除评论" })).toBeEnabled();
    },

    click_delete: async ({ ctx, runtime, params }) => {
      const dialogPromise = ctx.page.waitForEvent("dialog");
      const clickPromise = commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: "删除评论" }).click();
      runtime.values.pendingCommentDeleteDialog = await dialogPromise;
      runtime.values.pendingCommentDeleteClick = clickPromise;
    },

    confirm_delete: async ({ runtime }) => {
      const dialog = runtime.values.pendingCommentDeleteDialog;
      if (!isDialog(dialog)) {
        throw new Error("没有待确认的删除评论弹窗");
      }
      await dialog.accept();
      await runtime.values.pendingCommentDeleteClick;
    },

    reply_count_visible: async ({ ctx, params }) => {
      await expect(commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: /^共 \d+ 条回复$/ })).toBeVisible();
    },

    open_replies: async ({ ctx, params }) => {
      await commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: /^共 \d+ 条回复$/ }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, CommentCaseData>;

function optionalString(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`参数 ${key} 必须是 string`);
  }
  return value;
}

function optionalStringArray(params: StepParams, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  throw new Error(`参数 ${key} 必须是字符串数组`);
}

function requiredRole(params: StepParams, key: string): "admin" | "member" {
  const role = requiredString(params, key);
  if (role === "admin" || role === "member") {
    return role;
  }
  throw new Error(`参数 ${key} 必须是 admin 或 member`);
}

function requiredTargetType(params: StepParams, key: string): "objective" | "task" {
  const type = requiredString(params, key);
  if (type === "objective" || type === "task") {
    return type;
  }
  throw new Error(`参数 ${key} 必须是 objective 或 task`);
}

function requiredCommentTarget(params: StepParams, key: string): CommentTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    ((value as CommentTarget).type !== "objective" && (value as CommentTarget).type !== "task") ||
    typeof (value as CommentTarget).id !== "string" ||
    typeof (value as CommentTarget).title !== "string" ||
    typeof (value as CommentTarget).objectiveId !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是评论目标`);
  }
  return value as CommentTarget;
}

function requiredFixtureComment(params: StepParams, key: string): FixtureComment {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FixtureComment).threadId !== "string" ||
    typeof (value as FixtureComment).messageId !== "string" ||
    typeof (value as FixtureComment).messageApiPath !== "string" ||
    typeof (value as FixtureComment).body !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是测试评论`);
  }
  return value as FixtureComment;
}

function requiredMockImageFile(params: StepParams, key: string): MockImageFile {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    !Buffer.isBuffer((value as MockImageFile).buffer) ||
    typeof (value as MockImageFile).fileName !== "string" ||
    typeof (value as MockImageFile).mimeType !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是测试图片文件`);
  }
  return value as MockImageFile;
}

function isDialog(value: unknown): value is Dialog {
  return typeof value === "object" && value !== null && typeof (value as Dialog).accept === "function";
}
