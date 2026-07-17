import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AdminManagementAffairsCategorySubmitWorkLogCaseData,
  TestContext,
  WorkLogEntryFixture,
} from "./_support/admin-management-affairs-category-submit-work-log.context";
import {
  apiMyDayContainsBodyMarker,
  apiMyDayEntryFieldEquals,
  dbWorkLogCategoryById,
  dbWorkLogCategoryByNameAndTeam,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForTodayByAdminAndMarker,
  deleteWorkLogCategoryByFixture,
  deleteWorkLogsByBodyMarker,
  loginAsAdmin,
  openWorkLogTodayView,
  prepareManagementWorkLogCategory,
  readSessionUserName,
  requiredWorkLogEntry,
  selectWorkLogCategory,
  submitTodayWorkLog,
  submitWorkLogButton,
  workLogCategoriesContain,
  workLogCategorySourceEquals,
  workLogClassificationControl,
  workLogEditorPanel,
  workLogHistoryEntry,
  workLogToast,
  workLogViewTab,
} from "./_support/admin-management-affairs-category-submit-work-log.helpers";

export const adminManagementAffairsCategorySubmitWorkLogOperators:
  OperatorRegistry<TestContext, AdminManagementAffairsCategorySubmitWorkLogCaseData> = {
    "page.auth": {
      login: async ({ ctx, params }) => {
        await loginAsAdmin(ctx.page, {
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

      select_category: async ({ ctx, params }) => {
        await selectWorkLogCategory(ctx.page, requiredString(params, "categoryName"));
      },

      displays_category: async ({ ctx, params }) => {
        await expect(workLogClassificationControl(ctx.page)).toContainText(requiredString(params, "categoryName"));
      },
    },

    "page.work_logs.submit_action": {
      disabled: async ({ ctx }) => {
        await expect(submitWorkLogButton(ctx.page)).toBeDisabled();
      },

      submit: async ({ ctx }) => {
        await submitTodayWorkLog(ctx.page);
      },
    },

    "page.work_logs.progress_estimate_input": {
      disabled: async ({ ctx }) => {
        await expect(ctx.page.getByLabel("目标进度估计百分比", { exact: true })).toBeDisabled();
      },
    },

    "page.work_logs.duration_input": {
      absent: async ({ ctx }) => {
        await expect(ctx.page.getByLabel("记录时间分钟数", { exact: true })).toHaveCount(0);
      },
    },

    "page.work_logs.body_editor": {
      fill: async ({ ctx, params }) => {
        await ctx.page.getByLabel("写下这一天完成了什么", { exact: true }).fill(requiredString(params, "value"));
      },
    },

    "page.work_logs.toast": {
      visible: async ({ ctx, params }) => {
        await expect(workLogToast(ctx.page, requiredString(params, "text"))).toBeVisible();
      },
    },

    "page.work_logs.history": {
      contains_body: async ({ ctx, params }) => {
        await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker"))).toContainText(requiredString(params, "body"));
      },

      contains_category: async ({ ctx, params }) => {
        await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker"))).toContainText(requiredString(params, "categoryName"));
      },

      not_contains_duration: async ({ ctx, params }) => {
        await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker")).locator(".work-logs-duration-pill")).toHaveCount(0);
      },

      not_contains_progress: async ({ ctx, params }) => {
        await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker"))).not.toContainText(/进\s*\d+%/);
      },
    },

    "auth.session.user_name": {
      equals: async ({ ctx, params }) => {
        await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
      },
    },

    "api.work_log.categories": {
      contains_managed: async ({ ctx, params }) => {
        await expect.poll(() => workLogCategoriesContain(ctx.page, requiredString(params, "name"))).toBe(true);
      },

      source_equals: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            workLogCategorySourceEquals(ctx.page, {
              name: requiredString(params, "name"),
              source: requiredString(params, "source"),
            }),
          )
          .toBe(true);
      },
    },

    "api.work_log.my_day": {
      not_contains_body_marker: async ({ ctx, params }) => {
        await expect.poll(() => apiMyDayContainsBodyMarker(ctx.page, requiredString(params, "bodyMarker"))).toBe(false);
      },

      contains_body: async ({ ctx, params }) => {
        await expect.poll(() => apiMyDayContainsBodyMarker(ctx.page, requiredString(params, "bodyMarker"))).toBe(true);
      },

      category_id_snapshot: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            apiMyDayEntryFieldEquals(ctx.page, {
              bodyMarker: requiredString(params, "bodyMarker"),
              field: "categoryIdSnapshot",
              value: requiredString(params, "value"),
            }),
          )
          .toBe(true);
      },

      category_name_snapshot: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            apiMyDayEntryFieldEquals(ctx.page, {
              bodyMarker: requiredString(params, "bodyMarker"),
              field: "categoryNameSnapshot",
              value: requiredString(params, "value"),
            }),
          )
          .toBe(true);
      },

      objective_id_snapshot_empty: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            apiMyDayEntryFieldEquals(ctx.page, {
              bodyMarker: requiredString(params, "bodyMarker"),
              field: "objectiveIdSnapshot",
              value: null,
            }),
          )
          .toBe(true);
      },

      objective_title_snapshot_empty: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            apiMyDayEntryFieldEquals(ctx.page, {
              bodyMarker: requiredString(params, "bodyMarker"),
              field: "objectiveTitleSnapshot",
              value: null,
            }),
          )
          .toBe(true);
      },

      duration_minutes_empty: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            apiMyDayEntryFieldEquals(ctx.page, {
              bodyMarker: requiredString(params, "bodyMarker"),
              field: "durationMinutes",
              value: null,
            }),
          )
          .toBe(true);
      },

      remaining_estimate_percent_empty: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            apiMyDayEntryFieldEquals(ctx.page, {
              bodyMarker: requiredString(params, "bodyMarker"),
              field: "remainingEstimatePercent",
              value: null,
            }),
          )
          .toBe(true);
      },
    },

    "db.work_log_category": {
      upsert_management: async ({ params }) =>
        prepareManagementWorkLogCategory({
          categoryName: requiredString(params, "categoryName"),
          createdByUserId: requiredString(params, "createdByUserId"),
          teamId: requiredString(params, "teamId"),
          teamName: requiredString(params, "teamName"),
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

      absent_today_for_admin_by_marker: async ({ params }) => {
        await expect
          .poll(() =>
            dbWorkLogEntryForTodayByAdminAndMarker({
              bodyMarker: requiredString(params, "bodyMarker"),
              adminEmail: requiredString(params, "adminEmail"),
            }),
          )
          .toBeNull();
      },

      exists_today_for_admin: async ({ params }) => {
        const bodyMarker = requiredString(params, "bodyMarker");
        const adminEmail = requiredString(params, "adminEmail");
        await expect
          .poll(() =>
            dbWorkLogEntryForTodayByAdminAndMarker({
              bodyMarker,
              adminEmail,
            }),
          )
          .not.toBeNull();
        const entry = await dbWorkLogEntryForTodayByAdminAndMarker({ bodyMarker, adminEmail });
        if (!entry) {
          throw new Error("本用例工作日志存在性断言后无法读取记录");
        }
        return entry satisfies WorkLogEntryFixture;
      },
    },

    "db.work_log_entry.category_id_snapshot": {
      equals: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.categoryIdSnapshot).toBe(requiredString(params, "value"));
      },
    },

    "db.work_log_entry.category_name_snapshot": {
      equals: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.categoryNameSnapshot).toBe(requiredString(params, "value"));
      },
    },

    "db.work_log_entry.objective_id_snapshot": {
      empty: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.objectiveIdSnapshot).toBeNull();
      },
    },

    "db.work_log_entry.objective_title_snapshot": {
      empty: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.objectiveTitleSnapshot).toBeNull();
      },
    },

    "db.work_log_entry.duration_minutes": {
      empty: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.durationMinutes).toBeNull();
      },
    },

    "db.work_log_entry.remaining_estimate_percent": {
      empty: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.remainingEstimatePercent).toBeNull();
      },
    },
  };
