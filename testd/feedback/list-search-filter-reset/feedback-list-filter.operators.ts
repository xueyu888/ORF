import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { FeedbackFixture, FeedbackListFilterCaseData, TestContext } from "./_support/feedback-list-filter.context";
import { deleteFeedbackListFixtures, feedbackListFixturesAbsent, feedbackListFixturesExist, prepareFeedbackListFixtures } from "./_support/feedback-list-filter.helpers";

type FeedbackListSnapshot = {
  phenomena: string[];
  query: string;
  categoryLabel: string;
  activeState: string;
  emptyMessageVisible: boolean;
  resetDisabled: boolean;
};

export const feedbackListFilterOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "db.feedback_filter_fixtures": {
    delete: async ({ params }) => {
      await deleteFeedbackListFixtures(requiredFixtures(params));
    },
    prepare: async ({ data }) => {
      await prepareFeedbackListFixtures(data);
    },
    exists: async ({ params }) => {
      await expect.poll(() => feedbackListFixturesExist(requiredFixtures(params))).toBe(true);
    },
    absent: async ({ params }) => {
      await expect.poll(() => feedbackListFixturesAbsent(requiredFixtures(params))).toBe(true);
    },
  },
  "feedback.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(`${escapeRegExp(requiredString(params, "path"))}$`));
      await expect(feedbackList(ctx.page)).toBeVisible();
    },
  },
  "feedback.search": {
    visible: async ({ ctx }) => {
      await expect(feedbackSearch(ctx.page)).toBeVisible();
    },
    value: async ({ ctx, params }) => {
      await expect(feedbackSearch(ctx.page)).toHaveValue(requiredString(params, "value"));
    },
    fill: async ({ ctx, params }) => {
      const value = requiredString(params, "value");
      await feedbackSearch(ctx.page).fill(value);
      await expect(feedbackSearch(ctx.page)).toHaveValue(value);
    },
  },
  "feedback.category_filter": {
    selected_label: async ({ ctx, params }) => {
      await expect(feedbackCategoryTrigger(ctx.page)).toHaveText(requiredString(params, "label"));
    },
    select: async ({ ctx, params }) => {
      const label = requiredString(params, "label");
      await feedbackCategoryTrigger(ctx.page).click();
      await feedbackCategoryOptions(ctx.page).getByRole("option", { name: label, exact: true }).click();
      await expect(feedbackCategoryTrigger(ctx.page)).toHaveText(label);
    },
  },
  "feedback.state_filter": {
    selected: async ({ ctx, params }) => {
      await expect(feedbackStateButton(ctx.page, requiredString(params, "state"))).toHaveAttribute("data-active", "true");
    },
    click: async ({ ctx, params }) => {
      const button = feedbackStateButton(ctx.page, requiredString(params, "state"));
      await button.click();
      await expect(button).toHaveAttribute("data-active", "true");
    },
  },
  "feedback.reset": {
    disabled: async ({ ctx }) => {
      await expect(feedbackReset(ctx.page)).toBeDisabled();
    },
    click: async ({ ctx }) => {
      await expect(feedbackReset(ctx.page)).toBeEnabled();
      await feedbackReset(ctx.page).click();
    },
  },
  "feedback.list": {
    contains_phenomena: async ({ ctx, params }) => {
      await expectFeedbackListContains(ctx.page, requiredPhenomena(params));
    },
    lacks_phenomena: async ({ ctx, params }) => {
      await expectFeedbackListLacks(ctx.page, requiredPhenomena(params));
    },
    capture: async ({ ctx }) => captureFeedbackListSnapshot(ctx.page),
  },
  "feedback.list_snapshot": {
    contains_phenomena: async ({ params }) => {
      expect(snapshot(params).phenomena).toEqual(expect.arrayContaining(requiredPhenomena(params)));
    },
    lacks_phenomena: async ({ params }) => {
      for (const phenomenon of requiredPhenomena(params)) {
        expect(snapshot(params).phenomena).not.toContain(phenomenon);
      }
    },
    empty_message_visible: async ({ params }) => {
      expect(snapshot(params).emptyMessageVisible).toBe(true);
    },
  },
  "feedback.filter_snapshot": {
    query_empty: async ({ params }) => {
      expect(snapshot(params).query).toBe("");
    },
    category_selected: async ({ params }) => {
      expect(snapshot(params).categoryLabel).toBe(requiredString(params, "label"));
    },
    state_selected: async ({ params }) => {
      expect(snapshot(params).activeState).toBe(requiredString(params, "state"));
    },
    reset_disabled: async ({ params }) => {
      expect(snapshot(params).resetDisabled).toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, FeedbackListFilterCaseData>;

function feedbackSearch(page: Page) {
  return page.getByLabel("搜索反馈");
}

function feedbackCategoryTrigger(page: Page) {
  return page.getByRole("button", { name: "分类", exact: true });
}

function feedbackCategoryOptions(page: Page) {
  return page.getByRole("listbox", { name: "分类", exact: true });
}

function feedbackStateButton(page: Page, state: string) {
  return page.locator(".feedback-issue-state-button").filter({ hasText: new RegExp(`^${escapeRegExp(state)}\\b`) });
}

function feedbackReset(page: Page) {
  return page.getByRole("button", { name: "重置", exact: true });
}

function feedbackList(page: Page) {
  return page.locator(".feedback-issue-list");
}

function feedbackRow(page: Page, phenomenon: string) {
  return page.locator(".feedback-issue-row", { hasText: phenomenon });
}

async function expectFeedbackListContains(page: Page, phenomena: readonly string[]) {
  for (const phenomenon of phenomena) {
    await expect(feedbackRow(page, phenomenon)).toBeVisible();
  }
}

async function expectFeedbackListLacks(page: Page, phenomena: readonly string[]) {
  for (const phenomenon of phenomena) {
    await expect(feedbackRow(page, phenomenon)).toHaveCount(0);
  }
}

async function captureFeedbackListSnapshot(page: Page): Promise<FeedbackListSnapshot> {
  await expect(feedbackList(page)).toBeVisible();
  return {
    phenomena: await page.locator(".feedback-issue-row h2").allTextContents(),
    query: await feedbackSearch(page).inputValue(),
    categoryLabel: (await feedbackCategoryTrigger(page).textContent())?.trim() ?? "",
    activeState: await activeFeedbackState(page),
    emptyMessageVisible: await page.getByText("没有匹配的反馈", { exact: true }).isVisible(),
    resetDisabled: await feedbackReset(page).isDisabled(),
  };
}

async function activeFeedbackState(page: Page) {
  const text = (await page.locator('.feedback-issue-state-button[data-active="true"]').textContent())?.trim() ?? "";
  return text.split(/\s+/)[0] ?? "";
}

function requiredFixtures(params: Record<string, unknown>) {
  const fixtures = params.fixtures;
  if (!Array.isArray(fixtures) || !fixtures.every(isFeedbackFixture)) throw new Error("参数 fixtures 必须是反馈 fixture 数组");
  return fixtures;
}

function isFeedbackFixture(value: unknown): value is FeedbackFixture {
  return Boolean(value && typeof value === "object" && typeof (value as Partial<FeedbackFixture>).id === "string" && typeof (value as Partial<FeedbackFixture>).phenomenon === "string" && typeof (value as Partial<FeedbackFixture>).category === "string" && ((value as Partial<FeedbackFixture>).status === "Open" || (value as Partial<FeedbackFixture>).status === "Closed"));
}

function requiredPhenomena(params: Record<string, unknown>) {
  const phenomena = params.phenomena;
  if (typeof phenomena === "string") return [phenomena];
  if (Array.isArray(phenomena) && phenomena.every((item) => typeof item === "string")) return phenomena;
  throw new Error("参数 phenomena 必须是字符串或字符串数组");
}

function snapshot(params: Record<string, unknown>): FeedbackListSnapshot {
  const value = params.snapshot;
  if (!value || typeof value !== "object" || !Array.isArray((value as Partial<FeedbackListSnapshot>).phenomena)) throw new Error("参数 snapshot 必须是反馈列表快照");
  return value as FeedbackListSnapshot;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function installDesktopShellMock(page: Page) {
  await page.addInitScript(() => {
    const maximizedState = { isFocused: true, isFullScreen: false, isMaximized: true, isMinimized: false, isVisible: true };
    window.orfDesktopShell = {
      closeWindow: async () => ({ data: maximizedState, status: "success" }),
      getWindowState: async () => ({ data: maximizedState, status: "success" }),
      minimizeWindow: async () => ({ data: { ...maximizedState, isMinimized: true }, status: "success" }),
      onWindowStateChange: () => () => undefined,
      setWorkbenchZoomLevel: async ({ level }) => ({ data: { level }, status: "success" }),
      toggleMaximizeWindow: async () => ({ data: maximizedState, status: "success" }),
    };
  });
}
