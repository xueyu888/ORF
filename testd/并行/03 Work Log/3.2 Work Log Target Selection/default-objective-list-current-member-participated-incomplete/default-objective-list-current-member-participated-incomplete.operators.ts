import { expect } from "@playwright/test";
import type { OperatorRegistry } from "../../../../_framework/types";
import { requiredString } from "../../../../_operators/params";
import type {
  DefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData,
  ObjectiveFixtureExpectation,
  TestContext,
} from "./_support/default-objective-list-current-member-participated-incomplete.context";
import {
  defaultWorkLogObjectiveFlowStatusEquals,
  defaultWorkLogObjectiveIsCurrentChallenger,
  defaultWorkLogObjectivesContain,
  defaultWorkLogObjectivesContainOnlyTitleForPrefix,
  deleteObjectivesByTitlePrefix,
  loginAsMember,
  objectiveFixtureMatches,
  objectivesByTitlePrefixAbsent,
  openWorkLogDefaultObjectiveList,
  openWorkLogTodayView,
  readSessionUserName,
  userByNameAbsent,
  workLogClassificationControl,
  workLogDefaultObjectiveOption,
  workLogEditorPanel,
  workLogViewTab,
} from "./_support/default-objective-list-current-member-participated-incomplete.helpers";

export const defaultObjectiveListCurrentMemberParticipatedIncompleteOperators:
  OperatorRegistry<TestContext, DefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData> = {
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
    },

    "page.work_logs.default_objective_list": {
      contains_title: async ({ ctx, params }) => {
        await expect(workLogDefaultObjectiveOption(ctx.page, requiredString(params, "title")).first()).toBeVisible();
      },

      not_contains_title: async ({ ctx, params }) => {
        await expect(workLogDefaultObjectiveOption(ctx.page, requiredString(params, "title"))).toHaveCount(0);
      },
    },

    "auth.session.user_name": {
      equals: async ({ ctx, params }) => {
        await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
      },
    },

    "api.work_log.default_objectives": {
      contains_title: async ({ ctx, params }) => {
        await expect.poll(() => defaultWorkLogObjectivesContain(ctx.page, requiredString(params, "title"))).toBe(true);
      },

      not_contains_title: async ({ ctx, params }) => {
        await expect.poll(() => defaultWorkLogObjectivesContain(ctx.page, requiredString(params, "title"))).toBe(false);
      },

      current_challenger: async ({ ctx, params }) => {
        await expect.poll(() => defaultWorkLogObjectiveIsCurrentChallenger(ctx.page, requiredString(params, "title"))).toBe(true);
      },

      flow_status: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            defaultWorkLogObjectiveFlowStatusEquals(ctx.page, {
              title: requiredString(params, "title"),
              flowStatus: requiredString(params, "flowStatus"),
            }),
          )
          .toBe(true);
      },

      contains_only_title_for_prefix: async ({ ctx, params }) => {
        await expect
          .poll(() =>
            defaultWorkLogObjectivesContainOnlyTitleForPrefix(ctx.page, {
              prefix: requiredString(params, "prefix"),
              title: requiredString(params, "title"),
            }),
          )
          .toBe(true);
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
