import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberLeaveCategorySubmitWorkLogCaseData,
  TestContext,
  WorkLogEntryFixture,
} from "./_support/member-leave-category-submit-work-log.context";
import {
  apiMyDayContainsBodyMarker,
  apiMyDayEntryFieldEquals,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForTodayByMemberAndMarker,
  deleteWorkLogsByBodyMarker,
  loginAsMember,
  openWorkLogTodayView,
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
} from "./_support/member-leave-category-submit-work-log.helpers";

export const memberLeaveCategorySubmitWorkLogOperators:
  OperatorRegistry<TestContext, MemberLeaveCategorySubmitWorkLogCaseData> = {
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
      contains_built_in: async ({ ctx, params }) => {
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

    "db.work_log_entry": {
      delete_by_body_marker: async ({ params }) => {
        await deleteWorkLogsByBodyMarker(requiredString(params, "bodyMarker"));
      },

      absent_by_body_marker: async ({ params }) => {
        await expect.poll(() => dbWorkLogEntryByBodyMarker(requiredString(params, "bodyMarker"))).toBeNull();
      },

      exists_today_for_member: async ({ params }) => {
        const bodyMarker = requiredString(params, "bodyMarker");
        const memberEmail = requiredString(params, "memberEmail");
        await expect
          .poll(() =>
            dbWorkLogEntryForTodayByMemberAndMarker({
              bodyMarker,
              memberEmail,
            }),
          )
          .not.toBeNull();
        const entry = await dbWorkLogEntryForTodayByMemberAndMarker({ bodyMarker, memberEmail });
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
