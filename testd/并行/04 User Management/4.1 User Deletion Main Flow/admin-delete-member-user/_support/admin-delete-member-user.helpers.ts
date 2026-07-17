import { expect, type Locator, type Page } from "@playwright/test";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { chatChannelMembers, chatChannels, chatSyncEvents } from "../../../../../../server/db/schema";
import type { CapturedResponse } from "../../../../../_operators/common.context";
import { readResponseBody } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";

const RESPONSE_TIMEOUT_MS = 10_000;

export async function loginAsAdmin(page: Page, input: { email: string; password: string }) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect
    .poll(async () => {
      const response = await page.evaluate(async () => {
        const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
        return {
          status: sessionResponse.status,
          body: await sessionResponse.json(),
        };
      });
      return response.status === 200 && response.body?.authenticated === true;
    })
    .toBe(true);
}

export async function preparePublicChatMemberships(page: Page) {
  const response = await page.evaluate(async () => {
    const bootstrapResponse = await fetch("/api/chat/bootstrap", { credentials: "include" });
    return {
      status: bootstrapResponse.status,
      body: await bootstrapResponse.json().catch(() => null),
    };
  });

  if (response.status !== 200) {
    throw new Error(`准备公共聊天成员关系失败: ${response.status}`);
  }
}

export function memberRow(page: Page, memberName: string): Locator {
  return page.locator(".orf-user-table tbody tr").filter({ hasText: memberName }).first();
}

export function memberDeleteButton(page: Page, memberName: string) {
  return memberRow(page, memberName).getByRole("button", { name: "删除用户", exact: true });
}

export async function deleteMemberFromPage(
  page: Page,
  input: { memberName: string; userId: string },
): Promise<CapturedResponse> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method().toUpperCase() === "DELETE" &&
      response.url().endsWith(`/api/users/${encodeURIComponent(input.userId)}`),
    { timeout: RESPONSE_TIMEOUT_MS },
  );
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });

  await memberDeleteButton(page, input.memberName).click();
  const response = await responsePromise;
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}

export async function hasActivePublicChatMembership(userId: string) {
  const [row] = await db
    .select({ channelId: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannels.id, chatChannelMembers.channelId))
    .where(
      and(
        eq(chatChannelMembers.userId, userId),
        eq(chatChannels.type, "public"),
        isNull(chatChannels.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function hasAnonymousChatMembershipRemovalEvent(userId: string) {
  const [row] = await db
    .select({ seq: chatSyncEvents.seq })
    .from(chatSyncEvents)
    .where(
      and(
        eq(chatSyncEvents.eventType, "channel.member.changed"),
        eq(chatSyncEvents.objectType, "user"),
        eq(chatSyncEvents.objectId, userId),
        isNull(chatSyncEvents.actorUserId),
        sql`${chatSyncEvents.metadataJson} ->> 'membership' = 'removed'`,
      ),
    )
    .orderBy(desc(chatSyncEvents.seq))
    .limit(1);
  return Boolean(row);
}
