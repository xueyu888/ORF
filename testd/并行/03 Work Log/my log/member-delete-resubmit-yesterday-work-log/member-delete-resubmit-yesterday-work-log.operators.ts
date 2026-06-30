import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { optionalString, requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberDeleteResubmitYesterdayWorkLogCaseData,
  TestContext,
  WorkLogDateScope,
  WorkLogEntryFixture,
} from "./_support/member-delete-resubmit-yesterday-work-log.context";
import {
  apiMyDayContainsBodyMarker,
  apiMyDayEntryFieldEquals,
  countWorkLogEntriesByDateMemberAndObjective,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForDateByMemberAndMarker,
  deleteWorkLog,
  deleteWorkLogsByBodyMarker,
  loginAsMember,
  openWorkLogTodayView,
  prepareWorkLogEntryForDate,
  readSessionUserName,
  requiredTestUserAccount,
  requiredWorkLogEntry,
  requiredWorkLogObjective,
  selectPreviousWorkLogDate,
  selectWorkLogObjective,
  submitWorkLog,
  todayWorkDate,
  workDateForScope,
  workLogDateControl,
  workLogDeleteButton,
  workLogHistory,
  workLogHistoryEntry,
  workLogObjectivesContain,
  workLogToast,
  workLogViewTab,
  yesterdayWorkDate,
} from "./_support/member-delete-resubmit-yesterday-work-log.helpers";

export const memberDeleteResubmitYesterdayWorkLogOperators: OperatorRegistry<
  TestContext,
  MemberDeleteResubmitYesterdayWorkLogCaseData
