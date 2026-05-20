import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { requiredString } from "../../_operators/params";
import type { ObjectiveCommentCaseData, ObjectiveCommentTarget, TestContext } from "./_support/objective-comment.context";
import {
  myChallengesHasComment,
  myChallengesHasObjectiveTarget,
  persistedObjectiveCommentExists,
  removeTestComments,
  selectObjectiveCommentTarget,
  testCommentBodiesAbsent,
  testMemberFixtureExists,
  visibleObjectiveFixtureExists,
} from "./_support/objective-comment.helpers";

export const objectiveCommentOperators = {
  "db.member.fixture": {
    exists: async ({ data }) => {
      await expect.poll(() => testMemberFixtureExists(data)).toBe(true);
    },
  },

  "db.objective.fixture": {
    exists: async ({ data }) => {
      await expect.poll(() => visibleObjectiveFixtureExists(data)).toBe(true);
    },
  },

  "db.test_comments": {
    absent: async ({ params }) => {
      await expect.poll(() => testCommentBodiesAbsent(requiredString(params, "prefix"))).toBe(true);
    },

    delete: async ({ params }) => {
      await removeTestComments(requiredString(params, "prefix"));
    },
  },

  "db.comment": {
    persisted: async ({ params }) => {
      await expect
        .poll(() =>
          persistedObjectiveCommentExists(
            requiredObjectiveCommentTarget(params, "target"),
            requiredString(params, "body"),
            requiredString(params, "email"),
          ),
        )
        .toBe(true);
    },
  },

  "api.my_challenges": {
    select_objective_target: async ({ ctx, data }) =>
      selectObjectiveCommentTarget(ctx.page, myChallengesScopeFor(data.role)),
  },

  "api.my_challenges.objective_target": {
    present: async ({ ctx, data, params }) => {
      const target = requiredObjectiveCommentTarget(params, "target");
      await expect
        .poll(() => myChallengesHasObjectiveTarget(ctx.page, target, myChallengesScopeFor(data.role)))
        .toBe(true);
    },
  },

  "api.my_challenges.comment": {
    present: async ({ ctx, data, params }) => {
      const target = requiredObjectiveCommentTarget(params, "target");
      const body = requiredString(params, "body");
      const author = requiredString(params, "author");
      await expect.poll(() => myChallengesHasComment(ctx.page, target, body, author, myChallengesScopeFor(data.role))).toBe(true);
    },
  },

  "api.comment_response": {
    matches: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      const target = requiredObjectiveCommentTarget(params, "target");
      const body = requiredString(params, "body");

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        commentThread: {
          targetType: target.type,
          targetId: target.id,
          targetTitle: target.title,
          messages: expect.arrayContaining([
            expect.objectContaining({
              body,
            }),
          ]),
        },
      });
    },
  },

  "page.objective_comment": {
    open: async ({ ctx, params }) => {
      await openObjectiveCommentPanel(ctx.page, requiredObjectiveCommentTarget(params, "target"));
    },
  },

  "page.objective_row": {
    visible: async ({ ctx, params }) => {
      await expect(objectiveRowByTitle(ctx.page, requiredObjectiveCommentTarget(params, "target").title)).toBeVisible();
    },
  },

  "page.comment_panel": {
    title: async ({ ctx, params }) => {
      const target = requiredObjectiveCommentTarget(params, "target");
      await expect(commentPanel(ctx.page).locator(".orf-comment-context-title")).toHaveText(target.title);
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
    },

    fill: async ({ ctx, params }) => {
      await commentComposer(ctx.page).fill(requiredString(params, "value"));
    },

    submit: async ({ ctx }) => {
      await ctx.page.getByRole("button", { name: "发送评论" }).click();
    },

    empty: async ({ ctx }) => {
      await expect(commentComposer(ctx.page)).toHaveValue("");
    },
  },

  "page.comment_send": {
    disabled: async ({ ctx }) => {
      await expect(ctx.page.getByRole("button", { name: "发送评论" })).toBeDisabled();
    },
  },

  "page.comment_author": {
    visible: async ({ ctx, params }) => {
      await expect(commentPanel(ctx.page).getByText(requiredString(params, "author"), { exact: true }).first()).toBeVisible();
    },
  },

  "page.comment_body": {
    visible: async ({ ctx, params }) => {
      await expect(commentPanel(ctx.page).getByText(requiredString(params, "body"), { exact: true })).toBeVisible();
    },
  },

  "page.objective_comment_badge": {
    visible: async ({ ctx, params }) => {
      await expect(objectiveCommentBadge(ctx.page, requiredObjectiveCommentTarget(params, "target"))).toBeVisible();
    },

    open: async ({ ctx, params }) => {
      await objectiveCommentBadge(ctx.page, requiredObjectiveCommentTarget(params, "target")).click();
      await expect(commentPanel(ctx.page)).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, ObjectiveCommentCaseData>;

function myChallengesScopeFor(role: ObjectiveCommentCaseData["role"]) {
  return role === "admin" ? "all" : "mine";
}

async function openObjectiveCommentPanel(page: Page, target: ObjectiveCommentTarget) {
  const row = objectiveRowByTitle(page, target.title);
  await expect(row).toBeVisible();
  await row.hover();
  await row.locator('[data-challenge-row-actions] button[aria-label="打开块菜单"]').click();
  await row.locator(".orf-block-menu").getByRole("button", { name: "评论", exact: true }).click();
  await expect(commentPanel(page)).toBeVisible();
}

function objectiveRowByTitle(page: Page, title: string) {
  return page.locator(".orf-challenge-row-objective").filter({ hasText: title }).first();
}

function commentPanel(page: Page) {
  return page.locator('[data-comment-panel="true"]');
}

function commentComposer(page: Page) {
  return commentPanel(page).locator('textarea[placeholder="添加评论..."]');
}

function objectiveCommentBadge(page: Page, target: ObjectiveCommentTarget) {
  return objectiveRowByTitle(page, target.title).getByRole("button", { name: /^打开 \d+ 条评论$/ });
}

function requiredObjectiveCommentTarget(params: StepParams, key: string): ObjectiveCommentTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    (value as ObjectiveCommentTarget).type !== "objective" ||
    typeof (value as ObjectiveCommentTarget).id !== "string" ||
    typeof (value as ObjectiveCommentTarget).title !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是目标评论对象`);
  }
  return value as ObjectiveCommentTarget;
}
