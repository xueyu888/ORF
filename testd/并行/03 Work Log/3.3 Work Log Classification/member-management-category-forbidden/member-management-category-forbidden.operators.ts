import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type { MemberManagementCategoryForbiddenCaseData, TestContext } from "./_support/member-management-category-forbidden.context";
import {
  apiMyDayContainsBodyMarker,
  dbWorkLogCategoryById,
  dbWorkLogCategoryByNameAndTeam,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForTodayByMemberAndCategory,
  dbWorkLogEntryForTodayByMemberAndMarker,
  deleteWorkLogCategoryByFixture,
  deleteWorkLogsByBodyMarker,
  loginAsMember,
  openWorkLogClassification,
  openWorkLogTodayView,
  prepareManagementWorkLogCategory,
  readSessionUserName,
  requiredWorkLogSaveResult,
  searchWorkLogClassification,
  submitManagementCategoryWorkLogByApi,
  submitWorkLogButton,
  workLogCategoriesContain,
  workLogClassificationControl,
  workLogClassificationOption,
  workLogEditorPanel,
  workLogViewTab,
} from "./_support/member-management-category-forbidden.helpers";

export const memberManagementCategoryForbiddenOperators:
  OperatorRegistry<TestContext, MemberManagementCategoryForbiddenCaseData> = {
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

      not_displays_category: async ({ ctx, params }) => {
        await expect(workLogClassificationControl(ctx.page)).not.toContainText(requiredString(params, "categoryName"));
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
      not_contains: async ({ ctx, params }) => {
        await expect.poll(() => workLogCategoriesContain(ctx.page, requiredString(params, "name"))).toBe(false);
      },

      contains_built_in: async ({ ctx, params }) => {
        await expect.poll(() => workLogCategoriesContain(ctx.page, requiredString(params, "name"))).toBe(true);
      },
    },

    "api.work_log.my_day": {
      not_contains_body_marker: async ({ ctx, params }) => {
        await expect.poll(() => apiMyDayContainsBodyMarker(ctx.page, requiredString(params, "bodyMarker"))).toBe(false);
      },

      submit_management_category: async ({ ctx, params }) =>
        submitManagementCategoryWorkLogByApi(ctx.page, {
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
      upsert_management: async ({ params }) =>
        prepareManagementWorkLogCategory({
          categoryName: requiredString(params, "categoryName"),
          createdByUserId: requiredString(params, "createdByUserId"),
          teamId: requiredString(params, "teamId"),
        }),

      exists_in_team: async ({ params }) => {
        await expect
          .poll(() =>
            dbWorkLogCategoryByNameAndTeam({
              categoryName: requiredString(params, "categoryName"),
              teamId: requiredString(params, "teamId"),
            }),
          )
          .not.toBeNull();
      },

      exists_by_fixture: async ({ params }) => {
        await expect.poll(() => dbWorkLogCategoryById(params.category)).not.toBeNull();
      },

      delete_by_fixture: async ({ params }) => {
        if (params.category !== undefined) {
          await deleteWorkLogCategoryByFixture(params.category);
        }
      },

      absent_by_fixture: async ({ params }) => {
        if (params.category === undefined) {
          return;
        }
        await expect.poll(() => dbWorkLogCategoryById(params.category)).toBeNull();
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