> = {
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

  "page.work_logs.date": {
    today: async ({ ctx }) => {
      await expect(workLogDateControl(ctx.page)).toContainText(todayWorkDate());
    },

    yesterday: async ({ ctx }) => {
      await expect(workLogDateControl(ctx.page)).toContainText(yesterdayWorkDate());
    },

    previous_day: async ({ ctx }) => {
      await selectPreviousWorkLogDate(ctx.page);
    },
  },

  "page.work_logs.delete_action": {
    visible: async ({ ctx, params }) => {
      await expect(workLogDeleteButton(ctx.page, requiredString(params, "bodyMarker"))).toBeVisible();
    },

    enabled: async ({ ctx, params }) => {
      await expect(workLogDeleteButton(ctx.page, requiredString(params, "bodyMarker"))).toBeEnabled();
    },

    click: async ({ ctx, params }) => {
      await workLogDeleteButton(ctx.page, requiredString(params, "bodyMarker")).click();
    },

    delete: async ({ ctx, params }) => {
      await deleteWorkLog(ctx.page, requiredString(params, "bodyMarker"));
    },
  },

  "page.work_logs.delete_confirm": {
    confirm: async () => {
      // 确认弹窗由 page.work_logs.delete_action.delete 内部处理，保留该 operator 让文档动作可一一回链。
    },
  },

  "page.work_logs.classification": {
    select_objective: async ({ ctx, params }) => {
      await selectWorkLogObjective(ctx.page, requiredString(params, "objectiveTitle"));
    },
  },

  "page.work_logs.progress_estimate_input": {
    fill: async ({ ctx, params }) => {
      await ctx.page.getByLabel("目标进度估计百分比", { exact: true }).fill(String(requiredNumber(params, "value")));
    },
  },

  "page.work_logs.duration_input": {
    fill: async ({ ctx, params }) => {
      await ctx.page.getByLabel("记录时间分钟数", { exact: true }).fill(String(requiredNumber(params, "value")));
    },
  },

  "page.work_logs.body_editor": {
    fill: async ({ ctx, params }) => {
      await ctx.page.getByLabel("写下今天完成了什么", { exact: true }).fill(requiredString(params, "value"));
    },
  },

  "page.work_logs.submit_action": {
    submit: async ({ ctx }) => {
      await submitWorkLog(ctx.page);
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

    contains_objective: async ({ ctx, params }) => {
      await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker"))).toContainText(requiredString(params, "objectiveTitle"));
    },

    contains_duration: async ({ ctx, params }) => {
      await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker"))).toContainText(requiredString(params, "durationLabel"));
    },

    contains_progress: async ({ ctx, params }) => {
      await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker"))).toContainText(requiredString(params, "progressLabel"));
    },

    not_contains_marker: async ({ ctx, params }) => {
      await expect(workLogHistory(ctx.page)).not.toContainText(requiredString(params, "bodyMarker"));
    },
  },

  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "api.work_log.objectives": {
    contains_title: async ({ ctx, params }) => {
      await expect.poll(() => workLogObjectivesContain(ctx.page, requiredString(params, "title"))).toBe(true);
    },
  },

  "api.work_log.my_day": {
    not_contains_body_marker: async ({ ctx, params }) => {
      await expect.poll(() =>
        apiMyDayContainsBodyMarker(ctx.page, {
          bodyMarker: requiredString(params, "bodyMarker"),
          scope: requiredDateScope(params),
        }),
      ).toBe(false);
    },

    contains_body: async ({ ctx, params }) => {
      await expect.poll(() =>
        apiMyDayContainsBodyMarker(ctx.page, {
          bodyMarker: requiredString(params, "bodyMarker"),
          scope: requiredDateScope(params),
        }),
      ).toBe(true);
    },

    objective_title_snapshot: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          apiMyDayEntryFieldEquals(ctx.page, {
            bodyMarker: requiredString(params, "bodyMarker"),
            field: "objectiveTitleSnapshot",
            scope: requiredDateScope(params),
            value: requiredString(params, "value"),
          }),
        )
        .toBe(true);
    },

    duration_minutes: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          apiMyDayEntryFieldEquals(ctx.page, {
            bodyMarker: requiredString(params, "bodyMarker"),
            field: "durationMinutes",
            scope: requiredDateScope(params),
            value: requiredNumber(params, "value"),
          }),
        )
        .toBe(true);
    },

    remaining_estimate_percent: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          apiMyDayEntryFieldEquals(ctx.page, {
            bodyMarker: requiredString(params, "bodyMarker"),
            field: "remainingEstimatePercent",
            scope: requiredDateScope(params),
            value: requiredNumber(params, "value"),
          }),
        )
        .toBe(true);
    },
  },

  "db.work_log_entry": {
    delete_by_body_marker: async ({ params }) => {
      await deleteWorkLogsByBodyMarker(requiredString(params, "bodyMarker"));
    },

    prepare_for_date: async ({ params }) => {
      return prepareWorkLogEntryForDate({
        memberUser: requiredTestUserAccount(params.memberUser),
        objective: requiredWorkLogObjective(params.objective),
        bodyMarker: requiredString(params, "bodyMarker"),
        body: requiredString(params, "body"),
        durationMinutes: requiredNumber(params, "durationMinutes"),
        remainingEstimatePercent: requiredNumber(params, "remainingEstimatePercent"),
        scope: requiredDateScope(params),
      });
    },

    absent_by_body_marker: async ({ params }) => {
      await expect.poll(() => dbWorkLogEntryByBodyMarker(requiredString(params, "bodyMarker"))).toBeNull();
    },

    absent_for_date_and_member: async ({ params }) => {
      const bodyMarker = requiredString(params, "bodyMarker");
      const memberEmail = requiredString(params, "memberEmail");
      const scope = requiredDateScope(params);
      await expect.poll(() => dbWorkLogEntryForDateByMemberAndMarker({ bodyMarker, memberEmail, scope })).toBeNull();
    },

    exists_for_date_and_member: async ({ params }) => {
      const bodyMarker = requiredString(params, "bodyMarker");
      const memberEmail = requiredString(params, "memberEmail");
      const scope = requiredDateScope(params);
      await expect
        .poll(() =>
          dbWorkLogEntryForDateByMemberAndMarker({
            bodyMarker,
            memberEmail,
            scope,
          }),
        )
        .not.toBeNull();
      const entry = await dbWorkLogEntryForDateByMemberAndMarker({ bodyMarker, memberEmail, scope });
      if (!entry) {
        throw new Error("本用例工作日志存在性断言后无法读取记录");
      }
      return entry satisfies WorkLogEntryFixture;
    },

    count_for_date_member_and_objective: async ({ params }) => {
      await expect
        .poll(() =>
          countWorkLogEntriesByDateMemberAndObjective({
            memberEmail: requiredString(params, "memberEmail"),
            objectiveTitle: requiredString(params, "objectiveTitle"),
            scope: requiredDateScope(params),
          }),
        )
        .toBe(requiredNumber(params, "value"));
    },
  },

  "db.work_log_entry.work_date": {
    equals_date_scope: async ({ params }) => {
      const entry = requiredWorkLogEntry(params.entry);
      expect(entry.workDate).toBe(workDateForScope(requiredDateScope(params)));
    },
  },

  "db.work_log_entry.objective_title_snapshot": {
    equals: async ({ params }) => {
      const entry = requiredWorkLogEntry(params.entry);
      expect(entry.objectiveTitleSnapshot).toBe(requiredString(params, "value"));
    },
  },

  "db.work_log_entry.duration_minutes": {
    equals: async ({ params }) => {
      const entry = requiredWorkLogEntry(params.entry);
      expect(entry.durationMinutes).toBe(requiredNumber(params, "value"));
    },
  },

  "db.work_log_entry.remaining_estimate_percent": {
    equals: async ({ params }) => {
      const entry = requiredWorkLogEntry(params.entry);
      expect(entry.remainingEstimatePercent).toBe(requiredNumber(params, "value"));
    },
  },
};

function requiredDateScope(params: Record<string, unknown>): WorkLogDateScope {
  const value = optionalString(params, "dateScope") ?? "today";
  if (value === "today" || value === "yesterday") {
    return value;
  }
  throw new Error("参数 dateScope 必须是 today 或 yesterday");
}
