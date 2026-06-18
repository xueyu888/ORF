import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { SystemMembersEditCaseData, TestContext } from "./_support/members-edit.context";
import { setDefaultLandingPathByEmail, userCountByEmail, userExistsByName } from "./_support/members-edit.helpers";

type EditUserDialogSnapshot = {
  cancelVisible: boolean;
  closeVisible: boolean;
  dialogVisible: boolean;
  emailValidationMessage: string;
  emailValue: string;
  nameValidationMessage: string;
  nameValue: string;
  roleLabel: string;
  saveVisible: boolean;
  titleVisible: boolean;
  toastTexts: string[];
};

export const systemMembersEditOperators = {
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
  "page.member_row_edit": {
    visible: async ({ ctx, params }) => {
      await expect(editButton(ctx.page, requiredString(params, "email"))).toBeVisible();
    },
    enabled: async ({ ctx, params }) => {
      await expect(editButton(ctx.page, requiredString(params, "email"))).toBeEnabled();
    },
    click: async ({ ctx, params }) => {
      await editButton(ctx.page, requiredString(params, "email")).click();
      await expect(editUserDialog(ctx.page)).toBeVisible();
    },
  },
  "page.edit_user_dialog": {
    observe: async ({ ctx }) => {
      await expect(editUserDialog(ctx.page)).toBeVisible();
      return await captureEditUserDialogSnapshot(ctx.page);
    },
    close: async ({ ctx }) => {
      if (!(await editUserDialog(ctx.page).isVisible().catch(() => false))) {
        return;
      }
      await dialogCloseButton(ctx.page).click();
      await expect(editUserDialog(ctx.page)).toHaveCount(0);
    },
    hidden: async ({ ctx }) => {
      await expect(editUserDialog(ctx.page)).toHaveCount(0);
    },
  },
  "page.edit_user_dialog.name": {
    fill: async ({ ctx, params }) => {
      await nameInput(ctx.page).fill(requiredString(params, "value"));
    },
    clear: async ({ ctx }) => {
      await nameInput(ctx.page).fill("");
      await expect(nameInput(ctx.page)).toHaveValue("");
    },
  },
  "page.edit_user_dialog.email": {
    fill: async ({ ctx, params }) => {
      await emailInput(ctx.page).fill(requiredString(params, "value"));
    },
    clear: async ({ ctx }) => {
      await emailInput(ctx.page).fill("");
      await expect(emailInput(ctx.page)).toHaveValue("");
    },
  },
  "page.edit_user_dialog.role": {
    select: async ({ ctx, params }) => {
      await roleSelect(ctx.page).selectOption({ label: requiredString(params, "label") });
    },
  },
  "page.edit_user_dialog.save": {
    click_and_wait_updated: async ({ ctx, params }) => {
      const email = requiredString(params, "email");
      await saveButton(ctx.page).click();
      await expect(editUserDialog(ctx.page)).toHaveCount(0);
      await expect(memberRow(ctx.page, email)).toBeVisible();
    },
    click_invalid_and_snapshot: async ({ ctx }) => {
      await saveButton(ctx.page).click();
      await expect(editUserDialog(ctx.page)).toBeVisible();
      return await captureEditUserDialogSnapshot(ctx.page);
    },
    click_duplicate_and_snapshot: async ({ ctx }) => {
      await saveButton(ctx.page).click();
      await expect(toastCards(ctx.page).filter({ hasText: /邮箱已存在|Email already exists|用户更新失败|Name already exists|已存在/ }).first()).toBeVisible({ timeout: 5_000 });
      return await captureEditUserDialogSnapshot(ctx.page);
    },
  },
  "page.edit_user_dialog.cancel": {
    click: async ({ ctx }) => {
      await cancelButton(ctx.page).click();
      await expect(editUserDialog(ctx.page)).toHaveCount(0);
    },
  },
  "page.edit_user_dialog.close": {
    click: async ({ ctx }) => {
      await dialogCloseButton(ctx.page).click();
      await expect(editUserDialog(ctx.page)).toHaveCount(0);
    },
  },
  "page.edit_user_dialog_snapshot": {
    title_visible: async ({ params }) => {
      expect(editUserDialogSnapshot(params).titleVisible).toBe(true);
    },
    name_value: async ({ params }) => {
      expect(editUserDialogSnapshot(params).nameValue).toBe(requiredString(params, "value"));
    },
    email_value: async ({ params }) => {
      expect(editUserDialogSnapshot(params).emailValue).toBe(requiredString(params, "value"));
    },
    role_value: async ({ params }) => {
      expect(editUserDialogSnapshot(params).roleLabel).toBe(requiredString(params, "label"));
    },
    dialog_visible: async ({ params }) => {
      expect(editUserDialogSnapshot(params).dialogVisible).toBe(true);
    },
    field_invalid: async ({ params }) => {
      const snapshot = editUserDialogSnapshot(params);
      const field = requiredString(params, "field");
      const message = field === "name" ? snapshot.nameValidationMessage : snapshot.emailValidationMessage;
      expect(message.trim().length).toBeGreaterThan(0);
    },
    duplicate_email_error: async ({ params }) => {
      const text = editUserDialogSnapshot(params).toastTexts.join("\n");
      expect(text).toMatch(/邮箱已存在|Email already exists|用户更新失败|Name already exists|已存在/);
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
} satisfies OperatorRegistry<TestContext, SystemMembersEditCaseData>;

function editUserDialog(page: Page) {
  return page.getByRole("dialog", { name: "编辑用户" });
}

function membersTable(page: Page) {
  return page.locator("table.orf-user-table");
}

function memberRow(page: Page, email: string) {
  return membersTable(page).locator("tbody tr", { hasText: email });
}

function editButton(page: Page, email: string) {
  return memberRow(page, email).getByRole("button", { name: "编辑", exact: true });
}

function nameInput(page: Page) {
  return editUserDialog(page).locator("label").filter({ hasText: "姓名" }).locator("input");
}

function emailInput(page: Page) {
  return editUserDialog(page).locator("label").filter({ hasText: "邮箱" }).locator("input");
}

function roleSelect(page: Page) {
  return editUserDialog(page).locator("label").filter({ hasText: "角色" }).locator("select");
}

function cancelButton(page: Page) {
  return editUserDialog(page).getByRole("button", { name: "取消", exact: true });
}

function saveButton(page: Page) {
  return editUserDialog(page).getByRole("button", { name: "保存", exact: true });
}

function dialogCloseButton(page: Page) {
  return editUserDialog(page).getByRole("button", { name: "关闭", exact: true });
}

function toastCards(page: Page) {
  return page.locator(".orf-toast-card");
}

async function captureEditUserDialogSnapshot(page: Page): Promise<EditUserDialogSnapshot> {
  const dialog = editUserDialog(page);
  const isDialogVisible = await dialog.isVisible().catch(() => false);
  return {
    cancelVisible: isDialogVisible ? await cancelButton(page).isVisible() : false,
    closeVisible: isDialogVisible ? await dialogCloseButton(page).isVisible() : false,
    dialogVisible: isDialogVisible,
    emailValidationMessage: isDialogVisible ? await inputValidationMessage(emailInput(page)) : "",
    emailValue: isDialogVisible ? await emailInput(page).inputValue() : "",
    nameValidationMessage: isDialogVisible ? await inputValidationMessage(nameInput(page)) : "",
    nameValue: isDialogVisible ? await nameInput(page).inputValue() : "",
    roleLabel: isDialogVisible ? await selectedRoleLabel(page) : "",
    saveVisible: isDialogVisible ? await saveButton(page).isVisible() : false,
    titleVisible: await page.getByRole("heading", { name: "编辑用户", exact: true }).isVisible().catch(() => false),
    toastTexts: await toastCards(page).evaluateAll((cards) => cards.map((card) => card.textContent?.trim() ?? "").filter(Boolean)),
  };
}

async function selectedRoleLabel(page: Page) {
  return await roleSelect(page).evaluate((select) => {
    if (!(select instanceof HTMLSelectElement)) {
      return "";
    }
    return select.selectedOptions[0]?.textContent?.trim() ?? "";
  });
}

async function inputValidationMessage(locator: ReturnType<Page["locator"]>) {
  return await locator.evaluate((input) => (input instanceof HTMLInputElement ? input.validationMessage : ""));
}

function editUserDialogSnapshot(params: Record<string, unknown>): EditUserDialogSnapshot {
  const snapshot = params.snapshot;
  if (!snapshot || typeof snapshot !== "object" || !("dialogVisible" in snapshot)) {
    throw new Error("参数 snapshot 必须包含编辑用户弹窗快照");
  }

  return snapshot as EditUserDialogSnapshot;
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
