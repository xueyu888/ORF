import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../_framework/types";
import {
  type BrowserTestContext,
  type CapturedResponse,
} from "./common.context";
import {
  clearBrowserState,
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
  readBrowserAuthStorageState,
  readBrowserSession,
  readResponseBody,
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
      exists: async ({ params }) => {
        const email = requiredString(params, "email");
        await expect
          .poll(
            async () =>
              (await findOryIdentityByEmail(email))?.traits?.email ?? null,
          )
          .toBe(email);
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
