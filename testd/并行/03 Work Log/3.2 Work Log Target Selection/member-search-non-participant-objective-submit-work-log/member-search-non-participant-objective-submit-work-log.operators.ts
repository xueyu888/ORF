import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberSearchNonParticipantObjectiveSubmitWorkLogCaseData,
  ObjectiveFixtureExpectation,
  TestContext,
  WorkLogEntryFixture,
} from "./_support/member-search-non-participant-objective-submit-work-log.context";
import {
  apiMyDayContainsBodyMarker,
  apiMyDayEntryFieldEquals,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForTodayByMemberAndMarker,
  defaultWorkLogObjectivesContain,
  deleteWorkLogsByBodyMarker,
  fillWorkLogObjectiveSearch,
  loginAsMember,
  objectiveFixtureMatches,
  openWorkLogDefaultObjectiveList,
  openWorkLogTodayView,
  readSessionUserName,
  requiredWorkLogEntry,
  selectWorkLogObjectiveSearchResult,
  submitTodayWorkLogWithNonParticipantConfirm,
  submittedConfirmMessage,
  submitWorkLogButton,
  userByNameAbsent,
  workLogClassificationControl,
  workLogEditorPanel,
  workLogHistoryEntry,
  workLogNonParticipantNotice,
  workLogToast,
  workLogViewTab,
} from "./_support/member-search-non-participant-objective-submit-work-log.helpers";

export const memberSearchNonParticipantObjectiveSubmitWorkLogOperators:
  OperatorRegistry<TestContext, MemberSearchNonParticipantObjectiveSubmitWorkLogCaseData> = {
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

      open_default_objective_list: async ({ ctx }) => {
        await openWorkLogDefaultObjectiveList(ctx.page);
      },

      search_objective: async ({ ctx, params }) => {
        await fillWorkLogObjectiveSearch(ctx.page, requiredString(params, "objectiveTitle"));
      },

      select_search_result: async ({ ctx, params }) => {
        await selectWorkLogObjectiveSearchResult(ctx.page, requiredString(params, "objectiveTitle"));
      },
    },

    "page.work_logs.non_participant_notice": {
      visible: async ({ ctx, params }) => {
        await expect(workLogNonParticipantNotice(ctx.page, requiredString(params, "notice"))).toBeVisible();
      },
    },

    "page.work_logs.submit_action": {
      disabled: async ({ ctx }) => {
        await expect(submitWorkLogButton(ctx.page)).toBeDisabled();
      },

      submit_with_non_participant_confirm: async ({ ctx, params }) => {
        await submitTodayWorkLogWithNonParticipantConfirm(ctx.page, requiredString(params, "confirmMessage"));
      },
    },

    "page.work_logs.browser_confirm": {
      message_visible: async ({ ctx, params }) => {
        expect(submittedConfirmMessage(ctx.page)).toContain(requiredString(params, "confirmMessage"));
      },

      confirm: async () => {
        // 原生确认弹窗由提交算子内部接受；该算子保留文档步骤到 StepSpec 的一一回链。
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
    },

    "auth.session.user_name": {
      equals: async ({ ctx, params }) => {
        await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
      },
    },

    "api.work_log.default_objectives": {
      not_contains_title: async ({ ctx, params }) => {
        await expect.poll(() => defaultWorkLogObjectivesContain(ctx.page, requiredString(params, "title"))).toBe(false);
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

    "db.work_log_objective_fixture": {
      exists: async ({ params }) => {
        await expect
          .poll(() =>
            objectiveFixtureMatches({
              title: requiredString(params, "title"),
              teamId: params.teamId === undefined ? undefined : requiredString(params, "teamId"),
              flowStatus: requiredString(params, "flowStatus") as ObjectiveFixtureExpectation["flowStatus"],
              challengerUserId: params.challengerUserId === undefined ? undefined : requiredString(params, "challengerUserId"),
              excludedChallengerUserId: params.excludedChallengerUserId === undefined ? undefined : requiredString(params, "excludedChallengerUserId"),
            }),
          )
          .toBe(true);
      },
    },

    "db.user_by_name": {
      absent: async ({ params }) => {
        await expect.poll(() => userByNameAbsent(requiredString(params, "name"))).toBe(true);
      },
    },
  };
