import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { requiredString } from "../../_operators/params";
import type {
  ObjectivePublishCaseData,
  ObjectivePublishDbSnapshot,
  ObjectivePublishTarget,
  TestContext,
} from "./_support/objective-publish.context";
import {
  adminAccountActive,
  bountyHallContainsObjective,
  bountyRow,
  memberAccountActive,
  objectivePanel,
  objectiveTitleAbsent,
  readAdminWorkbenchData,
  readObjectiveByTitle,
  removeObjectivesByTitle,
  visibleObjectiveInWorkbench,
  workbenchContainsObjective,
  workbenchMissingObjectiveTitle,
} from "./_support/objective-publish.helpers";

export const objectivePublishOperators = {
  "db.admin": {
    active: async ({ data }) => {
      await expect.poll(() => adminAccountActive(data)).toBe(true);
    },
  },

  "db.member": {
    active: async ({ data }) => {
      await expect.poll(() => memberAccountActive(data)).toBe(true);
    },
  },

  "db.objective": {
    absent: async ({ params }) => {
      await expect.poll(() => objectiveTitleAbsent(requiredString(params, "title"))).toBe(true);
    },

    delete_by_title: async ({ params }) => {
      await removeObjectivesByTitle(requiredString(params, "title"));
    },

    published: async ({ params }) => {
      const target = requiredObjective(params, "target");
      await expect.poll(() => readObjectiveByTitle(target.title)).toMatchObject({
        id: target.id,
        title: target.title,
        flowStatus: "open",
        status: "Draft",
      } satisfies Partial<ObjectivePublishDbSnapshot>);
    },
  },

  "api.my_challenges": {
    read_all: async ({ ctx }) => readAdminWorkbenchData(ctx.page),

    objective_absent: async ({ ctx, params }) => {
      await expect.poll(() => workbenchMissingObjectiveTitle(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_present: async ({ ctx, params }) => {
      await expect.poll(() => workbenchContainsObjective(ctx.page, requiredObjective(params, "target"))).toBe(true);
    },
  },

  "api.objective_create_response": {
    record_objective: async ({ params }) => objectiveFromCapturedResponse(await requiredCapturedResponse(params, "response")),

    matches: async ({ params }) => {
      const target = requiredObjective(params, "target");
      expect(target).toMatchObject({
        title: requiredString(params, "title"),
        flowStatus: "candidate",
        status: "Draft",
        challengers: [],
        assignedChallengers: [],
        challengeApplications: [],
      });
    },
  },

  "api.objective_publish": {
    capture_response: async ({ ctx, runtime, params }) => {
      const target = requiredObjective(params, "target");
      const saveAs = requiredString(params, "saveAs");
      runtime.values[saveAs] = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "PATCH" &&
            response.url().endsWith(`/api/objectives/${encodeURIComponent(target.id)}/publish`)
          );
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await response.json().catch(() => null),
        }));
    },
  },

  "api.objective_publish_response": {
    record_objective: async ({ params }) => objectiveFromCapturedResponse(await requiredCapturedResponse(params, "response")),

    matches: async ({ params }) => {
      const created = requiredObjective(params, "created");
      const published = requiredObjective(params, "published");
      expect(published.id).toBe(created.id);
      expect(published.title).toBe(created.title);
      expect(published.flowStatus).toBe("open");
      expect(published.stage).toBe("resultClaiming");
    },
  },

  "api.bounties": {
    objective_present: async ({ ctx, params }) => {
      await expect.poll(() => bountyHallContainsObjective(ctx.page, requiredObjective(params, "target"))).toBe(true);
    },
  },

  "page.objective_title": {
    submit: async ({ ctx }) => {
      await ctx.page.getByLabel("编辑目标标题").press("Enter");
    },
  },

  "page.objective_panel": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredObjective(params, "target"))).toBeVisible();
    },

    status: async ({ ctx, params }) => {
      const target = requiredObjective(params, "target");
      await expect(objectivePanel(ctx.page, target).getByText(requiredString(params, "statusText"), { exact: true })).toBeVisible();
    },

    wait_visible: async ({ ctx, params }) => {
      await visibleObjectiveInWorkbench(ctx.page, requiredObjective(params, "target"));
    },

    publish: async ({ ctx, params }) => {
      const target = requiredObjective(params, "target");
      await objectivePanel(ctx.page, target).getByRole("button", { name: "发布" }).click();
    },
  },

  "page.bounty_row": {
    visible: async ({ ctx, params }) => {
      await expect(bountyRow(ctx.page, requiredObjective(params, "target"))).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, ObjectivePublishCaseData>;

function objectiveFromCapturedResponse(response: Awaited<ReturnType<typeof requiredCapturedResponse>>): ObjectivePublishTarget {
  expect(response.ok).toBe(true);
  expect(response.status).toBe(200);

  const objective = (response.body as { objective?: unknown } | null)?.objective;
  if (!isObjectivePublishTarget(objective)) {
    throw new Error("接口响应中缺少有效目标对象");
  }

  return objective;
}

function requiredObjective(params: StepParams, key: string): ObjectivePublishTarget {
  const value = params[key];
  if (!isObjectivePublishTarget(value)) {
    throw new Error(`参数 ${key} 必须是目标对象`);
  }
  return value;
}

function isObjectivePublishTarget(value: unknown): value is ObjectivePublishTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ObjectivePublishTarget).id === "string" &&
    typeof (value as ObjectivePublishTarget).title === "string" &&
    typeof (value as ObjectivePublishTarget).flowStatus === "string" &&
    typeof (value as ObjectivePublishTarget).stage === "string" &&
    typeof (value as ObjectivePublishTarget).status === "string" &&
    Array.isArray((value as ObjectivePublishTarget).challengers) &&
    Array.isArray((value as ObjectivePublishTarget).assignedChallengers) &&
    Array.isArray((value as ObjectivePublishTarget).challengeApplications)
  );
}
