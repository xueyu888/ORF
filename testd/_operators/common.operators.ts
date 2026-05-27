import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../_framework/types";
import {
  type BrowserTestContext,
  type CapturedResponse,
} from "./common.context";
import {
  clearBrowserState,
  deleteOryIdentityByEmail,
  deleteTestUserMemberships,
  deleteTestUsers,
  findOryIdentityByEmail,
  hasSessionCookie,
  isBackendReady,
  isDatabaseSchemaCurrent,
  isDatabaseReady,
  isOryAdminReady,
  isOryAdminPublicReady,
  isFrontendAuthEntryReady,
  isFrontendReady,
  isSessionEndpointReady,
  oryIdentityPasswordAvailable,
  readBrowserAuthStorageState,
  readBrowserSession,
  readResponseBody,
  readTestUserAccount,
  restoreTestUserLastOnlineAt,
  revokeOrySessionsByEmail,
  testUserAccountMatches,
  type TestUserAccountRecord,
  upsertOryIdentityWithPassword,
  upsertTestUserAccount,
} from "./common.helpers";
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from "./params";

export function createCommonOperators<
  TContext extends BrowserTestContext,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(): OperatorRegistry<TContext, TData> {
  return {
    "frontend.service": {
      available: async ({ ctx }) => {
        await expect.poll(() => isFrontendReady(ctx.page)).toBe(true);
      },
    },

    "frontend.login_entry": {
      accessible: async ({ ctx }) => {
        await expect.poll(() => isFrontendAuthEntryReady(ctx.page)).toBe(true);
      },
    },

    "api.health": {
      ok: async ({ ctx }) => {
        await expect.poll(() => isBackendReady(ctx.page)).toBe(true);
      },
    },

    db: {
      ready: async () => {
        await expect.poll(() => isDatabaseReady()).toBe(true);
      },
    },

    "db.schema": {
      current: async () => {
        await expect.poll(() => isDatabaseSchemaCurrent()).toBe(true);
      },
    },

    "ory.admin": {
      ready: async () => {
        await expect.poll(() => isOryAdminReady()).toBe(true);
      },
    },

    "ory.admin_public": {
      ready: async ({ ctx }) => {
        await expect.poll(() => isOryAdminPublicReady(ctx.page)).toBe(true);
      },
    },

    "ory.identity": {
      upsert_password: async ({ params }) =>
        upsertOryIdentityWithPassword({
          email: requiredString(params, "email"),
          name: requiredString(params, "name"),
          password: requiredString(params, "password"),
        }),

      exists: async ({ params }) => {
        const email = requiredString(params, "email");
        await expect
          .poll(
            async () =>
              (await findOryIdentityByEmail(email))?.traits?.email ?? null,
          )
          .toBe(email);
      },

      password_available: async ({ params }) => {
        await expect
          .poll(() => oryIdentityPasswordAvailable(requiredString(params, "email")))
          .toBe(true);
      },

      delete_by_email: async ({ params }) => {
        await deleteOryIdentityByEmail(requiredString(params, "email"));
      },
    },

    "ory.sessions": {
      revoke_by_email: async ({ params }) => {
        const email = optionalString(params, "email");
        if (!email) {
          return;
        }
        await revokeOrySessionsByEmail(email);
      },
    },

    "db.user": {
      upsert: async ({ params }) =>
        upsertTestUserAccount({
          userId: optionalString(params, "userId"),
          email: requiredString(params, "email"),
          name: requiredString(params, "name"),
          role: requiredUserRole(params, "role"),
          status: optionalUserStatus(params, "status"),
          identityId: optionalString(params, "identityId"),
        }),

      record: async ({ params }) => {
        const account = await readTestUserAccount({
          email: optionalString(params, "email"),
          userId: optionalString(params, "userId"),
          role: optionalUserRole(params, "role"),
        });
        if (!account) {
          throw new Error("测试用户账号不存在或不可用");
        }
        return account;
      },

      matches: async ({ params }) => {
        await expect
          .poll(() =>
            testUserAccountMatches({
              email: optionalString(params, "email"),
              userId: optionalString(params, "userId"),
              name: optionalString(params, "name"),
              role: optionalUserRole(params, "role"),
              status: optionalUserStatus(params, "status"),
            }),
          )
          .toBe(true);
      },

      absent: async ({ params }) => {
        await expect
          .poll(async () => {
            const account = await readTestUserAccount({
              email: optionalString(params, "email"),
              userId: optionalString(params, "userId"),
            });
            if (account) {
              return false;
            }

            const emails = optionalStringArray(params, "emails");
            if (!emails) {
              return true;
            }

            for (const email of emails) {
              if (await readTestUserAccount({ email })) {
                return false;
              }
            }
            return true;
          })
          .toBe(true);
      },

      restore_last_online_at: async ({ params }) => {
        await restoreTestUserLastOnlineAt(optionalUserAccount(params, "account"));
      },

      delete_memberships: async ({ params }) => {
        await deleteTestUserMemberships({
          email: optionalString(params, "email"),
          emails: optionalStringArray(params, "emails"),
          userId: optionalString(params, "userId"),
        });
      },

      delete: async ({ params }) => {
        await deleteTestUsers({
          email: optionalString(params, "email"),
          emails: optionalStringArray(params, "emails"),
          userId: optionalString(params, "userId"),
        });
      },
    },

    "auth.session": {
      accessible: async ({ ctx }) => {
        await expect.poll(() => isSessionEndpointReady(ctx.page)).toBe(true);
      },

      unauthenticated: async ({ ctx }) => {
        await expect
          .poll(() => readBrowserSession(ctx.page))
          .toMatchObject({
            status: 200,
            body: { authenticated: false, user: null },
          });
      },

      authenticated: async ({ ctx, params }) => {
        const email = requiredString(params, "email");
        const role = requiredString(params, "role");
        const status = optionalString(params, "status");

        await expect
          .poll(() => readBrowserSession(ctx.page))
          .toMatchObject({
            status: 200,
            body: {
              authenticated: true,
              user: {
                email,
                role,
                ...(status ? { status } : {}),
              },
            },
          });
      },
    },

    auth: {
      logout: async ({ ctx }) => {
        await ctx.page
          .evaluate(async () => {
            await fetch("/api/auth/logout", {
              method: "POST",
              credentials: "include",
            });
          })
          .catch(() => undefined);
      },
    },

    browser: {
      clear_state: async ({ ctx }) => {
        await ctx.context.clearCookies();
        await clearBrowserState(ctx.page);
      },
    },

    "browser.cookie": {
      absent: async ({ ctx }) => {
        await expect.poll(() => hasSessionCookie(ctx.context)).toBe(false);
      },

      present: async ({ ctx }) => {
        await expect.poll(() => hasSessionCookie(ctx.context)).toBe(true);
      },
    },

    "browser.auth_storage": {
      empty: async ({ ctx }) => {
        await expect
          .poll(() => readBrowserAuthStorageState(ctx.page))
          .toEqual({
            localStorageAuthKeys: [],
            sessionStorageAuthKeys: [],
          });
      },
    },

    "page.protected": {
      redirects_to_auth: async ({ ctx, params }) => {
        await ctx.page.goto(requiredString(params, "path"));
        await expect(ctx.page).toHaveURL(
          new RegExp(optionalString(params, "pattern") ?? "/auth$"),
        );
      },
    },

    page: {
      goto: async ({ ctx, params }) => {
        await ctx.page.goto(requiredString(params, "path"));
      },

      visible: async ({ ctx, params }) => {
        await expect(locatorFromParams(ctx.page, params)).toBeVisible();
      },

      enabled: async ({ ctx, params }) => {
        await expect(locatorFromParams(ctx.page, params)).toBeEnabled();
      },

      count: async ({ ctx, params }) => {
        await expect(locatorFromParams(ctx.page, params)).toHaveCount(
          requiredNumber(params, "count"),
        );
      },

      fill: async ({ ctx, params }) => {
        await locatorFromParams(ctx.page, params).fill(
          requiredString(params, "value"),
        );
      },

      click: async ({ ctx, params }) => {
        await locatorFromParams(ctx.page, params).click();
      },
    },

    "page.url": {
      match: async ({ ctx, params }) => {
        await expect(ctx.page).toHaveURL(
          new RegExp(requiredString(params, "pattern")),
        );
      },
    },

    "page.runtime": {
      stop: async ({ ctx }) => {
        await ctx.page.goto("about:blank");
      },
    },

    input: {
      value: async ({ ctx, params }) => {
        await expect(locatorFromParams(ctx.page, params)).toHaveValue(
          requiredString(params, "value"),
        );
      },
    },

    api: {
      capture_response: async ({ ctx, runtime, params }) => {
        const saveAs = requiredString(params, "saveAs");
        const urlEndsWith = requiredString(params, "urlEndsWith");
        const method = optionalString(params, "method")?.toUpperCase();

        runtime.values[saveAs] = ctx.page
          .waitForResponse((response) => {
            const methodMatches =
              !method || response.request().method().toUpperCase() === method;
            return methodMatches && response.url().endsWith(urlEndsWith);
          })
          .then(
            async (response): Promise<CapturedResponse> => ({
              ok: response.ok(),
              status: response.status(),
              url: response.url(),
              method: response.request().method(),
              body: await readResponseBody(response),
            }),
          );
      },
    },

    "api.response": {
      ok: async ({ params }) => {
        const response = await requiredCapturedResponse(params, "response");
        expect(response.ok).toBe(true);

        const status = optionalNumber(params, "status");
        if (status !== undefined) {
          expect(response.status).toBe(status);
        }
      },
    },
  };
}

