import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type { MemberNewCategoryForbiddenCaseData, TestContext } from "./_support/member-new-category-forbidden.context";
import {
  apiMyDayContainsBodyMarker,
  dbWorkLogCategoryByName,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForTodayByMemberAndCategory,
  dbWorkLogEntryForTodayByMemberAndMarker,
  deleteWorkLogCategoriesByName,
  deleteWorkLogsByBodyMarker,
  loginAsMember,
  newCategoryNameInput,
  openWorkLogClassification,
  openWorkLogTodayView,
  readSessionUserName,
  requiredWorkLogSaveResult,
  searchWorkLogClassification,
  submitNewCategoryWorkLogByApi,
  submitWorkLogButton,
  workLogCategoriesContain,
  workLogClassificationControl,
  workLogClassificationOption,
  workLogEditorPanel,
  workLogViewTab,
} from "./_support/member-new-category-forbidden.helpers";

export const memberNewCategoryForbiddenOperators:
  OperatorRegistry<TestContext, MemberNewCategoryForbiddenCaseData> = {
    "page.auth": {
      login: async ({ ctx, params }) => {
        await loginAsMember(ctx.page, {
          email: requiredString(params, "email"),
          password: requiredString(params, "password"),
        });
      },
    },

    "page.work_logs": {
      open_today: async ({ ctx }) => {
        await openWorkLogTodayView(ctx.page);
      },

      visible: async ({ ctx }) => {
        await expect(ctx.page).toHaveURL(/\/work-logs(?:[?#].*)?$/);
      },
    },

    "page.work_logs.view_tab": {
      selected: async ({ ctx, params }) => {
        await expect(workLogViewTab(ctx.page, requiredString(params, "label"))).toHaveAttribute("aria-selected", "true");
      },
    },

    "page.work_logs.editor_panel": {
      visible: async ({ ctx }) => {
        await expect(workLogEditorPanel(ctx.page)).toBeVisible();
      },
    },

    "page.work_logs.classification": {
      visible: async ({ ctx }) => {
        await expect(workLogClassificationControl(ctx.page)).toBeVisible();
      },

      open: async ({ ctx }) => {
        await openWorkLogClassification(ctx.page);
      },

      search: async ({ ctx, params }) => {
        await searchWorkLogClassification(ctx.page, requiredString(params, "query"));
      },

      search_result_not_visible: async ({ ctx, params }) => {
        await expect(workLogClassificationOption(ctx.page, requiredString(params, "categoryName"))).toHaveCount(0);
      },

      create_action_not_visible: async ({ ctx, params }) => {
        await expect(workLogClassificationOption(ctx.page, requiredString(params, "label"))).toHaveCount(0);
      },
    },

    "page.work_logs.new_category_name_input": {
      hidden: async ({ ctx }) => {
        await expect(newCategoryNameInput(ctx.page)).toHaveCount(0);
      },
    },

    "page.work_logs.submit_action": {
      disabled: async ({ ctx }) => {
        await expect(submitWorkLogButton(ctx.page)).toBeDisabled();
      },
    },

    "auth.session.user_name": {
      equals: async ({ ctx, params }) => {
        await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
      },
    },

    "api.work_log.categories": {
      contains_built_in: async ({ ctx, params }) => {
        await expect.poll(() => workLogCategoriesContain(ctx.page, requiredString(params, "name"))).toBe(true);
      },

      not_contains: async ({ ctx, params }) => {
        await expect.poll(() => workLogCategoriesContain(ctx.page, requiredString(params, "name"))).toBe(false);
      },
    },

    "api.work_log.my_day": {
      not_contains_body_marker: async ({ ctx, params }) => {
        await expect.poll(() => apiMyDayContainsBodyMarker(ctx.page, requiredString(params, "bodyMarker"))).toBe(false);
      },

      submit_new_category: async ({ ctx, params }) =>
        submitNewCategoryWorkLogByApi(ctx.page, {
          categoryName: requiredString(params, "categoryName"),
          bodyMarkdown: requiredString(params, "bodyMarkdown"),
        }),
    },

    "api.work_log.save_result": {
      status: async ({ params }) => {
        const result = requiredWorkLogSaveResult(params.result);
        expect(result.status).toBe(params.value);
      },

      error_message: async ({ params }) => {
        const result = requiredWorkLogSaveResult(params.result);
        const body = result.body;
        const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : null;
        expect(error).toBe(requiredString(params, "value"));
      },
    },

    "db.work_log_category": {
      delete_by_name: async ({ params }) => {
        await deleteWorkLogCategoriesByName(requiredString(params, "categoryName"));
      },

      absent_by_name: async ({ params }) => {
        await expect.poll(() => dbWorkLogCategoryByName(requiredString(params, "categoryName"))).toBeNull();
      },
    },

    "db.work_log_entry": {
      delete_by_body_marker: async ({ params }) => {
        await deleteWorkLogsByBodyMarker(requiredString(params, "bodyMarker"));
      },

      absent_by_body_marker: async ({ params }) => {
        await expect.poll(() => dbWorkLogEntryByBodyMarker(requiredString(params, "bodyMarker"))).toBeNull();
      },

      absent_today_for_member_by_marker: async ({ params }) => {
        await expect
          .poll(() =>
            dbWorkLogEntryForTodayByMemberAndMarker({
              bodyMarker: requiredString(params, "bodyMarker"),
              memberEmail: requiredString(params, "memberEmail"),
            }),
          )
          .toBeNull();
      },

      absent_today_for_member_by_category: async ({ params }) => {
        await expect
          .poll(() =>
            dbWorkLogEntryForTodayByMemberAndCategory({
              categoryName: requiredString(params, "categoryName"),
              memberEmail: requiredString(params, "memberEmail"),
            }),
          )
          .toBeNull();
      },
    },
  };
