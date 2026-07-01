import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberDeleteResubmitTodayWorkLogCaseData,
  TestContext,
  WorkLogEntryFixture,
} from "./_support/member-delete-resubmit-today-work-log.context";
import {
  apiMyDayContainsBodyMarker,
  apiMyDayEntryFieldEquals,
  countTodayWorkLogEntriesByMemberAndObjective,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForTodayByMemberAndMarker,
  deleteWorkLog,
  deleteWorkLogsByBodyMarker,
  loginAsMember,
  openWorkLogTodayView,
  prepareTodayWorkLogEntry,
  readSessionUserName,
  requiredTestUserAccount,
  requiredWorkLogEntry,
  requiredWorkLogObjective,
  selectWorkLogObjective,
  submitTodayWorkLog,
  todayWorkDate,
  workLogDateControl,
  workLogDeleteButton,
  workLogHistory,
  workLogHistoryEntry,
  workLogObjectivesContain,
  workLogToast,
  workLogViewTab,
} from "./_support/member-delete-resubmit-today-work-log.helpers";

export const memberDeleteResubmitTodayWorkLogOperators: OperatorRegistry<TestContext, MemberDeleteResubmitTodayWorkLogCaseData> = {
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
      await submitTodayWorkLog(ctx.page);
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
      await expect.poll(() => apiMyDayContainsBodyMarker(ctx.page, requiredString(params, "bodyMarker"))).toBe(false);
    },

    contains_body: async ({ ctx, params }) => {
      await expect.poll(() => apiMyDayContainsBodyMarker(ctx.page, requiredString(params, "bodyMarker"))).toBe(true);
    },

    objective_title_snapshot: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          apiMyDayEntryFieldEquals(ctx.page, {
            bodyMarker: requiredString(params, "bodyMarker"),
            field: "objectiveTitleSnapshot",
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

    prepare_today: async ({ params }) => {
      return prepareTodayWorkLogEntry({
        memberUser: requiredTestUserAccount(params.memberUser),
        objective: requiredWorkLogObjective(params.objective),
        bodyMarker: requiredString(params, "bodyMarker"),
        body: requiredString(params, "body"),
        durationMinutes: requiredNumber(params, "durationMinutes"),
        remainingEstimatePercent: requiredNumber(params, "remainingEstimatePercent"),
      });
    },

    absent_by_body_marker: async ({ params }) => {
      await expect.poll(() => dbWorkLogEntryByBodyMarker(requiredString(params, "bodyMarker"))).toBeNull();
    },

    absent_today_for_member: async ({ params }) => {
      const bodyMarker = requiredString(params, "bodyMarker");
      const memberEmail = requiredString(params, "memberEmail");
      await expect.poll(() => dbWorkLogEntryForTodayByMemberAndMarker({ bodyMarker, memberEmail })).toBeNull();
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

    count_today_for_member_and_objective: async ({ params }) => {
      await expect
        .poll(() =>
          countTodayWorkLogEntriesByMemberAndObjective({
            memberEmail: requiredString(params, "memberEmail"),
            objectiveTitle: requiredString(params, "objectiveTitle"),
          }),
        )
        .toBe(requiredNumber(params, "value"));
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
