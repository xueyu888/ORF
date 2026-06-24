import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../_framework/types";
import type { CapturedResponse } from "../_operators/common.context";
import { readResponseBody } from "../_operators/common.helpers";
import { requiredCapturedResponse } from "../_operators/common.operators";
import { requiredNumber, requiredString } from "../_operators/params";
import type { CommentCaseData, CommentTarget, FixtureComment, MockImageFile, TestContext } from "./_support/comment.context";
import {
  commentBodyAbsent,
  commentComposer,
  commentEditComposer,
  commentImageAbsent,
  commentImagePreviewButton,
  commentMessageRow,
  commentPanel,
  commentReplyComposer,
  commentTargetAndTaskAbsent,
  commentTargetCanMutate,
  commentTargetCannotMutate,
  commentTargetFromFixture,
  commentTargetRow,
  createCommentTask,
  createRootFixtureComment,
  deleteCommentActor,
  deleteCommentAttachmentObjects,
  deleteCommentTargetAndTask,
  deleteCommentTask,
  imageCommentPersisted,
  makeMockTextFile,
  makeMockPngFile,
  myChallengesHasImageComment,
  myChallengesHasReply,
  myChallengesHasRootComment,
  myChallengesHasTarget,
  myChallengesLacksComment,
  myChallengesLacksTarget,
  myChallengesScopeFor,
  openCommentPanel,
  prepareCommentActor,
  replyCountForParent,
  removeTestComments,
  replyCommentPersisted,
  rootCommentPersisted,
  setCommentObjectiveParticipant,
  testCommentsAbsent,
} from "./_support/comment.helpers";

