import type { BrowserContext, Page, Response } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db } from "../../server/db/client";
import {
  ORF_SESSION_COOKIE,
  ORY_ADMIN_URL,
  type BrowserAuthStorageState,
  type BrowserSession,
  type OryIdentity,
} from "./common.context";

export async function clearBrowserState(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // Opaque origins such as about:blank can deny storage access.
    }
  });
  await page
    .evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // Opaque origins such as about:blank can deny storage access.
      }
    })
    .catch(() => undefined);
}

export async function readBrowserSession(page: Page): Promise<BrowserSession> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json(),
    };
  });
}

export async function readBrowserAuthStorageState(page: Page): Promise<BrowserAuthStorageState> {
  return page.evaluate(() => ({
    localStorageAuthKeys: Object.keys(window.localStorage).filter((key) => /auth|session|token|ory/i.test(key)),
    sessionStorageAuthKeys: Object.keys(window.sessionStorage).filter((key) => /auth|session|token|ory/i.test(key)),
  }));
}

export async function hasSessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.some((cookie) => cookie.name === ORF_SESSION_COOKIE && cookie.value.length > 0);
}

export async function isBackendReady(page: Page) {
  try {
    const response = await page.request.get("/health");
    if (!response.ok()) {
      return false;
    }

    const body = await response.json();
    return body?.ok === true && body?.service === "orf-api";
  } catch {
    return false;
  }
}

export async function isDatabaseReady() {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function isOryAdminReady() {
  try {
    const response = await fetch(`${ORY_ADMIN_URL}/health/ready`, {
      headers: { accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function findOryIdentityByEmail(email: string) {
  const identities = await oryAdminFetch<OryIdentity[]>(
    `/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
  );
  return identities.find((identity) => identity.traits?.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function oryAdminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ORY_ADMIN_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Ory Admin API failed with ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function readResponseBody(response: Response) {
  const headers = response.headers();
  const contentType = headers["content-type"] ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
}
