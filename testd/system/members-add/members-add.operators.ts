import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { SystemMembersAddCaseData, TestContext } from "./_support/members-add.context";
import { setDefaultLandingPathByEmail, userCountByEmail, userExistsByName } from "./_support/members-add.helpers";

type AddUserDialogSnapshot = {
  cancelVisible: boolean;
  closeVisible: boolean;
  dialogVisible: boolean;
  emailValidationMessage: string;
  emailVisible: boolean;
  nameValidationMessage: string;
  nameVisible: boolean;
  roleVisible: boolean;
  submitVisible: boolean;
  titleVisible: boolean;
  toastTexts: string[];
};

export const systemMembersAddOperators = {
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
  "page.members_add_button": {
    visible: async ({ ctx }) => {
      await expect(addUserButton(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(addUserButton(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx }) => {
      await addUserButton(ctx.page).click();
      await expect(addUserDialog(ctx.page)).toBeVisible();
    },
  },
  "page.members_list": {
    contains_user: async ({ ctx, params }) => {
      const row = memberRow(ctx.page, requiredString(params, "email"));
      await expect(row).toBeVisible();
      await expect(row).toContainText(requiredString(params, "name"));
    },
    lacks_user: async ({ ctx, params }) => {
      await expect(memberRow(ctx.page, requiredString(params, "email"))).toHaveCount(0);
    },
  },
  "page.add_user_dialog": {
    observe: async ({ ctx }) => {
      await expect(addUserDialog(ctx.page)).toBeVisible();
      return await captureAddUserDialogSnapshot(ctx.page);
    },
    close: async ({ ctx }) => {
      if (!(await addUserDialog(ctx.page).isVisible().catch(() => false))) {
        return;
      }
      await dialogCloseButton(ctx.page).click();
      await expect(addUserDialog(ctx.page)).toHaveCount(0);
    },
    hidden: async ({ ctx }) => {
      await expect(addUserDialog(ctx.page)).toHaveCount(0);
    },
  },
  "page.add_user_dialog.name": {
    fill: async ({ ctx, params }) => {
      await nameInput(ctx.page).fill(requiredString(params, "value"));
    },
    keep_empty: async ({ ctx }) => {
      await nameInput(ctx.page).fill("");
      await expect(nameInput(ctx.page)).toHaveValue("");
    },
  },
  "page.add_user_dialog.email": {
    fill: async ({ ctx, params }) => {
      await emailInput(ctx.page).fill(requiredString(params, "value"));
    },
    keep_empty: async ({ ctx }) => {
      await emailInput(ctx.page).fill("");
      await expect(emailInput(ctx.page)).toHaveValue("");
    },
  },
  "page.add_user_dialog.role": {
    select: async ({ ctx, params }) => {
      await roleSelect(ctx.page).selectOption({ label: requiredString(params, "label") });
    },
  },
  "page.add_user_dialog.submit": {
    click_and_wait_created: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      await submitButton(ctx.page).click();
      await expect(addUserDialog(ctx.page)).toHaveCount(0);
      await expect(memberRow(ctx.page, email)).toBeVisible();
    },
    click_invalid_and_snapshot: async ({ ctx }) => {
      await submitButton(ctx.page).click();
      await expect(addUserDialog(ctx.page)).toBeVisible();
      return await captureAddUserDialogSnapshot(ctx.page);
    },
    click_duplicate_and_snapshot: async ({ ctx }) => {
      await submitButton(ctx.page).click();
      await ctx.page.waitForTimeout(500);
      return await captureAddUserDialogSnapshot(ctx.page);
    },
  },
  "page.add_user_dialog.cancel": {
    click: async ({ ctx }) => {
      await cancelButton(ctx.page).click();
      await expect(addUserDialog(ctx.page)).toHaveCount(0);
    },
  },
  "page.add_user_dialog.close": {
    click: async ({ ctx }) => {
      await dialogCloseButton(ctx.page).click();
      await expect(addUserDialog(ctx.page)).toHaveCount(0);
    },
  },
  "page.add_user_dialog_snapshot": {
    title_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).titleVisible).toBe(true);
    },
    name_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).nameVisible).toBe(true);
    },
    email_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).emailVisible).toBe(true);
    },
    role_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).roleVisible).toBe(true);
    },
    cancel_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).cancelVisible).toBe(true);
    },
    close_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).closeVisible).toBe(true);
    },
    submit_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).submitVisible).toBe(true);
    },
    dialog_visible: async ({ params }) => {
      expect(addUserDialogSnapshot(params).dialogVisible).toBe(true);
    },
    field_invalid: async ({ params }) => {
      const snapshot = addUserDialogSnapshot(params);
      const field = requiredString(params, "field");
      const message = field === "name" ? snapshot.nameValidationMessage : snapshot.emailValidationMessage;
      expect(message.trim().length).toBeGreaterThan(0);
    },
    duplicate_email_error: async ({ params }) => {
      const text = addUserDialogSnapshot(params).toastTexts.join("\n");
      expect(text).toMatch(/邮箱已存在|Email already exists|用户添加失败|Name already exists|已存在/);
    },
  },
  "db.user_email": {
    count: async ({ params }) => {
      await expect.poll(() => userCountByEmail(requiredString(params, "email"))).toBe(requiredNumber(params, "expected"));
    },
  },
  "db.user_name": {
    absent: async ({ params }) => {
      await expect.poll(() => userExistsByName(requiredString(params, "name"))).toBe(false);
    },
  },
} satisfies OperatorRegistry<TestContext, SystemMembersAddCaseData>;

