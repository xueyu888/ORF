import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  MemberSearchTeamObjectiveConfirmSubmitWorkLogCaseData,
  ObjectiveFixtureExpectation,
  TestContext,
  WorkLogEntryFixture,
} from "./_support/member-search-team-objective-confirm-submit-work-log.context";
import {
  apiMyDayContainsBodyMarker,
  apiMyDayEntryFieldEquals,
  dbWorkLogEntryByBodyMarker,
  dbWorkLogEntryForTodayByMemberAndMarker,
  confirmTodayWorkLogSubmit,
  defaultWorkLogObjectivesContain,
  deleteObjectivesByTitlePrefix,
  deleteWorkLogsByBodyMarker,
  fillWorkLogObjectiveSearch,
  loginAsMember,
  objectiveFixtureMatches,
  objectivesByTitlePrefixAbsent,
  openTodayWorkLogSubmitConfirm,
  openWorkLogClassification,
  openWorkLogTodayView,
  readSessionUserName,
  requiredWorkLogEntry,
  searchedWorkLogObjectivesContain,
  selectWorkLogObjectiveSearchResult,
  submitWorkLogButton,
  userByNameAbsent,
  workLogClassificationControl,
  workLogClassificationOption,
  workLogEditorPanel,
  workLogErrorMessage,
  workLogHistoryEntry,
  workLogNotice,
  workLogSubmitConfirmMessage,
  workLogToast,
  workLogViewTab,
} from "./_support/member-search-team-objective-confirm-submit-work-log.helpers";

export const memberSearchTeamObjectiveConfirmSubmitWorkLogOperators:
  OperatorRegistry<TestContext, MemberSearchTeamObjectiveConfirmSubmitWorkLogCaseData> = {
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

      error_absent: async ({ ctx }) => {
        await expect(workLogErrorMessage(ctx.page)).toHaveCount(0);
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

      search_objective: async ({ ctx, params }) => {
        await fillWorkLogObjectiveSearch(ctx.page, requiredString(params, "objectiveTitle"));
      },

      select_search_result: async ({ ctx, params }) => {
        await selectWorkLogObjectiveSearchResult(ctx.page, requiredString(params, "objectiveTitle"));
      },
    },

    "page.work_logs.classification.search_result": {
      visible: async ({ ctx, params }) => {
        await expect(workLogClassificationOption(ctx.page, requiredString(params, "objectiveTitle")).first()).toBeVisible();
      },
    },

    "page.work_logs.notice": {
      visible: async ({ ctx, params }) => {
        await expect(workLogNotice(ctx.page, requiredString(params, "notice"))).toBeVisible();
      },
    },

    "page.work_logs.submit_action": {
      disabled: async ({ ctx }) => {
        await expect(submitWorkLogButton(ctx.page)).toBeDisabled();
      },

      open_confirm: async ({ ctx }) => {
        await openTodayWorkLogSubmitConfirm(ctx.page);
      },
    },

    "page.work_logs.confirm_dialog": {
      message_visible: async ({ ctx, params }) => {
        await expect(workLogSubmitConfirmMessage(ctx.page)).toContainText(requiredString(params, "confirmMessage"));
      },

      confirm: async ({ ctx }) => {
        await confirmTodayWorkLogSubmit(ctx.page);
      },
    },

    "page.work_logs.progress_estimate_input": {
      fill: async ({ ctx, params }) => {
        await ctx.page.getByLabel("目标进度估计百分比", { exact: true }).fill(String(requiredNumber(params, "value")));
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

      contains_objective: async ({ ctx, params }) => {
        await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker"))).toContainText(requiredString(params, "objectiveTitle"));
      },

      not_contains_duration: async ({ ctx, params }) => {
        await expect(workLogHistoryEntry(ctx.page, requiredString(params, "bodyMarker")).locator(".work-logs-duration-pill")).toHaveCount(0);
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

    "api.work_log.search_objectives": {
      contains_title: async ({ ctx, params }) => {
        await expect.poll(() => searchedWorkLogObjectivesContain(ctx.page, requiredString(params, "title"))).toBe(true);
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
      empty: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.durationMinutes).toBeNull();
      },
    },

    "db.work_log_entry.remaining_estimate_percent": {
      equals: async ({ params }) => {
        const entry = requiredWorkLogEntry(params.entry);
        expect(entry.remainingEstimatePercent).toBe(requiredNumber(params, "value"));
      },
    },

    "db.objectives_by_prefix": {
      delete: async ({ params }) => {
        await deleteObjectivesByTitlePrefix(requiredString(params, "prefix"));
      },

      absent: async ({ params }) => {
        await expect.poll(() => objectivesByTitlePrefixAbsent(requiredString(params, "prefix"))).toBe(true);
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
