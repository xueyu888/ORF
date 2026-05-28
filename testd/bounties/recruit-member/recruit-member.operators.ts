import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { RecruitMemberCaseData, RecruitMemberDbSnapshot, RecruitMemberTarget, TestContext } from "./_support/recruit-member.context";
import {
  acceptChallengeDialog,
  bountyHallContainsRecruitment,
  bountyHallMissingRecruitment,
  bountyRow,
  objectivePanel,
  readAdminWorkbenchData,
  readBountyHallData,
  readMemberWorkbenchData,
  readObjectiveSnapshot,
  recruitDialog,
  userStatusByEmail,
  workbenchContainsObjective,
} from "./_support/recruit-member.helpers";

export const recruitMemberOperators = {
  "api.my_challenges": {
    read_all: async ({ ctx }) => readAdminWorkbenchData(ctx.page),

    read_mine: async ({ ctx }) => readMemberWorkbenchData(ctx.page),

    objective_present_all: async ({ ctx, params }) => {
      await expect.poll(() => workbenchContainsObjective(ctx.page, requiredRecruitTarget(params, "target"), "all")).toBe(true);
    },

    objective_present_mine: async ({ ctx, params }) => {
      await expect.poll(() => workbenchContainsObjective(ctx.page, requiredRecruitTarget(params, "target"), "mine")).toBe(true);
    },
  },

  "api.bounties": {
    read: async ({ ctx }) => readBountyHallData(ctx.page),

    recruitment_present: async ({ ctx, params }) => {
      await expect.poll(() => bountyHallContainsRecruitment(ctx.page, requiredRecruitTarget(params, "target"))).toBe(true);
    },

    recruitment_absent: async ({ ctx, params }) => {
      await expect.poll(() => bountyHallMissingRecruitment(ctx.page, requiredRecruitTarget(params, "target"))).toBe(true);
    },
  },

  "api.recruitment": {
    capture_response: async ({ ctx, runtime, params }) => {
      const target = requiredRecruitTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "POST" &&
            response.url().endsWith(`/api/objectives/${encodeURIComponent(target.id)}/recruitments`)
          );
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await readResponseBody(response),
        }));
    },

    record_objective: async ({ params }) => objectiveFromCapturedResponse(await requiredCapturedResponse(params, "response")),
  },

  "api.challenge_acceptance": {
    capture_response: async ({ ctx, runtime, params }) => {
      const target = requiredRecruitTarget(params, "target");
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "PATCH" &&
            response.url().endsWith(`/api/objectives/${encodeURIComponent(target.id)}/challenge`)
          );
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await readResponseBody(response),
        }));
    },

    record_objective: async ({ params }) => objectiveFromCapturedResponse(await requiredCapturedResponse(params, "response")),
  },

  "api.recruit_target": {
    same_id: async ({ params }) => {
      expect(requiredRecruitTarget(params, "actual").id).toBe(requiredRecruitTarget(params, "expected").id);
    },

    flow_status: async ({ params }) => {
      expect(requiredRecruitTarget(params, "target").flowStatus).toBe(requiredString(params, "status"));
    },

    assigned_contains: async ({ params }) => {
      expect(requiredRecruitTarget(params, "target").assignedChallengers).toContain(requiredString(params, "memberName"));
    },

    challenger_absent: async ({ params }) => {
      expect(requiredRecruitTarget(params, "target").challengers).not.toContain(requiredString(params, "memberName"));
    },

    recruited: async ({ params }) => {
      const target = requiredRecruitTarget(params, "target");
      const memberName = requiredString(params, "memberName");
      expect(target.flowStatus).toBe("recruiting");
      expect(target.assignedChallengers).toContain(memberName);
      expect(target.challengers).not.toContain(memberName);
    },
  },

  "db.recruit_target": {
    flow_status: async ({ params }) => {
      await expect.poll(async () => (await requiredSnapshot(params, "target")).flowStatus).toBe(requiredString(params, "status"));
    },

    stage: async ({ params }) => {
      await expect.poll(async () => (await requiredSnapshot(params, "target")).stage).toBe(requiredString(params, "stage"));
    },

    challengers_empty: async ({ params }) => {
      await expect.poll(async () => (await requiredSnapshot(params, "target")).challengers).toEqual([]);
    },

    assigned_empty: async ({ params }) => {
      await expect.poll(async () => (await requiredSnapshot(params, "target")).assignedChallengers).toEqual([]);
    },

    applications_empty: async ({ params }) => {
      await expect.poll(async () => (await requiredSnapshot(params, "target")).challengeApplications).toEqual([]);
    },

    assigned_contains: async ({ params }) => {
      await expect
        .poll(async () => (await requiredSnapshot(params, "target")).assignedChallengers.includes(requiredString(params, "memberName")))
        .toBe(true);
    },

    assigned_absent: async ({ params }) => {
      await expect
        .poll(async () => (await requiredSnapshot(params, "target")).assignedChallengers.includes(requiredString(params, "memberName")))
        .toBe(false);
    },

    challenger_contains: async ({ params }) => {
      await expect
        .poll(async () => (await requiredSnapshot(params, "target")).challengers.includes(requiredString(params, "memberName")))
        .toBe(true);
    },

    challenger_absent: async ({ params }) => {
      await expect
        .poll(async () => (await requiredSnapshot(params, "target")).challengers.includes(requiredString(params, "memberName")))
        .toBe(false);
    },

    accepted_at_present: async ({ params }) => {
      await expect.poll(async () => Boolean((await requiredSnapshot(params, "target")).acceptedAt)).toBe(true);
    },

    confirmation_due_at_present: async ({ params }) => {
      await expect.poll(async () => Boolean((await requiredSnapshot(params, "target")).confirmationDueAt)).toBe(true);
    },
  },

  "db.member_user": {
    active: async ({ params }) => {
      await expect.poll(() => userStatusByEmail(requiredString(params, "email"))).toBe("active");
    },
  },

  "page.recruit_target": {
    visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredRecruitTarget(params, "target"))).toBeVisible();
    },

    recruit_visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredRecruitTarget(params, "target")).getByRole("button", { name: "征召" })).toBeVisible();
    },

    recruit_enabled: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredRecruitTarget(params, "target")).getByRole("button", { name: "征召" })).toBeEnabled();
    },

    recruit: async ({ ctx, params }) => {
      await objectivePanel(ctx.page, requiredRecruitTarget(params, "target")).getByRole("button", { name: "征召" }).click();
    },
  },

  "page.recruit_dialog": {
    visible: async ({ ctx }) => {
      await expect(recruitDialog(ctx.page)).toBeVisible();
    },

    target_visible: async ({ ctx, params }) => {
      await expect(recruitDialog(ctx.page).getByText(requiredRecruitTarget(params, "target").title)).toBeVisible();
    },

    member_visible: async ({ ctx, params }) => {
      await expect(recruitDialog(ctx.page).getByText(requiredString(params, "memberName"))).toBeVisible();
    },

    select_member: async ({ ctx, params }) => {
      await recruitDialog(ctx.page).getByLabel(`征召 ${requiredString(params, "memberName")}`).check();
    },

    submit: async ({ ctx }) => {
      await recruitDialog(ctx.page).getByRole("button", { name: "发送征召" }).click();
    },
  },

  "page.bounty_recruitment_row": {
    accept: async ({ ctx, params }) => {
      await bountyRow(ctx.page, requiredRecruitTarget(params, "target")).getByRole("button", { name: "接受挑战" }).click();
    },
  },

  "page.challenge_accept_dialog": {
    visible: async ({ ctx }) => {
      await expect(acceptChallengeDialog(ctx.page)).toBeVisible();
    },

    confirm: async ({ ctx }) => {
      await acceptChallengeDialog(ctx.page).getByRole("button", { name: "接受挑战" }).click();
    },
  },
} satisfies OperatorRegistry<TestContext, RecruitMemberCaseData>;