export async function requiredCapturedResponse(
  params: StepParams,
  key: string,
): Promise<CapturedResponse> {
  const value = await params[key];
  if (!isCapturedResponse(value)) {
    throw new Error(`参数 ${key} 不是捕获到的接口响应`);
  }
  return value;
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

function requiredUserRole(params: StepParams, key: string) {
  const role = requiredString(params, key);
  if (role === "admin" || role === "member") {
    return role;
  }
  throw new Error(`参数 ${key} 必须是 admin 或 member`);
}

function optionalUserRole(params: StepParams, key: string) {
  const role = optionalString(params, key);
  if (role === undefined) {
    return undefined;
  }
  if (role === "admin" || role === "member") {
    return role;
  }
  throw new Error(`参数 ${key} 必须是 admin 或 member`);
}

function optionalUserStatus(params: StepParams, key: string) {
  const status = optionalString(params, key);
  if (status === undefined) {
    return undefined;
  }
  if (status === "pending" || status === "active" || status === "rejected" || status === "disabled") {
    return status;
  }
  throw new Error(`参数 ${key} 必须是有效用户状态`);
}

function optionalUserAccount(params: StepParams, key: string): TestUserAccountRecord | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value === "object" &&
    typeof (value as TestUserAccountRecord).userId === "string" &&
    typeof (value as TestUserAccountRecord).email === "string" &&
    typeof (value as TestUserAccountRecord).role === "string"
  ) {
    return value as TestUserAccountRecord;
  }
  throw new Error(`参数 ${key} 必须是测试用户账号记录`);
}
