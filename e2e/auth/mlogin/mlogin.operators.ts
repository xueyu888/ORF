import { expect, type Locator, type Page, type Response } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import type { MloginCaseData, TestContext } from "./_support/mlogin.context";
import {
  clearBrowserState,
  ensureTestTeam,
  findOryIdentityByEmail,
  hasSessionCookie,
  isBackendReady,
  isDatabaseReady,
  isOryAdminReady,
  readBrowserAuthStorageState,
  readBrowserSession,
  readOrfMembership,
  restoreLastLoginAt,
  revokeIdentitySessions,
  upsertOrfMember,
  upsertOryIdentity,
} from "./_support/mlogin.helpers";

type CapturedResponse = {
  ok: boolean;
  status: number;
  url: string;
  method: string;
  body: unknown;
};

export const mloginOperators = {
  "api.health.ok": async ({ ctx }) => {
    await expect.poll(() => isBackendReady(ctx.page)).toBe(true);
  },

  "db.ready": async () => {
    await expect.poll(() => isDatabaseReady()).toBe(true);
  },

  "ory.admin.ready": async () => {
    await expect.poll(() => isOryAdminReady()).toBe(true);
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

  "browser.cookie.present": async ({ ctx }) => {
    await expect.poll(() => hasSessionCookie(ctx.context)).toBe(true);
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

  "page.visible": async ({ ctx, params }) => {
    await expect(locatorFromParams(ctx.page, params)).toBeVisible();
  },

  "page.enabled": async ({ ctx, params }) => {
    await expect(locatorFromParams(ctx.page, params)).toBeEnabled();
  },

  "page.count": async ({ ctx, params }) => {
    await expect(locatorFromParams(ctx.page, params)).toHaveCount(requiredNumber(params, "count"));
  },

  "page.fill": async ({ ctx, params }) => {
    await locatorFromParams(ctx.page, params).fill(requiredString(params, "value"));
  },

  "page.click": async ({ ctx, params }) => {
    await locatorFromParams(ctx.page, params).click();
  },

  "input.value": async ({ ctx, params }) => {
    await expect(locatorFromParams(ctx.page, params)).toHaveValue(requiredString(params, "value"));
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

  "api.response.ok": async ({ params }) => {
    const response = await requiredCapturedResponse(params, "response");
    expect(response.ok).toBe(true);

    const status = optionalNumber(params, "status");
    if (status !== undefined) {
      expect(response.status).toBe(status);
    }
  },

  "ory.identity.upsert": async ({ data }) => upsertOryIdentity(data),

  "ory.identity.exists": async ({ params }) => {
    const email = requiredString(params, "email");
    await expect.poll(async () => (await findOryIdentityByEmail(email))?.traits?.email ?? null).toBe(email);
  },

  "ory.sessions.revoke": async ({ params }) => {
    const identityId = optionalString(params, "identityId");
    if (!identityId) {
      if (params.optional === true) {
        return;
      }
      throw new Error("ory.sessions.revoke 缺少 identityId");
    }

    await revokeIdentitySessions(identityId);
  },

  "db.team.ensure": async ({ data }) => ensureTestTeam(data.teamId),

  "db.user.upsert": async ({ data }) => upsertOrfMember(data.teamId, data),

  "db.member.matches": async ({ params }) => {
    const userId = requiredString(params, "userId");
    const teamId = requiredString(params, "teamId");
    const email = requiredString(params, "email");
    const role = requiredString(params, "role");

    await expect.poll(() => readOrfMembership(userId, teamId)).toMatchObject({ email, role });
  },

  "db.user.restore_last_login_at": async ({ params }) => {
    const userId = optionalString(params, "userId");
    if (!userId) {
      if (params.optional === true) {
        return;
      }
      throw new Error("db.user.restore_last_login_at 缺少 userId");
    }

    const lastLoginAt = params.lastLoginAt;
    if (lastLoginAt !== null && typeof lastLoginAt !== "string") {
      if (params.optional === true && lastLoginAt === undefined) {
        return;
      }
      throw new Error("db.user.restore_last_login_at 的 lastLoginAt 必须是 string 或 null");
    }

    await restoreLastLoginAt(userId, lastLoginAt);
  },
} satisfies OperatorRegistry<TestContext, MloginCaseData>;

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

function requiredNumber(params: StepParams, key: string) {
  const value = params[key];
  if (typeof value !== "number") {
    throw new Error(`参数 ${key} 必须是 number`);
  }
  return value;
}

function optionalNumber(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`参数 ${key} 必须是 number`);
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
