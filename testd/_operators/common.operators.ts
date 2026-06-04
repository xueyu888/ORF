import { expect, type Locator, type Page, type Response } from "@playwright/test";
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
  readTestObjective,
  readTestUserAccount,
  restoreTestUserLastOnlineAt,
  revokeOrySessionsByEmail,
  testObjectiveAbsent,
  testDefaultTeamMembershipMatches,
  testUserAccountMatches,
  testUserRecordMatches,
  type TestObjectiveFixtureInput,
  type TestUserAccountRecord,
  deleteTestObjectives,
  upsertTestObjective,
  upsertDefaultTeamMembership,
  upsertOryIdentityWithPassword,
  upsertTestUserAccount,
  upsertTestUserRecord,
} from "./common.helpers";
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from "./params";

const CAPTURED_RESPONSE_TIMEOUT_MS = 5_000;

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

      absent: async ({ params }) => {
        const email = requiredString(params, "email");
        await expect.poll(() => findOryIdentityByEmail(email)).toBeNull();
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
            const email = optionalString(params, "email");
            const userId = optionalString(params, "userId");
            if (email || userId) {
              const account = await readTestUserAccount({ email, userId });
              if (account) {
                return false;
              }
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

    "db.user_record": {
      upsert: async ({ params }) =>
        upsertTestUserRecord({
          userId: optionalString(params, "userId"),
          email: requiredString(params, "email"),
          name: requiredString(params, "name"),
          status: optionalUserStatus(params, "status"),
          identityId: optionalString(params, "identityId"),
        }),

      matches: async ({ params }) => {
        await expect
          .poll(() =>
            testUserRecordMatches({
              email: optionalString(params, "email"),
              userId: optionalString(params, "userId"),
              name: optionalString(params, "name"),
              status: optionalUserStatus(params, "status"),
            }),
          )
          .toBe(true);
      },
    },

    "db.default_team_membership": {
      upsert: async ({ params }) =>
        upsertDefaultTeamMembership({
          email: optionalString(params, "email"),
          userId: optionalString(params, "userId"),
          role: requiredUserRole(params, "role"),
        }),

      matches: async ({ params }) => {
        await expect
          .poll(() =>
            testDefaultTeamMembershipMatches({
              email: optionalString(params, "email"),
              userId: optionalString(params, "userId"),
              role: optionalUserRole(params, "role"),
            }),
          )
          .toBe(true);
      },
    },

    "db.objective": {
      upsert: async ({ params }) =>
        upsertTestObjective({
          id: optionalString(params, "id"),
          teamId: requiredString(params, "teamId"),
          title: requiredString(params, "title"),
          description: optionalString(params, "description"),
          whyItMatters: optionalString(params, "whyItMatters"),
          cycle: optionalString(params, "cycle"),
          stage: optionalOrfStage(params, "stage"),
          flowStatus: optionalObjectiveFlowStatus(params, "flowStatus"),
          status: optionalWorkStatus(params, "status"),
          confidence: optionalNumber(params, "confidence"),
          progress: optionalNumber(params, "progress"),
          boundary: optionalString(params, "boundary"),
          successDefinition: optionalString(params, "successDefinition"),
          finalDueAt: optionalString(params, "finalDueAt"),
          challengers: optionalStringList(params, "challengers"),
          challengerUserIds: optionalStringList(params, "challengerUserIds"),
          assignedChallengers: optionalStringList(params, "assignedChallengers"),
          assignedChallengerUserIds: optionalStringList(params, "assignedChallengerUserIds"),
          objectiveBasePoints: optionalNumber(params, "objectiveBasePoints"),
          createdBy: optionalString(params, "createdBy"),
          updatedBy: optionalString(params, "updatedBy"),
        } satisfies TestObjectiveFixtureInput),

      delete_by_title: async ({ params }) => {
        await deleteTestObjectives({ title: requiredString(params, "title") });
      },

      delete: async ({ params }) => {
        await deleteTestObjectives({
          id: optionalString(params, "id"),
          title: optionalString(params, "title"),
        });
      },

      absent: async ({ params }) => {
        await expect
          .poll(() =>
            testObjectiveAbsent({
              id: optionalString(params, "id"),
              title: optionalString(params, "title"),
            }),
          )
          .toBe(true);
      },

      exists: async ({ params }) => {
        await expect
          .poll(() =>
            readTestObjective({
              id: optionalString(params, "id"),
              title: optionalString(params, "title"),
            }),
          )
          .not.toBeNull();
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
        const email = optionalString(params, "email");
        const role = optionalString(params, "role");
        const status = optionalString(params, "status");
        const expectedUser = {
          ...(email ? { email } : {}),
          ...(role ? { role } : {}),
          ...(status ? { status } : {}),
        };

        await expect
          .poll(() => readBrowserSession(ctx.page))
          .toMatchObject({
            status: 200,
            body: {
              authenticated: true,
              ...(Object.keys(expectedUser).length > 0 ? { user: expectedUser } : {}),
            },
          });
      },
    },

    "auth.session.user_email": {
      equals: async ({ ctx, params }) => {
        await expect
          .poll(async () => (await readBrowserSession(ctx.page)).body.user?.email ?? null)
          .toBe(requiredString(params, "email"));
      },
    },

    "auth.session.user_role": {
      equals: async ({ ctx, params }) => {
        await expect
          .poll(async () => (await readBrowserSession(ctx.page)).body.user?.role ?? null)
          .toBe(requiredString(params, "role"));
      },
    },

    "auth.session.user_status": {
      equals: async ({ ctx, params }) => {
        await expect
          .poll(async () => {
            const user = (await readBrowserSession(ctx.page)).body.user as { status?: unknown } | null;
            return typeof user?.status === "string" ? user.status : null;
          })
          .toBe(requiredString(params, "status"));
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

    "page.login_form": {
      submit: async ({ ctx }) => {
        const responsePromise = ctx.page
          .waitForResponse((response) => {
            return (
              response.request().method().toUpperCase() === "POST" &&
              response.url().endsWith("/api/auth/login")
            );
          }, { timeout: CAPTURED_RESPONSE_TIMEOUT_MS })
          .then(toCapturedResponse);

        try {
          await ctx.page.getByRole("button", { name: "Sign In" }).click();
          return await responsePromise;
        } catch (error) {
          await responsePromise.catch(() => undefined);
          throw error;
        }
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

    "page.user_menu_item": {
      visible: async ({ ctx, params }) => {
        await expect(await userMenuItem(ctx.page, requiredString(params, "name"))).toBeVisible();
      },

      click: async ({ ctx, params }) => {
        await (await userMenuItem(ctx.page, requiredString(params, "name"))).click();
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

      rejected: async ({ params }) => {
        const response = await requiredCapturedResponse(params, "response");
        expect(response.ok).toBe(false);

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

async function toCapturedResponse(response: Response): Promise<CapturedResponse> {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
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

async function userMenuItem(page: Page, name: string): Promise<Locator> {
  const menuItem = page.getByRole("menuitem", { name, exact: true });
  if (!(await menuItem.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "用户菜单", exact: true }).click();
  }
  await expect(menuItem).toBeVisible();
  return menuItem;
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

function optionalStringList(params: StepParams, key: string): string[] | undefined {
  const value = params[key];
  if (typeof value === "string") {
    return [value];
  }
  return optionalStringArray(params, key);
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

function optionalOrfStage(params: StepParams, key: string) {
  const stage = optionalString(params, key);
  if (stage === undefined) {
    return undefined;
  }
  if (stage === "goalSetting" || stage === "resultClaiming" || stage === "orfReestimate" || stage === "goalFrozen") {
    return stage;
  }
  throw new Error(`参数 ${key} 必须是有效 ORF 阶段`);
}

function optionalObjectiveFlowStatus(params: StepParams, key: string) {
  const status = optionalString(params, key);
  if (status === undefined) {
    return undefined;
  }
  if (
    status === "candidate" ||
    status === "open" ||
    status === "applying" ||
    status === "recruiting" ||
    status === "reestimating" ||
    status === "frozen" ||
    status === "submitted" ||
    status === "settled" ||
    status === "closed"
  ) {
    return status;
  }
  throw new Error(`参数 ${key} 必须是有效目标流转状态`);
}

function optionalWorkStatus(params: StepParams, key: string) {
  const status = optionalString(params, key);
  if (status === undefined) {
    return undefined;
  }
  if (status === "On Track" || status === "At Risk" || status === "Blocked" || status === "Draft") {
    return status;
  }
  throw new Error(`参数 ${key} 必须是有效工作状态`);
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