async function requiredSnapshot(params: StepParams, key: string): Promise<RecruitMemberDbSnapshot> {
  const target = requiredRecruitTarget(params, key);
  const snapshot = await readObjectiveSnapshot(target.id);
  if (!snapshot) {
    throw new Error(`征召目标不存在: ${target.id}`);
  }
  return snapshot;
}

function objectiveFromCapturedResponse(response: Awaited<ReturnType<typeof requiredCapturedResponse>>): RecruitMemberTarget {
  expect(response.ok).toBe(true);
  expect(response.status).toBe(200);

  const objective = (response.body as { objective?: unknown } | null)?.objective;
  if (!isRecruitTarget(objective)) {
    throw new Error("接口响应中缺少有效征召目标对象");
  }

  return objective;
}

function requiredRecruitTarget(params: StepParams, key: string): RecruitMemberTarget {
  const value = params[key];
  if (!isRecruitTarget(value)) {
    throw new Error(`参数 ${key} 必须是征召目标`);
  }
  return value;
}

function isRecruitTarget(value: unknown): value is RecruitMemberTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecruitMemberTarget).id === "string" &&
    typeof (value as RecruitMemberTarget).title === "string" &&
    typeof (value as RecruitMemberTarget).flowStatus === "string" &&
    typeof (value as RecruitMemberTarget).stage === "string" &&
    typeof (value as RecruitMemberTarget).status === "string" &&
    Array.isArray((value as RecruitMemberTarget).challengers) &&
    Array.isArray((value as RecruitMemberTarget).assignedChallengers) &&
    Array.isArray((value as RecruitMemberTarget).challengeApplications)
  );
}
