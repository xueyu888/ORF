import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { FeedbackPageReturnCaseData, TestContext } from "./_support/feedback-page-return.context";
import { setDefaultLandingPathByEmail } from "./_support/feedback-page-return.helpers";

type CreateFeedbackPageSnapshot = {
  bodyInputVisible: boolean;
  formVisible: boolean;
  pageUrl: string;
  phenomenonInputVisible: boolean;
  submitVisible: boolean;
  titleVisible: boolean;
};

export const feedbackPageReturnOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "user.preferences": {
    set_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), requiredString(params, "path"));
    },
    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
  },
  "topbar.feedback": {
    visible: async ({ ctx }) => {
      await expect(feedbackButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(feedbackButton(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx }) => {
      await feedbackButton(ctx.page).click();
      await expect(ctx.page).toHaveURL(/\/feedback\/new$/);
      await expect(createFeedbackForm(ctx.page)).toBeVisible();
      return createFeedbackSnapshot(ctx.page);
    },
  },
  "feedback_create.back": {
    click: async ({ ctx }) => {
      await createFeedbackBackLink(ctx.page).click();
      await expect(ctx.page).toHaveURL(/\/feedback$/);
    },
  },
  "feedback_create_snapshot.page": {
    visible: async ({ params }) => {
      const snapshot = createFeedbackPageSnapshot(params);
      expect(snapshot.pageUrl).toMatch(new RegExp(requiredString(params, "pattern")));
    },
  },
  "feedback_create_snapshot.title": {
    visible: async ({ params }) => {
      expect(createFeedbackPageSnapshot(params).titleVisible).toBe(true);
    },
  },
  "feedback_create_snapshot.form": {
    visible: async ({ params }) => {
      expect(createFeedbackPageSnapshot(params).formVisible).toBe(true);
    },
  },
  "feedback_create_snapshot.phenomenon_input": {
    visible: async ({ params }) => {
      expect(createFeedbackPageSnapshot(params).phenomenonInputVisible).toBe(true);
    },
  },
  "feedback_create_snapshot.body_input": {
    visible: async ({ params }) => {
      expect(createFeedbackPageSnapshot(params).bodyInputVisible).toBe(true);
    },
  },
  "feedback_create_snapshot.submit": {
    visible: async ({ params }) => {
      expect(createFeedbackPageSnapshot(params).submitVisible).toBe(true);
    },
  },
  "feedback_page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
    },
  },
  "feedback_page.title": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.locator(".feedback-issue-title-block")).toBeVisible();
      await expect(ctx.page.getByText("TEAM ISSUE BOARD")).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, FeedbackPageReturnCaseData>;

function topbar(page: Page) {
  return page.locator("header.orf-topbar");
}

function feedbackButton(page: Page) {
  return topbar(page).getByRole("button", { name: "新建反馈" });
}

function createFeedbackBackLink(page: Page) {
  return page.locator("a.feedback-create-back-link");
}

function createFeedbackForm(page: Page) {
  return page.locator("form#new-feedback-issue-form");
}

function submitButton(page: Page): Locator {
  return createFeedbackForm(page).getByRole("button", { name: "创建 issue" });
}

async function createFeedbackSnapshot(page: Page): Promise<CreateFeedbackPageSnapshot> {
  return {
    bodyInputVisible: await createFeedbackForm(page).locator(".feedback-create-body-field").isVisible(),
    formVisible: await createFeedbackForm(page).isVisible(),
    pageUrl: page.url(),
    phenomenonInputVisible: await createFeedbackForm(page).getByPlaceholder("标题").isVisible(),
    submitVisible: await submitButton(page).isVisible(),
    titleVisible: await createFeedbackBackLink(page).isVisible(),
  };
}

function createFeedbackPageSnapshot(params: Record<string, unknown>): CreateFeedbackPageSnapshot {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<CreateFeedbackPageSnapshot>).bodyInputVisible !== "boolean" ||
    typeof (snapshot as Partial<CreateFeedbackPageSnapshot>).formVisible !== "boolean" ||
    typeof (snapshot as Partial<CreateFeedbackPageSnapshot>).pageUrl !== "string" ||
    typeof (snapshot as Partial<CreateFeedbackPageSnapshot>).phenomenonInputVisible !== "boolean" ||
    typeof (snapshot as Partial<CreateFeedbackPageSnapshot>).submitVisible !== "boolean" ||
    typeof (snapshot as Partial<CreateFeedbackPageSnapshot>).titleVisible !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含新建反馈页面展示状态");
  }
  return snapshot as CreateFeedbackPageSnapshot;
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
