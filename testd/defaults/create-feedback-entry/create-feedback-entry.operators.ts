import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { CreateFeedbackEntryCaseData, TestContext } from "./_support/create-feedback-entry.context";
import { setDefaultLandingPathByEmail } from "./_support/create-feedback-entry.helpers";

export const createFeedbackEntryOperators = {
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
    },
  },
  "feedback_create.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
    },
  },
  "feedback_create.title": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("link", { name: "反馈" })).toBeVisible();
    },
  },
  "feedback_create.form": {
    visible: async ({ ctx }) => {
      await expect(createFeedbackForm(ctx.page)).toBeVisible();
    },
  },
  "feedback_create.phenomenon_input": {
    visible: async ({ ctx }) => {
      await expect(createFeedbackForm(ctx.page).getByPlaceholder("标题")).toBeVisible();
    },
  },
  "feedback_create.body_input": {
    visible: async ({ ctx }) => {
      await expect(createFeedbackForm(ctx.page).locator(".feedback-create-body-field")).toBeVisible();
    },
  },
  "feedback_create.submit": {
    visible: async ({ ctx }) => {
      await expect(submitButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(submitButton(ctx.page)).toBeEnabled();
    },
  },
} satisfies OperatorRegistry<TestContext, CreateFeedbackEntryCaseData>;

function topbar(page: Page) {
  return page.locator("header.orf-topbar");
}

function feedbackButton(page: Page) {
  return topbar(page).getByRole("button", { name: "新建反馈" });
}

function createFeedbackForm(page: Page) {
  return page.locator("form#new-feedback-issue-form");
}

function submitButton(page: Page): Locator {
  return createFeedbackForm(page).getByRole("button", { name: "创建 issue" });
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
