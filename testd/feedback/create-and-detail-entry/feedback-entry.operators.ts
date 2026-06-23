import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { FeedbackEntryCaseData, TestContext } from "./_support/feedback-entry.context";
import {
  deleteFeedbackEntryFixture,
  feedbackEntryFixtureAbsent,
  feedbackEntryFixtureExists,
  prepareFeedbackEntryFixture,
} from "./_support/feedback-entry.helpers";

type FeedbackCreateSnapshot = {
  bodyInputVisible: boolean;
  formVisible: boolean;
  pageUrl: string;
  submitVisible: boolean;
  titleInputVisible: boolean;
};

type FeedbackDetailSnapshot = {
  backLinkVisible: boolean;
  categoryText: string;
  pageUrl: string;
  pageVisible: boolean;
  stateText: string;
  titleText: string;
};

export const feedbackEntryOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "db.feedback_entry_issue": {
    delete: async ({ params }) => {
      await deleteFeedbackEntryFixture(requiredString(params, "feedbackId"), requiredString(params, "phenomenon"));
    },
    prepare: async ({ params }) => {
      await prepareFeedbackEntryFixture({
        email: requiredString(params, "email"),
        feedbackId: requiredString(params, "feedbackId"),
        phenomenon: requiredString(params, "phenomenon"),
        category: requiredString(params, "category"),
      });
    },
    exists: async ({ params }) => {
      await expect.poll(() => feedbackEntryFixtureExists(requiredString(params, "feedbackId"), requiredString(params, "phenomenon"))).toBe(true);
    },
    absent: async ({ params }) => {
      await expect.poll(() => feedbackEntryFixtureAbsent(requiredString(params, "feedbackId"), requiredString(params, "phenomenon"))).toBe(true);
    },
  },
  "feedback.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "path")));
      await expect(ctx.page.locator(".feedback-issue-page")).toBeVisible();
    },
  },
  "feedback.entry.new": {
    visible: async ({ ctx }) => {
      await expect(newFeedbackButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(newFeedbackButton(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx }) => {
      await newFeedbackButton(ctx.page).click();
      await expect(ctx.page).toHaveURL(/\/feedback\/new$/);
      await expect(feedbackCreateForm(ctx.page)).toBeVisible();
    },
  },
  "feedback.issue.row": {
    visible: async ({ ctx, params }) => {
      await expect(feedbackRow(ctx.page, requiredString(params, "phenomenon"))).toBeVisible();
    },
    enabled: async ({ ctx, params }) => {
      await expect(feedbackRow(ctx.page, requiredString(params, "phenomenon"))).toBeVisible();
    },
    click: async ({ ctx, params }) => {
      const row = feedbackRow(ctx.page, requiredString(params, "phenomenon"));
      await row.click();
      await expect(ctx.page.locator(".feedback-issue-detail-page")).toBeVisible();
    },
  },
  "feedback.create_snapshot": {
    capture: async ({ ctx }) => {
      await expect(feedbackCreateForm(ctx.page)).toBeVisible();
      return {
        bodyInputVisible: await feedbackCreateBodyField(ctx.page).isVisible(),
        formVisible: await feedbackCreateForm(ctx.page).isVisible(),
        pageUrl: ctx.page.url(),
        submitVisible: await feedbackCreateSubmitButton(ctx.page).isVisible(),
        titleInputVisible: await feedbackCreateTitleInput(ctx.page).isVisible(),
      } satisfies FeedbackCreateSnapshot;
    },
    page_visible: async ({ params }) => {
      const snapshot = createFeedbackSnapshot(params);
      expect(snapshot.pageUrl).toMatch(new RegExp(requiredString(params, "pattern")));
    },
    form_visible: async ({ params }) => {
      expect(createFeedbackSnapshot(params).formVisible).toBe(true);
    },
    title_input_visible: async ({ params }) => {
      expect(createFeedbackSnapshot(params).titleInputVisible).toBe(true);
    },
    body_input_visible: async ({ params }) => {
      expect(createFeedbackSnapshot(params).bodyInputVisible).toBe(true);
    },
    submit_visible: async ({ params }) => {
      expect(createFeedbackSnapshot(params).submitVisible).toBe(true);
    },
  },
  "feedback.issue_detail_snapshot": {
    capture: async ({ ctx }) => {
      await expect(ctx.page.locator(".feedback-issue-detail-page")).toBeVisible();
      return {
        backLinkVisible: await feedbackDetailBackLink(ctx.page).isVisible(),
        categoryText: await feedbackDetailBlock(ctx.page, "分类").textContent().then((text) => text?.trim() ?? ""),
        pageUrl: ctx.page.url(),
        pageVisible: await ctx.page.locator(".feedback-issue-detail-page").isVisible(),
        stateText: await feedbackDetailStateBadge(ctx.page).textContent().then((text) => text?.trim() ?? ""),
        titleText: await feedbackDetailTitle(ctx.page).textContent().then((text) => text?.trim() ?? ""),
      } satisfies FeedbackDetailSnapshot;
    },
    page_visible: async ({ params }) => {
      const snapshot = createFeedbackDetailSnapshot(params);
      expect(snapshot.pageUrl).toMatch(new RegExp(requiredString(params, "pattern")));
      expect(snapshot.pageVisible).toBe(true);
    },
    title_visible: async ({ params }) => {
      expect(createFeedbackDetailSnapshot(params).titleText).toBe(requiredString(params, "value"));
    },
    state_visible: async ({ params }) => {
      expect(createFeedbackDetailSnapshot(params).stateText).toContain(requiredString(params, "value"));
    },
    category_visible: async ({ params }) => {
      expect(createFeedbackDetailSnapshot(params).categoryText).toContain(requiredString(params, "value"));
    },
  },
} satisfies OperatorRegistry<TestContext, FeedbackEntryCaseData>;

function newFeedbackButton(page: Page) {
  return page.locator("header.orf-topbar").getByRole("button", { name: "新建反馈" });
}

function feedbackCreateForm(page: Page) {
  return page.locator("form#new-feedback-issue-form");
}

function feedbackCreateTitleInput(page: Page) {
  return feedbackCreateForm(page).getByPlaceholder("标题");
}

function feedbackCreateBodyField(page: Page) {
  return feedbackCreateForm(page).locator(".feedback-create-body-field");
}

function feedbackCreateSubmitButton(page: Page) {
  return feedbackCreateForm(page).getByRole("button", { name: "创建 issue" });
}

function feedbackRow(page: Page, phenomenon: string) {
  return page.locator(".feedback-issue-row", { hasText: phenomenon });
}

function feedbackDetailTitle(page: Page) {
  return page.locator(".feedback-issue-detail-title-block h2");
}

function feedbackDetailStateBadge(page: Page) {
  return page.locator(".feedback-issue-state-badge");
}

function feedbackDetailBlock(page: Page, label: string) {
  return page.locator(".feedback-issue-sidebar-block").filter({ hasText: label });
}

function feedbackDetailBackLink(page: Page) {
  return page.locator(".feedback-issue-back-link");
}

function createFeedbackSnapshot(params: Record<string, unknown>) {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<FeedbackCreateSnapshot>).bodyInputVisible !== "boolean" ||
    typeof (snapshot as Partial<FeedbackCreateSnapshot>).formVisible !== "boolean" ||
    typeof (snapshot as Partial<FeedbackCreateSnapshot>).pageUrl !== "string" ||
    typeof (snapshot as Partial<FeedbackCreateSnapshot>).submitVisible !== "boolean" ||
    typeof (snapshot as Partial<FeedbackCreateSnapshot>).titleInputVisible !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含新建反馈页面快照");
  }
  return snapshot as FeedbackCreateSnapshot;
}

function createFeedbackDetailSnapshot(params: Record<string, unknown>) {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<FeedbackDetailSnapshot>).backLinkVisible !== "boolean" ||
    typeof (snapshot as Partial<FeedbackDetailSnapshot>).categoryText !== "string" ||
    typeof (snapshot as Partial<FeedbackDetailSnapshot>).pageUrl !== "string" ||
    typeof (snapshot as Partial<FeedbackDetailSnapshot>).pageVisible !== "boolean" ||
    typeof (snapshot as Partial<FeedbackDetailSnapshot>).stateText !== "string" ||
    typeof (snapshot as Partial<FeedbackDetailSnapshot>).titleText !== "string"
  ) {
    throw new Error("参数 snapshot 必须包含反馈详情页面快照");
  }
  return snapshot as FeedbackDetailSnapshot;
}

async function installDesktopShellMock(page: Page) {
  await page.addInitScript(() => {
    const maximizedState = {
      isFocused: true,
      isFullScreen: false,
      isMaximized: true,
      isMinimized: false,
      isVisible: true,
    };
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
