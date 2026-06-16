import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { CreateObjectiveRoleControlCaseData, TestContext } from "./_support/create-objective-role-control.context";
import { setDefaultLandingPathByEmail } from "./_support/create-objective-role-control.helpers";

type ToastSnapshot = {
  text: string;
  visible: boolean;
};

type ObjectiveListSnapshot = {
  title: string;
  visible: boolean;
};

export const createObjectiveRoleControlOperators = {
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
  "topbar.objective": {
    visible: async ({ ctx }) => {
      await expect(objectiveButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(objectiveButton(ctx.page)).toBeEnabled();
    },
    hidden: async ({ ctx }) => {
      await expect(objectiveButton(ctx.page)).toHaveCount(0);
    },
    click: async ({ ctx }) => {
      await objectiveButton(ctx.page).click();
      await expect(ctx.page).toHaveURL(/\/tasks/);
      await expect(objectiveTitleInput(ctx.page)).toBeVisible();
    },
  },
  "objective_create.title_input": {
    fill: async ({ ctx, params }) => {
      await objectiveTitleInput(ctx.page).fill(requiredString(params, "value"));
    },
    submit: async ({ ctx, params }) => {
      const expectedTitle = optionalString(params, "expectedTitle");
      await objectiveTitleInput(ctx.page).press("Enter");
      if (expectedTitle) {
        const row = objectiveRow(ctx.page, expectedTitle);
        await expect(row).toBeVisible();
        return {
          title: expectedTitle,
          visible: await row.isVisible(),
        } satisfies ObjectiveListSnapshot;
      }

      const expectedToast = optionalString(params, "expectedToast");
      if (expectedToast) {
        const toast = toastByText(ctx.page, expectedToast);
        await expect(toast).toBeVisible();
        return {
          text: expectedToast,
          visible: await toast.isVisible(),
        } satisfies ToastSnapshot;
      }

      return undefined;
    },
  },
  "objective_create.draft": {
    cancel: async ({ ctx }) => {
      const input = objectiveTitleInput(ctx.page);
      await input.focus();
      await input.press("Escape");
      await expect(objectiveTitleInput(ctx.page)).toHaveCount(0);
    },
  },
  "challenge.objective_list_snapshot": {
    visible: async ({ params }) => {
      const snapshot = objectiveListSnapshot(params);
      expect(snapshot.visible).toBe(true);
    },
  },
  "toast_snapshot": {
    visible: async ({ params }) => {
      const snapshot = toastSnapshot(params);
      expect(snapshot.visible).toBe(true);
      expect(snapshot.text).toBe(requiredString(params, "text"));
    },
  },
} satisfies OperatorRegistry<TestContext, CreateObjectiveRoleControlCaseData>;

function topbar(page: Page) {
  return page.locator("header.orf-topbar");
}

function objectiveButton(page: Page) {
  return topbar(page).getByRole("button", { name: "新建目标" });
}

function objectiveTitleInput(page: Page) {
  return page.getByLabel("编辑目标标题");
}

function objectiveRow(page: Page, title: string) {
  return page.locator(".orf-challenge-row-objective").filter({ hasText: title }).first();
}

function toastByText(page: Page, text: string) {
  return page.getByText(text, { exact: true });
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
    typeof (snapshot as Partial<ToastSnapshot>).visible !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含 text 和 visible");
  }
  return snapshot as ToastSnapshot;
}

function objectiveListSnapshot(params: Record<string, unknown>): ObjectiveListSnapshot {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<ObjectiveListSnapshot>).title !== "string" ||
    typeof (snapshot as Partial<ObjectiveListSnapshot>).visible !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含 title 和 visible");
  }
  return snapshot as ObjectiveListSnapshot;
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
