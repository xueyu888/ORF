import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type { CapturedResponse } from "../../_operators/common.context";
import type { AdminEditMemberCaseData, EditableMemberRecord, TestContext } from "./_support/admin-edit-member.context";
import {
  adminAccountActive,
  captureUserUpdateResponse,
  createEditableMember,
  deleteEditableMember,
  editableMemberOriginal,
  editableMemberUpdated,
  testMemberAbsent,
} from "./_support/admin-edit-member.helpers";

export const adminEditMemberOperators = {
  "db.admin": {
    active: async ({ params }) => {
      await expect.poll(() => adminAccountActive(requiredString(params, "email"))).toBe(true);
    },
  },

  "db.editable_member": {
    absent: async ({ data }) => {
      await expect.poll(() => testMemberAbsent(data)).toBe(true);
    },

    create: async ({ data }) => {
      return createEditableMember(data);
    },

    original: async ({ data }) => {
      await expect.poll(() => editableMemberOriginal(data)).toBe(true);
    },

    updated: async ({ data }) => {
      await expect.poll(() => editableMemberUpdated(data)).toBe(true);
    },

    delete: async ({ data }) => {
      await deleteEditableMember(data);
    },
  },

  "api.user_update": {
    capture: async ({ ctx, runtime, params }) => {
      runtime.values[requiredString(params, "saveAs")] = captureUserUpdateResponse(ctx.page, requiredEditableMember(params, "member"));
    },
  },

  "api.response": {
    ok: async ({ params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    },
  },

  "page.member_row": {
    visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text"))).toBeVisible();
    },

    absent: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text"))).toHaveCount(0);
    },

    edit_visible: async ({ ctx, params }) => {
      await expect(memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "编辑" })).toBeVisible();
    },

    edit: async ({ ctx, params }) => {
      await memberRow(ctx, requiredString(params, "text")).getByRole("button", { name: "编辑" }).click();
    },
  },

  "page.member_dialog": {
    visible: async ({ ctx }) => {
      await expect(memberDialog(ctx)).toBeVisible();
    },

    fill_name: async ({ ctx, params }) => {
      await memberDialog(ctx).getByLabel("姓名").fill(requiredString(params, "value"));
    },

    fill_email: async ({ ctx, params }) => {
      await memberDialog(ctx).getByLabel("邮箱").fill(requiredString(params, "value"));
    },

    select_role: async ({ ctx, params }) => {
      await memberDialog(ctx).getByLabel("角色").selectOption(requiredString(params, "role"));
    },

    submit: async ({ ctx }) => {
      await memberDialog(ctx).getByRole("button", { name: "保存" }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, AdminEditMemberCaseData>;

function memberRow(ctx: TestContext, text: string) {
  return ctx.page.locator(".orf-user-table").getByRole("row").filter({ hasText: text });
}

function memberDialog(ctx: TestContext) {
  return ctx.page.getByRole("dialog", { name: "编辑用户" });
}

function requiredEditableMember(params: StepParams, key: string): EditableMemberRecord {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as EditableMemberRecord).id !== "string" ||
    typeof (value as EditableMemberRecord).teamId !== "string" ||
    typeof (value as EditableMemberRecord).name !== "string" ||
    typeof (value as EditableMemberRecord).email !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是可编辑成员记录`);
  }

  return value as EditableMemberRecord;
}

async function requiredCapturedResponse(params: StepParams, key: string): Promise<CapturedResponse> {
  const value = await params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as CapturedResponse).ok !== "boolean" ||
    typeof (value as CapturedResponse).status !== "number"
  ) {
    throw new Error(`参数 ${key} 必须是捕获到的接口响应`);
  }

  return value as CapturedResponse;
}
