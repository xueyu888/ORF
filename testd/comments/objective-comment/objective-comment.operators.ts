import { expect, type Locator, type Page, type Response } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import type { ObjectiveCommentCaseData, ObjectiveCommentTarget, TestContext } from "./_support/objective-comment.context";
import {
  clearBrowserState,
  findOryIdentityByEmail,
  hasSessionCookie,
  isBackendReady,
  isDatabaseReady,
  isOryAdminReady,
  myChallengesHasComment,
  myChallengesHasObjectiveTarget,
  persistedObjectiveCommentExists,
  readBrowserAuthStorageState,
  readBrowserSession,
  removeTestComments,
  selectObjectiveCommentTarget,
  testCommentBodiesAbsent,
  testMemberFixtureExists,
  visibleObjectiveFixtureExists,
} from "./_support/objective-comment.helpers";

type CapturedResponse = {
  ok: boolean;
  status: number;
  url: string;
  method: string;
  body: unknown;
};

export const objectiveCommentOperators = {
  "api.health.ok": async ({ ctx }) => {
    await expect.poll(() => isBackendReady(ctx.page)).toBe(true);
  },

  "db.ready": async () => {
    await expect.poll(() => isDatabaseReady()).toBe(true);
  },

  "ory.admin.ready": async () => {
    await expect.poll(() => isOryAdminReady()).toBe(true);
  },

  "ory.identity.exists": async ({ params }) => {
    const email = requiredString(params, "email");
    await expect.poll(async () => (await findOryIdentityByEmail(email))?.traits?.email ?? null).toBe(email);
  },

  "db.member.fixture.exists": async ({ data }) => {
    await expect.poll(() => testMemberFixtureExists(data)).toBe(true);
  },

  "db.objective.fixture.exists": async ({ data }) => {
    await expect.poll(() => visibleObjectiveFixtureExists(data)).toBe(true);
  },

  "db.test_comments.absent": async ({ params }) => {
    await expect.poll(() => testCommentBodiesAbsent(requiredString(params, "prefix"))).toBe(true);
  },

  "db.test_comments.delete": async ({ params }) => {
    await removeTestComments(requiredString(params, "prefix"));
  },

  "db.comment.persisted": async ({ params }) => {
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

  "auth.session.unauthenticated": async ({ ctx }) => {
    await expect.poll(() => readBrowserSession(ctx.page)).toMatchObject({
      status: 200,
      body: { authenticated: false, user: null },
    });
  },

  "auth.session.authenticated": async ({ ctx, params }) => {
    const email = requiredString(params, "email");
    const role = requiredString(params, "role");

    await expect.poll(() => readBrowserSession(ctx.page)).toMatchObject({
      status: 200,
      body: {
        authenticated: true,
        user: { email, role },
      },
    });
  },

  "auth.logout": async ({ ctx }) => {
    await ctx.page
      .evaluate(async () => {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      })
      .catch(() => undefined);
  },

  "browser.clear_state": async ({ ctx }) => {
    await ctx.context.clearCookies();
    await clearBrowserState(ctx.page);
  },

  "browser.cookie.absent": async ({ ctx }) => {
    await expect.poll(() => hasSessionCookie(ctx.context)).toBe(false);
  },

  "browser.auth_storage.empty": async ({ ctx }) => {
    await expect.poll(() => readBrowserAuthStorageState(ctx.page)).toEqual({
      localStorageAuthKeys: [],
      sessionStorageAuthKeys: [],
    });
  },

  "page.protected.redirects_to_auth": async ({ ctx, params }) => {
    await ctx.page.goto(requiredString(params, "path"));
    await expect(ctx.page).toHaveURL(new RegExp(optionalString(params, "pattern") ?? "/auth$"));
  },

  "page.goto": async ({ ctx, params }) => {
    await ctx.page.goto(requiredString(params, "path"));
  },

  "page.url.match": async ({ ctx, params }) => {
    await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
  },

  "page.fill": async ({ ctx, params }) => {
    await locatorFromParams(ctx.page, params).fill(requiredString(params, "value"));
  },

  "page.click": async ({ ctx, params }) => {
    await locatorFromParams(ctx.page, params).click();
  },

  "api.my_challenges.select_objective_target": async ({ ctx, data }) =>
    selectObjectiveCommentTarget(ctx.page, myChallengesScopeFor(data.role)),

  "api.my_challenges.objective_target.present": async ({ ctx, data, params }) => {
    const target = requiredObjectiveCommentTarget(params, "target");
    await expect.poll(() => myChallengesHasObjectiveTarget(ctx.page, target, myChallengesScopeFor(data.role))).toBe(true);
  },

  "api.my_challenges.comment.present": async ({ ctx, data, params }) => {
    const target = requiredObjectiveCommentTarget(params, "target");
    const body = requiredString(params, "body");
    const author = requiredString(params, "author");
    await expect.poll(() => myChallengesHasComment(ctx.page, target, body, author, myChallengesScopeFor(data.role))).toBe(true);
  },

  "api.capture_response": async ({ ctx, runtime, params }) => {
    const saveAs = requiredString(params, "saveAs");
    const urlEndsWith = requiredString(params, "urlEndsWith");
    const method = optionalString(params, "method")?.toUpperCase();

    runtime.values[saveAs] = ctx.page
      .waitForResponse((response) => {
        const methodMatches = !method || response.request().method().toUpperCase() === method;
        return methodMatches && response.url().endsWith(urlEndsWith);
      })
      .then(async (response): Promise<CapturedResponse> => ({
        ok: response.ok(),
        status: response.status(),
        url: response.url(),
        method: response.request().method(),
        body: await readResponseBody(response),
      }));
  },

  "api.comment_response.matches": async ({ params }) => {
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

  "page.objective_comment.open": async ({ ctx, params }) => {
    await openObjectiveCommentPanel(ctx.page, requiredObjectiveCommentTarget(params, "target"));
  },

  "page.objective_row.visible": async ({ ctx, params }) => {
    await expect(objectiveRowByTitle(ctx.page, requiredObjectiveCommentTarget(params, "target").title)).toBeVisible();
  },

  "page.comment_panel.title": async ({ ctx, params }) => {
    const target = requiredObjectiveCommentTarget(params, "target");
    await expect(commentPanel(ctx.page).locator(".orf-comment-context-title")).toHaveText(target.title);
  },

  "page.comment_composer.ready": async ({ ctx }) => {
    await expect(commentComposer(ctx.page)).toBeVisible();
  },

  "page.comment_send.disabled": async ({ ctx }) => {
    await expect(ctx.page.getByRole("button", { name: "发送评论" })).toBeDisabled();
  },

  "page.comment_composer.fill": async ({ ctx, params }) => {
    await commentComposer(ctx.page).fill(requiredString(params, "value"));
  },

  "page.comment_composer.submit": async ({ ctx }) => {
    await ctx.page.getByRole("button", { name: "发送评论" }).click();
  },

  "page.comment_author.visible": async ({ ctx, params }) => {
    await expect(commentPanel(ctx.page).getByText(requiredString(params, "author"), { exact: true }).first()).toBeVisible();
  },

  "page.comment_body.visible": async ({ ctx, params }) => {
    await expect(commentPanel(ctx.page).getByText(requiredString(params, "body"), { exact: true })).toBeVisible();
  },

  "page.comment_composer.empty": async ({ ctx }) => {
    await expect(commentComposer(ctx.page)).toHaveValue("");
  },

  "page.comment_panel.close": async ({ ctx, params }) => {
    const button = ctx.page.getByRole("button", { name: "关闭评论窗口" });
    if (params.optional === true && (await button.count()) === 0) {
      return;
    }
    await button.click();
    await expect(commentPanel(ctx.page)).toHaveCount(0);
  },

  "page.objective_comment_badge.visible": async ({ ctx, params }) => {
    await expect(objectiveCommentBadge(ctx.page, requiredObjectiveCommentTarget(params, "target"))).toBeVisible();
  },

  "page.objective_comment_badge.open": async ({ ctx, params }) => {
    await objectiveCommentBadge(ctx.page, requiredObjectiveCommentTarget(params, "target")).click();
    await expect(commentPanel(ctx.page)).toBeVisible();
  },
} satisfies OperatorRegistry<TestContext, ObjectiveCommentCaseData>;

function myChallengesScopeFor(role: ObjectiveCommentCaseData["role"]) {
  return role === "admin" ? "all" : "mine";
}

function locatorFromParams(page: Page, params: StepParams): Locator {
  const exact = optionalBoolean(params, "exact");
  const name = optionalString(params, "name");

  if (typeof params.label === "string") {
    return page.getByLabel(params.label, { exact });
  }

  if (typeof params.role === "string") {
    return page.getByRole(params.role as Parameters<Page["getByRole"]>[0], {
      ...(name ? { name } : {}),
      ...(exact !== undefined ? { exact } : {}),
    });
  }

  if (typeof params.text === "string") {
    return page.getByText(params.text, { exact });
  }

  throw new Error("页面算子缺少定位参数，需要提供 label、role 或 text");
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

async function readResponseBody(response: Response) {
  const headers = response.headers();
  const contentType = headers["content-type"] ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
}

async function requiredCapturedResponse(params: StepParams, key: string): Promise<CapturedResponse> {
  const value = await params[key];
  if (!isCapturedResponse(value)) {
    throw new Error(`参数 ${key} 不是捕获到的接口响应`);
  }
  return value;
}

function isCapturedResponse(value: unknown): value is CapturedResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CapturedResponse).ok === "boolean" &&
    typeof (value as CapturedResponse).status === "number" &&
    typeof (value as CapturedResponse).url === "string" &&
    typeof (value as CapturedResponse).method === "string"
  );
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

function requiredString(params: StepParams, key: string) {
  const value = params[key];
  if (typeof value !== "string") {
    throw new Error(`参数 ${key} 必须是 string`);
  }
  return value;
}

function optionalString(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`参数 ${key} 必须是 string`);
  }
  return value;
}

function optionalBoolean(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`参数 ${key} 必须是 boolean`);
  }
  return value;
}
