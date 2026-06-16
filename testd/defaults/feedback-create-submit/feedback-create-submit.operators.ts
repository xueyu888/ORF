import { expect, type Locator, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { FeedbackCreateSubmitCaseData, TestContext } from "./_support/feedback-create-submit.context";
import {
  deleteFeedbackByPhenomenon,
  feedbackExistsByPhenomenon,
  setDefaultLandingPathByEmail,
} from "./_support/feedback-create-submit.helpers";

type ToastSnapshot = {
  text: string;
  url: string;
  visible: boolean;
};

export const feedbackCreateSubmitOperators = {
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
  "db.feedback": {
    delete_by_phenomenon: async ({ params }) => {
      await deleteFeedbackByPhenomenon(requiredString(params, "phenomenon"));
    },
    exists: async ({ params }) => {
      await expect.poll(() => feedbackExistsByPhenomenon(requiredString(params, "phenomenon"))).toBe(true);
    },
    absent: async ({ params }) => {
      await expect.poll(() => feedbackExistsByPhenomenon(requiredString(params, "phenomenon"))).toBe(false);
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
  },
  "feedback_create.description_input": {
    empty: async ({ ctx }) => {
      await expect(descriptionInput(ctx.page)).toHaveValue("");
    },
    fill: async ({ ctx, params }) => {
      await descriptionInput(ctx.page).fill(requiredString(params, "value"));
    },
  },
  "feedback_create.owner_select": {
    selected_label: async ({ ctx, params }) => {
      await expectSelectedLabelPrefix(ownerSelect(ctx.page), requiredString(params, "label"));
    },
    select: async ({ ctx, params }) => {
      await selectByVisibleLabelPrefix(ownerSelect(ctx.page), requiredString(params, "label"));
    },
  },
  "feedback_create.category_select": {
    selected_label: async ({ ctx, params }) => {
      await expectSelectedLabel(categorySelect(ctx.page), requiredString(params, "label"));
    },
    select: async ({ ctx, params }) => {
      await selectByVisibleLabel(categorySelect(ctx.page), requiredString(params, "label"));
    },
  },
  "feedback_create.impact_select": {
    selected_label: async ({ ctx, params }) => {
      await expectSelectedLabel(impactSelect(ctx.page), requiredString(params, "label"));
    },
    select: async ({ ctx, params }) => {
      const value = typeof params.value === "string" ? params.value : undefined;
      if (value) {
        await impactSelect(ctx.page).selectOption({ value });
        return;
      }
      await selectByVisibleLabel(impactSelect(ctx.page), requiredString(params, "label"));
    },
  },
  "feedback_create.submit": {
    enabled: async ({ ctx }) => {
      await expect(submitButton(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx, params }) => {
      const expectedToast = optionalString(params, "expectedToast");
      const expectedUrlPattern = optionalString(params, "expectNavigateTo");

      if (expectedUrlPattern) {
        await Promise.all([
          ctx.page.waitForURL(new RegExp(expectedUrlPattern)),
          submitButton(ctx.page).click(),
        ]);
        return undefined;
      }

      await submitButton(ctx.page).click();
      if (expectedToast) {
        const toast = toastByText(ctx.page, expectedToast);
        await expect(toast).toBeVisible();
        return { text: expectedToast, url: ctx.page.url(), visible: await toast.isVisible() } satisfies ToastSnapshot;
      }
      return undefined;
    },
  },
  "toast_snapshot": {
    visible: async ({ params }) => {
      const snapshot = toastSnapshot(params);
      expect(snapshot.visible).toBe(true);
      expect(snapshot.text).toBe(requiredString(params, "text"));
    },
  },
  "page_snapshot": {
    url_matches: async ({ params }) => {
      const snapshot = toastSnapshot(params);
      expect(snapshot.url).toMatch(new RegExp(requiredString(params, "pattern")));
    },
  },
  "feedback_issue_detail.page": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "pattern")));
      await expect(ctx.page.locator(".feedback-issue-detail-page")).toBeVisible();
    },
  },
  "feedback_issue_detail.title": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page.locator(".feedback-issue-detail-title-block h2")).toHaveText(requiredString(params, "value"));
    },
  },
  "feedback_issue_detail.description": {
    visible: async ({ ctx, params }) => {
      await expect(ctx.page.locator(".feedback-issue-original-card")).toContainText(requiredString(params, "value"));
    },
  },
  "feedback_issue_detail.category": {
    visible: async ({ ctx, params }) => {
      await expect(sidebarBlock(ctx.page, "分类")).toContainText(requiredString(params, "label"));
    },
  },
  "feedback_issue_detail.impact": {
    visible: async ({ ctx, params }) => {
      await expect(sidebarBlock(ctx.page, "影响")).toContainText(requiredString(params, "label"));
    },
  },
} satisfies OperatorRegistry<TestContext, FeedbackCreateSubmitCaseData>;

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

function toastByText(page: Page, text: string) {
  return page.getByText(text, { exact: true });
}

function sidebarBlock(page: Page, label: string) {
  return page.locator(".feedback-issue-sidebar-block").filter({ hasText: label });
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

function optionalString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function toastSnapshot(params: Record<string, unknown>): ToastSnapshot {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<ToastSnapshot>).text !== "string" ||
    typeof (snapshot as Partial<ToastSnapshot>).url !== "string" ||
    typeof (snapshot as Partial<ToastSnapshot>).visible !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含 text、url 和 visible");
  }
  return snapshot as ToastSnapshot;
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