function addUserButton(page: Page) {
  return page.getByRole("button", { name: "新增用户", exact: true });
}

function addUserDialog(page: Page) {
  return page.getByRole("dialog", { name: "新增用户" });
}

function nameInput(page: Page) {
  return addUserDialog(page).locator("label").filter({ hasText: "姓名" }).locator("input");
}

function emailInput(page: Page) {
  return addUserDialog(page).locator("label").filter({ hasText: "邮箱" }).locator("input");
}

function roleSelect(page: Page) {
  return addUserDialog(page).locator("label").filter({ hasText: "角色" }).locator("select");
}

function cancelButton(page: Page) {
  return addUserDialog(page).getByRole("button", { name: "取消", exact: true });
}

function submitButton(page: Page) {
  return addUserDialog(page).getByRole("button", { name: "新增用户", exact: true });
}

function dialogCloseButton(page: Page) {
  return addUserDialog(page).getByRole("button", { name: "关闭", exact: true });
}

function membersTable(page: Page) {
  return page.locator("table.orf-user-table");
}

function memberRow(page: Page, email: string) {
  return membersTable(page).locator("tbody tr", { hasText: email });
}

function toastCards(page: Page) {
  return page.locator(".orf-toast-card");
}

async function captureAddUserDialogSnapshot(page: Page): Promise<AddUserDialogSnapshot> {
  const dialog = addUserDialog(page);
  const isDialogVisible = await dialog.isVisible().catch(() => false);
  return {
    cancelVisible: isDialogVisible ? await cancelButton(page).isVisible() : false,
    closeVisible: isDialogVisible ? await dialogCloseButton(page).isVisible() : false,
    dialogVisible: isDialogVisible,
    emailValidationMessage: isDialogVisible ? await inputValidationMessage(emailInput(page)) : "",
    emailVisible: isDialogVisible ? await emailInput(page).isVisible() : false,
    nameValidationMessage: isDialogVisible ? await inputValidationMessage(nameInput(page)) : "",
    nameVisible: isDialogVisible ? await nameInput(page).isVisible() : false,
    roleVisible: isDialogVisible ? await roleSelect(page).isVisible() : false,
    submitVisible: isDialogVisible ? await submitButton(page).isVisible() : false,
    titleVisible: await page.getByRole("heading", { name: "新增用户", exact: true }).isVisible().catch(() => false),
    toastTexts: await toastCards(page).evaluateAll((cards) => cards.map((card) => card.textContent?.trim() ?? "").filter(Boolean)),
  };
}

async function inputValidationMessage(locator: ReturnType<Page["locator"]>) {
  return await locator.evaluate((input) => (input instanceof HTMLInputElement ? input.validationMessage : ""));
}

function addUserDialogSnapshot(params: Record<string, unknown>): AddUserDialogSnapshot {
  const snapshot = params.snapshot;
  if (!snapshot || typeof snapshot !== "object" || !("dialogVisible" in snapshot)) {
    throw new Error("参数 snapshot 必须包含新增用户弹窗快照");
  }

  return snapshot as AddUserDialogSnapshot;
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
