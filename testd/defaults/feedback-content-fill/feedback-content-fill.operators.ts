import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { FeedbackContentFillCaseData, TestContext } from "./_support/feedback-content-fill.context";
import { setDefaultLandingPathByEmail } from "./_support/feedback-content-fill.helpers";

export const feedbackContentFillOperators = {
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
    click: async ({ ctx }) => {
      await feedbackButton(ctx.page).click();
      await expect(ctx.page).toHaveURL(/\/feedback\/new$/);
      await expect(createFeedbackForm(ctx.page)).toBeVisible();
    },
  },
  "feedback_create.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
    },
  },
  "feedback_create.form": {
    visible: async ({ ctx }) => {
      await expect(createFeedbackForm(ctx.page)).toBeVisible();
    },
  },
  "feedback_create.title_input": {
    empty: async ({ ctx }) => {
      await expect(titleInput(ctx.page)).toHaveValue("");
    },
    fill: async ({ ctx, params }) => {
      await titleInput(ctx.page).fill(requiredString(params, "value"));
    },
    value: async ({ ctx, params }) => {
      await expect(titleInput(ctx.page)).toHaveValue(requiredString(params, "value"));
    },
  },
  "feedback_create.description_input": {
    empty: async ({ ctx }) => {
      await expect(descriptionInput(ctx.page)).toHaveValue("");
    },
    fill: async ({ ctx, params }) => {
      await descriptionInput(ctx.page).fill(requiredString(params, "value"));
    },
    value: async ({ ctx, params }) => {
      await expect(descriptionInput(ctx.page)).toHaveValue(requiredString(params, "value"));
    },
  },
  "feedback_create.owner_select": {
    visible: async ({ ctx }) => {
      await expect(ownerSelect(ctx.page)).toBeVisible();
    },
    select: async ({ ctx, params }) => {
      await selectByVisibleLabelPrefix(ownerSelect(ctx.page), requiredString(params, "label"));
    },
    selected_label: async ({ ctx, params }) => {
      await expectSelectedLabelPrefix(ownerSelect(ctx.page), requiredString(params, "label"));
    },
  },
  "feedback_create.category_select": {
    visible: async ({ ctx }) => {
      await expect(categorySelect(ctx.page)).toBeVisible();
    },
    select: async ({ ctx, params }) => {
      await selectByVisibleLabel(categorySelect(ctx.page), requiredString(params, "label"));
    },
    selected_label: async ({ ctx, params }) => {
      await expectSelectedLabel(categorySelect(ctx.page), requiredString(params, "label"));
    },
  },
  "feedback_create.impact_select": {
    visible: async ({ ctx }) => {
      await expect(impactSelect(ctx.page)).toBeVisible();
    },
    select: async ({ ctx, params }) => {
      const label = requiredString(params, "label");
      const value = typeof params.value === "string" ? params.value : undefined;
      if (value) {
        await impactSelect(ctx.page).selectOption({ value });
        return;
      }
      await selectByVisibleLabel(impactSelect(ctx.page), label);
    },
    selected_label: async ({ ctx, params }) => {
      await expectSelectedLabel(impactSelect(ctx.page), requiredString(params, "label"));
    },
  },
  "feedback_create.submit": {
    enabled: async ({ ctx }) => {
      await expect(submitButton(ctx.page)).toBeEnabled();
    },
  },
} satisfies OperatorRegistry<TestContext, FeedbackContentFillCaseData>;

function topbar(page: Page) {
  return page.locator("header.orf-topbar");
}

function feedbackButton(page: Page) {
  return topbar(page).getByRole("button", { name: "新建反馈" });
}

function createFeedbackForm(page: Page) {
  return page.locator("form#new-feedback-issue-form");
}

function titleInput(page: Page) {
  return createFeedbackForm(page).getByPlaceholder("标题");
}

function descriptionInput(page: Page) {
  return createFeedbackForm(page).getByLabel("描述反馈...");
}

function sidebarSelect(page: Page, label: string) {
  return createFeedbackForm(page).locator(".feedback-create-sidebar-field").filter({ hasText: label }).locator("select");
}

function ownerSelect(page: Page) {
  return sidebarSelect(page, "处理人");
}

function categorySelect(page: Page) {
  return sidebarSelect(page, "分类");
}

function impactSelect(page: Page) {
  return sidebarSelect(page, "影响");
}

function submitButton(page: Page): Locator {
  return createFeedbackForm(page).getByRole("button", { name: "创建 issue" });
}

async function expectSelectedLabel(select: Locator, label: string) {
  await expect(select.locator("option:checked")).toHaveText(label);
}

async function expectSelectedLabelPrefix(select: Locator, label: string) {
  await expect(select.locator("option:checked")).toContainText(label);
}

async function selectByVisibleLabel(select: Locator, label: string) {
  const labels = await optionLabels(select);
  if (!labels.includes(label)) {
    throw new Error(`选择框中不存在选项 "${label}"，实际选项：${labels.join(" / ")}`);
  }
  await select.selectOption({ label });
}

async function selectByVisibleLabelPrefix(select: Locator, labelPrefix: string) {
  const labels = await optionLabels(select);
  const label = labels.find((item) => item === labelPrefix || item.startsWith(`${labelPrefix} [`));
  if (!label) {
    throw new Error(`选择框中不存在以 "${labelPrefix}" 开头的选项，实际选项：${labels.join(" / ")}`);
  }
  await select.selectOption({ label });
}

async function optionLabels(select: Locator) {
  return (await select.locator("option").allTextContents()).map((item) => item.trim());
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
