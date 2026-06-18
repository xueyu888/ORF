import { expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { FeedbackImageUploadCaseData, TestContext } from "./_support/feedback-image-upload.context";
import { setDefaultLandingPathByEmail } from "./_support/feedback-image-upload.helpers";

export const feedbackImageUploadOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "mock.feedback_file": {
    prepare_image: async ({ params, runtime }) => {
      const fileName = requiredString(params, "fileName");
      const filePath = await writeFixtureFile(fileName, Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));
      runtime.values[requiredString(params, "saveAs")] = { path: filePath, fileName };
    },
    prepare_text_attachment: async ({ params, runtime }) => {
      const fileName = requiredString(params, "fileName");
      const filePath = await writeFixtureFile(fileName, "this is not an image file\n");
      runtime.values[requiredString(params, "saveAs")] = { path: filePath, fileName };
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
  "feedback_create.description_input": {
    empty: async ({ ctx }) => {
      await expect(descriptionInput(ctx.page)).toHaveValue("");
    },
    contains_image_reference: async ({ ctx, params }) => {
      const fileName = requiredString(params, "fileName");
      await expect(descriptionInput(ctx.page)).toHaveValue(new RegExp(`!\\[${escapeRegExp(fileName)}\\]\\(orf-pending-attachment:`));
    },
    contains_attachment_reference: async ({ ctx, params }) => {
      const fileName = requiredString(params, "fileName");
      await expect(descriptionInput(ctx.page)).toHaveValue(new RegExp(`!\\[${escapeRegExp(fileName)}\\]\\(orf-pending-attachment:`));
    },
    not_contains_file_reference: async ({ ctx, params }) => {
      await expect(descriptionInput(ctx.page)).not.toHaveValue(new RegExp(escapeRegExp(requiredString(params, "fileName"))));
    },
  },
  "feedback_create.add_image": {
    enabled: async ({ ctx }) => {
      await expect(addImageButton(ctx.page)).toBeEnabled();
    },
    choose: async ({ ctx, params }) => {
      await addImageFileInput(ctx.page).setInputFiles(requiredString(params, "filePath"));
    },
  },
  "feedback_create.pending_attachments": {
    contains_file: async ({ ctx, params }) => {
      await expect(pendingAttachmentStrip(ctx.page).getByText(requiredString(params, "fileName"))).toBeVisible();
    },
  },
  "feedback_create.upload_error": {
    hidden: async ({ ctx, params }) => {
      await expect(createFeedbackForm(ctx.page).getByText(requiredString(params, "message"))).toBeHidden();
    },
    visible: async ({ ctx, params }) => {
      await expect(createFeedbackForm(ctx.page).getByText(requiredString(params, "message"))).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, FeedbackImageUploadCaseData>;

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function writeFixtureFile(fileName: string, content: Buffer | string) {
  const dir = path.join(process.cwd(), ".artifacts", "testd", "feedback-image-upload");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, content);
  return filePath;
}

function topbar(page: Page) {
  return page.locator("header.orf-topbar");
}

function feedbackButton(page: Page) {
  return topbar(page).getByRole("button", { name: "新建反馈" });
}

function createFeedbackForm(page: Page) {
  return page.locator("form#new-feedback-issue-form");
}

function descriptionInput(page: Page) {
  return createFeedbackForm(page).getByLabel("描述反馈...");
}

function addImageButton(page: Page) {
  return createFeedbackForm(page).getByRole("button", { name: "添加附件" });
}

function addImageFileInput(page: Page) {
  return createFeedbackForm(page).locator('input[type="file"]');
}

function pendingAttachmentStrip(page: Page) {
  return createFeedbackForm(page).locator(".feedback-create-attachment-strip");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