const COMMENT_RESPONSE_TIMEOUT_MS = 5_000;

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

    not_mutable: async ({ params }) => {
      await expect
        .poll(() =>
          commentTargetCannotMutate({
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

    reply_count_equals: async ({ params }) => {
      await expect
        .poll(() => replyCountForParent(requiredFixtureComment(params, "parent")))
        .toBe(requiredNumber(params, "count"));
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

  "mock.comment_file": {
    prepare_text: async ({ params }) => makeMockTextFile(requiredString(params, "fileName")),
  },

  "api.my_challenges.comment_target": {
    present: async ({ ctx, data, params }) => {
      await expect
        .poll(() => myChallengesHasTarget(ctx.page, requiredCommentTarget(params, "target"), myChallengesScopeFor(data.role)))
        .toBe(true);
    },

    absent: async ({ ctx, data, params }) => {
      await expect
        .poll(() => myChallengesLacksTarget(ctx.page, requiredCommentTarget(params, "target"), myChallengesScopeFor(data.role)))
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

    forbidden: async ({ params }) => {
      const response = requiredApiAttemptResult(params, "result");
      expect(response.status).toBe(403);
    },
  },

  "api.comment_upload_response": {
    ok: async ({ params }) => {
      const response = await attachmentUploadResponse(params, "response");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        attachment: {
          fileName: requiredString(params, "fileName"),
        },
      });
    },

  },

  "api.comment_direct": {
    create: async ({ ctx, params }) =>
      ctx.page.evaluate(async (input) => {
        const response = await fetch("/api/comments", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        return {
          status: response.status,
          body: await response.json().catch(() => null),
        };
      }, createCommentPayload(params)),

    reply: async ({ ctx, params }) =>
      ctx.page.evaluate(async (input) => {
        const response = await fetch("/api/comments", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        return {
          status: response.status,
          body: await response.json().catch(() => null),
        };
      }, createReplyPayload(params)),

    update: async ({ ctx, params }) => {
      const comment = requiredFixtureComment(params, "comment");
      return ctx.page.evaluate(
        async ({ body, url }) => {
          const response = await fetch(url, {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
          });
          return {
            status: response.status,
            body: await response.json().catch(() => null),
          };
        },
        { body: requiredString(params, "body"), url: comment.messageApiPath },
      );
    },

    delete: async ({ ctx, params }) => {
      const comment = requiredFixtureComment(params, "comment");
      return ctx.page.evaluate(async (url) => {
        const response = await fetch(url, {
          method: "DELETE",
          credentials: "include",
        });
        return {
          status: response.status,
          body: await response.json().catch(() => null),
        };
      }, comment.messageApiPath);
    },
  },

  "api.comment_attachment_direct": {
    upload: async ({ ctx, params }) => {
      const file = requiredMockImageFile(params, "file");
      const target = requiredCommentTarget(params, "target");
      return ctx.page.evaluate(
        async ({ fileName, mimeType, bytes, targetId, targetType }) => {
          const formData = new FormData();
          formData.set("targetId", targetId);
          formData.set("targetType", targetType);
          formData.set("file", new File([new Uint8Array(bytes)], fileName, { type: mimeType }));
          const response = await fetch("/api/comments/attachments", {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          return {
            status: response.status,
            body: await response.json().catch(() => null),
          };
        },
        {
          bytes: Array.from(file.buffer),
          fileName: file.fileName,
          mimeType: file.mimeType,
          targetId: target.id,
          targetType: target.type,
        },
      );
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

    hidden: async ({ ctx, params }) => {
      await expect(commentTargetRow(ctx.page, requiredCommentTarget(params, "target"))).toHaveCount(0);
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
      await expect(
        commentImagePreviewButton(ctx.page, requiredString(params, "fileName"), optionalString(params, "body")),
      ).toBeVisible();
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
      const composer = commentReplyComposer(ctx.page);
      await expect(composer).toBeVisible();
      await expect(composer).toBeEnabled();
      await composer.fill(requiredString(params, "value"));
    },

    fill_edit: async ({ ctx, params }) => {
      const composer = commentEditComposer(ctx.page);
      await expect(composer).toBeVisible();
      await expect(composer).toBeEnabled();
      await composer.fill(requiredString(params, "value"));
    },

    submit_comment: async ({ ctx }) => {
      return performWithCapturedResponse(
        captureCommentResponse(ctx.page, "POST", "/api/comments"),
        () => ctx.page.getByRole("button", { name: "发送评论" }).click(),
      );
    },

    submit_reply: async ({ ctx }) => {
      return performWithCapturedResponse(
        captureCommentResponse(ctx.page, "POST", "/api/comments"),
        () => ctx.page.getByRole("button", { name: "发送回复" }).click(),
      );
    },

    submit_edit: async ({ ctx, params }) => {
      return performWithCapturedResponse(
        captureCommentResponse(ctx.page, "PATCH", requiredString(params, "urlEndsWith")),
        () => ctx.page.getByRole("button", { name: "保存评论" }).click(),
      );
    },

    empty: async ({ ctx }) => {
      await expect(commentComposer(ctx.page)).toHaveValue("");
    },

    image_button_enabled: async ({ ctx }) => {
      await expect(commentPanel(ctx.page).getByRole("button", { name: "添加图片或附件" })).toBeEnabled();
    },

    choose_image: async ({ ctx, params }) => {
      const file = requiredMockImageFile(params, "file");
      await expect(commentPanel(ctx.page).getByRole("button", { name: "添加图片或附件" })).toBeEnabled();
      return performWithCapturedResponse(
        captureCommentResponse(ctx.page, "POST", "/api/comments/attachments"),
        () =>
          commentPanel(ctx.page).locator('input[type="file"]').setInputFiles({
            buffer: file.buffer,
            mimeType: file.mimeType,
            name: file.fileName,
          }),
      );
    },

    choose_file: async ({ ctx, params }) => {
      const file = requiredMockImageFile(params, "file");
      await expect(commentPanel(ctx.page).getByRole("button", { name: "添加图片或附件" })).toBeEnabled();
      await commentPanel(ctx.page).locator('input[type="file"]').setInputFiles({
        buffer: file.buffer,
        mimeType: file.mimeType,
        name: file.fileName,
      });
    },

    contains_file_reference: async ({ ctx, params }) => {
      await expect(commentComposer(ctx.page)).toHaveValue(new RegExp(escapeRegExp(requiredString(params, "fileName"))));
    },

    upload_error_visible: async ({ ctx, params }) => {
      await expect(commentPanel(ctx.page).getByText(requiredString(params, "message"), { exact: true })).toBeVisible();
    },
  },

  "page.comment_message": {
    reply_enabled: async ({ ctx, params }) => {
      const row = await revealCommentMessageActions(ctx.page, requiredString(params, "body"));
      await expect(row.getByRole("button", { name: "回复评论" })).toBeEnabled();
    },

    click_reply: async ({ ctx, params }) => {
      const row = await revealCommentMessageActions(ctx.page, requiredString(params, "body"));
      await row.getByRole("button", { name: "回复评论" }).click();
    },

    edit_enabled: async ({ ctx, params }) => {
      const row = await revealCommentMessageActions(ctx.page, requiredString(params, "body"));
      await expect(row.getByRole("button", { name: "编辑评论" })).toBeEnabled();
    },

    edit_hidden: async ({ ctx, params }) => {
      const row = await revealCommentMessageActions(ctx.page, requiredString(params, "body"));
      await expect(row.getByRole("button", { name: "编辑评论" })).toHaveCount(0);
    },

    click_edit: async ({ ctx, params }) => {
      const row = await revealCommentMessageActions(ctx.page, requiredString(params, "body"));
      await row.getByRole("button", { name: "编辑评论" }).click();
    },

    delete_enabled: async ({ ctx, params }) => {
      const deleteAction = await openCommentDeleteMenu(ctx.page, requiredString(params, "body"));
      await expect(deleteAction).toBeEnabled();
    },

    delete_hidden: async ({ ctx, params }) => {
      const row = await revealCommentMessageActions(ctx.page, requiredString(params, "body"));
      const moreActions = row.getByRole("button", { name: "更多评论操作" });
      if (await moreActions.count()) {
        await moreActions.click();
      }
      await expect(row.getByRole("menuitem", { name: "删除评论" })).toHaveCount(0);
    },

    delete: async ({ ctx, params }) => {
      return performWithCapturedResponse(
        captureCommentResponse(ctx.page, "DELETE", requiredString(params, "urlEndsWith")),
        async () => {
          const dialogPromise = ctx.page.waitForEvent("dialog");
          const deleteAction = await openCommentDeleteMenu(ctx.page, requiredString(params, "body"));
          const clickPromise = deleteAction.click();
          const dialog = await dialogPromise;
          expect(dialog.type()).toBe("confirm");
          await dialog.accept();
          await clickPromise;
        },
      );
    },

    reply_count_visible: async ({ ctx, params }) => {
      await expect(commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: /^共 \d+ 条回复$/ })).toBeVisible();
    },

    open_replies: async ({ ctx, params }) => {
      await commentMessageRow(ctx.page, requiredString(params, "body")).getByRole("button", { name: /^共 \d+ 条回复$/ }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, CommentCaseData>;

async function revealCommentMessageActions(page: Page, body: string) {
  const row = commentMessageRow(page, body);
  await row.hover();
  return row;
}

async function openCommentDeleteMenu(page: Page, body: string) {
  const row = await revealCommentMessageActions(page, body);
  const deleteAction = row.getByRole("menuitem", { name: "删除评论" });
  if (!(await deleteAction.isVisible())) {
    await row.getByRole("button", { name: "更多评论操作" }).click();
  }
  return deleteAction;
}

function captureCommentResponse(page: Page, method: string, urlEndsWith: string): Promise<CapturedResponse> {
  return page
    .waitForResponse(
      (response) => response.request().method().toUpperCase() === method && response.url().endsWith(urlEndsWith),
      { timeout: COMMENT_RESPONSE_TIMEOUT_MS },
    )
    .then(async (response) => ({
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
      method: response.request().method(),
      body: await readResponseBody(response),
    }));
}

async function performWithCapturedResponse(
  responsePromise: Promise<CapturedResponse>,
  perform: () => Promise<unknown>,
): Promise<CapturedResponse> {
  try {
    await perform();
    return await responsePromise;
  } catch (error) {
    await responsePromise.catch(() => undefined);
    throw error;
  }
}

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

function requiredApiAttemptResult(params: StepParams, key: string): { status?: number; body?: unknown } {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是接口尝试结果`);
  }
  return value as { status?: number; body?: unknown };
}

async function attachmentUploadResponse(params: StepParams, key: string): Promise<{ status?: number; body?: unknown }> {
  const value = await params[key];
  if (isPlainApiResult(value)) {
    return value;
  }
  const captured = await requiredCapturedResponse(params, key);
  expect(captured.ok).toBe(true);
  return captured;
}

function isPlainApiResult(value: unknown): value is { status?: number; body?: unknown } {
  return Boolean(value && typeof value === "object" && "status" in value && "body" in value);
}

function createCommentPayload(params: StepParams) {
  const target = requiredCommentTarget(params, "target");
  return {
    targetType: target.type,
    targetId: target.id,
    targetTitle: target.title,
    body: requiredString(params, "body"),
  };
}

function createReplyPayload(params: StepParams) {
  const parent = requiredFixtureComment(params, "parent");
  return {
    ...createCommentPayload(params),
    parentMessageId: parent.messageId,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
