import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { BountyHallData, BountyHallItem, TaskManagementData } from "../../src/state/apiClient";
import type { ContributionAllocation, Objective, ObjectiveContributionReview, ObjectiveLoot, OrfUser, PointLedgerEntry, Result, Task } from "../../src/types/orf";

const adminUser = initialOrfState.users.find((user) => user.role === "admin")!;
const memberUser = initialOrfState.users.find((user) => user.name === "Mia Zhang")!;
const observerUser = initialOrfState.users.find((user) => user.name === "Ethan Liu")!;
const objectiveTemplate = initialOrfState.objectives.find((objective) => objective.id === "obj-bounty-cost-routing")!;
const resultTemplate = initialOrfState.results.find((result) => result.id === "res-bounty-cost-routing")!;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("real user launch flow links commander and challengers from publish to settlement", async ({ browser }) => {
  const objective = objectiveFixture({
    id: "obj-ui-live-flow",
    title: "真实联动 降低权限策略幻觉率",
    flowStatus: "candidate",
    stage: "goalSetting",
    objectiveBasePoints: 100,
    resultIds: [],
  });
  let data = taskManagementData({ objectives: [objective], results: [] });
  let acceleratedMinute = 0;
  let createPayload: ResultCreatePayload | null = null;

  const acceleratedAt = () => {
    acceleratedMinute += 3;
    return `2026-05-18T09:${String(acceleratedMinute).padStart(2, "0")}:00.000Z`;
  };
  const currentObjective = () => data.objectives.find((item) => item.id === objective.id)!;
  const currentResults = () => data.results.filter((result) => result.objectiveId === objective.id);
  const replaceObjective = (nextObjective: Objective) => {
    data = taskManagementData({
      objectives: data.objectives.map((item) => (item.id === nextObjective.id ? nextObjective : item)),
      results: data.results,
      objectiveLoot: data.objectiveLoot,
      objectiveContributionReviews: data.objectiveContributionReviews,
      pointLedger: data.pointLedger,
    });
  };
  const appendApplication = (applicant: string) => {
    const current = currentObjective();
    const applications = current.challengeApplications;
    if (applications.some((application) => application.applicant === applicant && application.status === "pending")) return;
    replaceObjective({
      ...current,
      flowStatus: "applying",
      challengeApplications: [
        ...applications,
        {
          id: `app-ui-live-${applicant.toLowerCase().replace(/\s+/g, "-")}`,
          applicant,
          status: "pending",
          createdAt: acceleratedAt(),
          decidedAt: null,
        },
      ],
    });
  };
  const approveApplication = (applicationId: string) => {
    const current = currentObjective();
    const application = current.challengeApplications.find((item) => item.id === applicationId);
    if (!application) return;
    replaceObjective({
      ...current,
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: Array.from(new Set([...current.challengers, application.applicant])),
      acceptedAt: acceleratedAt(),
      confirmationDueAt: "2999-01-01T00:00:00.000Z",
      challengeApplications: current.challengeApplications.map((item) =>
        item.id === applicationId
          ? { ...item, status: "approved" as const, decidedAt: acceleratedAt(), decidedBy: adminUser.name }
          : item,
      ),
    });
  };
  const dataForMember = (member: string) =>
    taskManagementData({
      objectives: data.objectives.filter((item) => item.challengers.includes(member)),
      results: data.results.filter((result) => data.objectives.some((objectiveItem) => objectiveItem.challengers.includes(member) && objectiveItem.id === result.objectiveId)),
      objectiveLoot: data.objectiveLoot.filter((loot) => data.objectives.some((objectiveItem) => objectiveItem.challengers.includes(member) && objectiveItem.id === loot.objectiveId)),
      objectiveContributionReviews: data.objectiveContributionReviews.filter((review) => data.objectives.some((objectiveItem) => objectiveItem.challengers.includes(member) && objectiveItem.id === review.objectiveId)),
      pointLedger: data.pointLedger,
    });
  const bountiesForMember = (member: string) => {
    const current = currentObjective();
    const isCurrentChallenger = current.challengers.includes(member);
    const hasCurrentApplication = current.challengeApplications.some((application) => application.applicant === member && application.status === "pending");
    const canApply = !isCurrentChallenger && ["open", "applying", "recruiting"].includes(current.flowStatus);
    return bountyHallData(canApply ? [bountyHallItem(current, currentResults(), { hasCurrentApplication })] : []);
  };
  const createResult = (payload: unknown) => {
    createPayload = payload as ResultCreatePayload;
    const created = resultFixture({
      id: "res-ui-live-flow",
      objectiveId: objective.id,
      title: createPayload.title ?? "真实联动 成员校准指标",
      metricName: createPayload.metricName ?? "幻觉率",
      source: "memberProposed",
      definer: memberUser.name,
      uncertaintyScore: 60,
    });
    const current = currentObjective();
    data = taskManagementData({
      objectives: [{ ...current, resultIds: [created.id] }],
      results: [created],
      objectiveLoot: data.objectiveLoot,
      objectiveContributionReviews: data.objectiveContributionReviews,
      pointLedger: data.pointLedger,
    });
  };
  const submitLoot = (payload: unknown) => {
    const input = payload as LootSubmitPayload;
    const submitted = {
      ...currentObjective(),
      flowStatus: "submitted" as const,
      lootSubmittedAt: acceleratedAt(),
    };
    const loot = objectiveLootFixture({
      id: "loot-ui-live-flow",
      objectiveId: objective.id,
      submittedBy: memberUser.name,
      body: input.body ?? "真实联动战利品",
      resultClaims: input.resultClaims ?? [{ resultId: "res-ui-live-flow", claim: "completed", evidenceText: "" }],
      selfTestReportBody: input.selfTestReportBody ?? null,
      submittedAt: acceleratedAt(),
    });
    data = taskManagementData({
      objectives: [submitted],
      results: data.results,
      objectiveLoot: [loot],
      objectiveContributionReviews: data.objectiveContributionReviews,
      pointLedger: data.pointLedger,
    });
  };
  const submitContributionReview = (reviewer: string, payload: unknown) => {
    const input = payload as ContributionReviewPayload;
    data = taskManagementData({
      objectives: data.objectives,
      results: data.results,
      objectiveLoot: data.objectiveLoot,
      objectiveContributionReviews: [
        ...data.objectiveContributionReviews,
        contributionReviewFixture({
          id: `review-ui-live-${reviewer.toLowerCase().replace(/\s+/g, "-")}`,
          objectiveId: objective.id,
          reviewer,
          allocations: input.allocations ?? [
            { member: memberUser.name, ratio: 1 },
            { member: observerUser.name, ratio: 1 },
          ],
          submittedAt: acceleratedAt(),
        }),
      ],
      pointLedger: data.pointLedger,
    });
  };
  const settleLoot = () => {
    const settledObjective = {
      ...currentObjective(),
      flowStatus: "settled" as const,
      acceptedResult: "completed" as const,
      objectiveSettlementPoints: 100,
      progress: 100,
    };
    data = taskManagementData({
      objectives: [settledObjective],
      results: data.results.map((result) => ({ ...result, acceptedResult: "completed" as const })),
      objectiveLoot: data.objectiveLoot,
      objectiveContributionReviews: data.objectiveContributionReviews,
      pointLedger: [
        pointLedgerFixture({ id: "ledger-ui-live-mia", objectiveId: objective.id, memberName: memberUser.name, points: 50, reason: "匿名互评贡献比例 50%" }),
        pointLedgerFixture({ id: "ledger-ui-live-ethan", objectiveId: objective.id, memberName: observerUser.name, points: 50, reason: "匿名互评贡献比例 50%" }),
      ],
    });
  };

  const context = await browser.newContext();
  const commanderPage = await context.newPage();
  const challengerPage = await context.newPage();
  const secondChallengerPage = await context.newPage();
  await Promise.all([
    commanderPage.addInitScript(() => window.localStorage.clear()),
    challengerPage.addInitScript(() => window.localStorage.clear()),
    secondChallengerPage.addInitScript(() => window.localStorage.clear()),
  ]);

  await mockOrfApp(commanderPage, adminUser, data, {
    allChallenges: () => data,
    onApprove: approveApplication,
    onFreeze: () => {
      replaceObjective({
        ...currentObjective(),
        flowStatus: "frozen",
        stage: "goalFrozen",
        confirmedAt: acceleratedAt(),
        confirmationDueAt: null,
      });
    },
    onPublish: () => replaceObjective({ ...currentObjective(), flowStatus: "open", stage: "resultClaiming" }),
    onReviewLoot: settleLoot,
    tasks: () => data,
  });
  await mockOrfApp(challengerPage, memberUser, data, {
    bounties: () => bountiesForMember(memberUser.name),
    mineChallenges: () => dataForMember(memberUser.name),
    onApply: () => appendApplication(memberUser.name),
    onCreateResult: createResult,
    onSubmitContributionReview: (payload) => submitContributionReview(memberUser.name, payload),
    onSubmitLoot: submitLoot,
    tasks: () => data,
  });
  await mockOrfApp(secondChallengerPage, observerUser, data, {
    bounties: () => bountiesForMember(observerUser.name),
    mineChallenges: () => dataForMember(observerUser.name),
    onApply: () => appendApplication(observerUser.name),
    onSubmitContributionReview: (payload) => submitContributionReview(observerUser.name, payload),
    tasks: () => data,
  });

  try {
    await commanderPage.goto("/tasks");
    await expect(objectivePanel(commanderPage, objective.title).getByRole("button", { name: "发布" })).toBeVisible();
    await objectivePanel(commanderPage, objective.title).getByRole("button", { name: "发布" }).click();
    await expect(objectivePanel(commanderPage, objective.title)).toContainText("可申请");

    await challengerPage.goto("/bounties");
    await expect(challengerPage.getByRole("heading", { name: objective.title })).toBeVisible();
    await challengerPage.getByRole("button", { name: "申请挑战" }).click();
    await challengerPage.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
    await expect(challengerPage.getByRole("button", { name: "已申请" })).toBeDisabled();

    await secondChallengerPage.goto("/bounties");
    await secondChallengerPage.getByRole("button", { name: "申请挑战" }).click();
    await secondChallengerPage.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
    await expect(secondChallengerPage.getByRole("button", { name: "已申请" })).toBeDisabled();

    await commanderPage.reload();
    const reviewPanel = objectivePanel(commanderPage, objective.title);
    await expect(reviewPanel).toContainText(memberUser.name);
    await expect(reviewPanel).toContainText(observerUser.name);
    await reviewPanel.getByRole("button", { name: "通过" }).first().click();
    await expect(reviewPanel).toContainText("重估中");
    await reviewPanel.getByRole("button", { name: "通过" }).click();
    await expect(reviewPanel.getByText("挑战申请")).toHaveCount(0);

    await challengerPage.goto("/tasks");
    const challengerPanel = objectivePanel(challengerPage, objective.title);
    await expect(challengerPanel).toContainText("重估中");
    await challengerPanel.hover();
    await challengerPanel.getByRole("button", { name: "提出指标" }).click();
    await challengerPage.getByLabel("指标标题").fill("真实联动 权限策略幻觉率低于 3%");
    await challengerPage.getByLabel("衡量指标").fill("幻觉率");
    await challengerPage.getByRole("button", { name: "提交指标" }).click();
    await expect.poll(() => createPayload).toMatchObject({ objectiveId: objective.id, source: "memberProposed", definer: memberUser.name });
    await expect(challengerPanel).toContainText("真实联动 权限策略幻觉率低于 3%");

    await secondChallengerPage.goto("/tasks");
    await expect(objectivePanel(secondChallengerPage, objective.title)).toContainText("真实联动 权限策略幻觉率低于 3%");

    await commanderPage.reload();
    const freezePanel = objectivePanel(commanderPage, objective.title);
    await expect(freezePanel).toContainText("真实联动 权限策略幻觉率低于 3%");
    await freezePanel.getByRole("button", { name: "冻结" }).click();
    await expect(freezePanel).toContainText("已冻结");

    await challengerPage.goto("/tasks");
    await expect(objectivePanel(challengerPage, objective.title).getByRole("link", { name: "提交战利品" })).toBeVisible();
    await challengerPage.goto(`/objectives/${objective.id}/loot`);
    await expect(challengerPage.getByRole("heading", { name: "提交战利品" })).toBeVisible();
    await challengerPage.getByLabel("完成说明").fill("已完成权限策略幻觉率验证，目标指标达成。");
    await challengerPage.getByPlaceholder("证据、数据或链接").fill("https://example.test/orf/live-flow/evidence");
    await challengerPage.getByLabel("自测报告").fill("全量回归和抽样人工复核均通过。");
    await challengerPage.getByRole("button", { name: "提交" }).click();
    await expect(challengerPage).toHaveURL(/\/tasks$/);
    await expect(objectivePanel(challengerPage, objective.title)).toContainText("待验收");

    await challengerPage.goto(`/objectives/${objective.id}/loot`);
    await expect(challengerPage.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
    await challengerPage.getByRole("button", { name: "提交匿名互评" }).click();
    await expect(challengerPage).toHaveURL(/\/tasks$/);

    await secondChallengerPage.goto(`/objectives/${objective.id}/loot`);
    await expect(secondChallengerPage.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
    await secondChallengerPage.getByRole("button", { name: "提交匿名互评" }).click();
    await expect(secondChallengerPage).toHaveURL(/\/tasks$/);

    await commanderPage.goto(`/objectives/${objective.id}/loot`);
    await expect(commanderPage.getByRole("heading", { name: "验收战利品" })).toBeVisible();
    await expect(commanderPage.getByText("匿名互评贡献结果")).toBeVisible();
    await expect(commanderPage.getByText("50%")).toHaveCount(2);
    await commanderPage.getByLabel("验收说明").fill("验收通过，按匿名互评比例结算。");
    await commanderPage.getByRole("button", { name: "验收并结算" }).click();
    await expect(commanderPage).toHaveURL(/\/reports$/);
    await expect(commanderPage.getByLabel("50 积分")).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test.describe("ORF high-level audit coverage", () => {
  test("multi-round objective iteration keeps challenger state isolated and settlement cumulative", async ({ browser }, testInfo) => {
    const rounds = [
      {
        id: "obj-ui-audit-round-one",
        title: "审计 多轮目标一 权限策略幻觉率",
        resultId: "res-ui-audit-round-one",
        resultTitle: "审计 多轮目标一 幻觉率低于 3%",
        lootId: "loot-ui-audit-round-one",
      },
      {
        id: "obj-ui-audit-round-two",
        title: "审计 多轮目标二 检索召回率",
        resultId: "res-ui-audit-round-two",
        resultTitle: "审计 多轮目标二 Recall 大于 92%",
        lootId: "loot-ui-audit-round-two",
      },
    ];
    let data = taskManagementData({
      objectives: rounds.map((round) =>
        objectiveFixture({
          id: round.id,
          title: round.title,
          flowStatus: "candidate",
          stage: "goalSetting",
          objectiveBasePoints: 100,
          resultIds: [],
        }),
      ),
      results: [],
    });
    let activeObjectiveId = rounds[0]!.id;
    let acceleratedTick = 0;
    const createdPayloads: ResultCreatePayload[] = [];

    const acceleratedAt = () => {
      acceleratedTick += 1;
      return new Date(Date.parse("2026-05-18T10:00:00.000Z") + acceleratedTick * 9 * 60_000).toISOString();
    };
    const currentObjective = (objectiveId = activeObjectiveId) => data.objectives.find((item) => item.id === objectiveId)!;
    const currentRound = (objectiveId = activeObjectiveId) => rounds.find((round) => round.id === objectiveId)!;
    const rebuildData = (next: Partial<TaskManagementData>) => {
      data = taskManagementData({
        objectives: next.objectives ?? data.objectives,
        results: next.results ?? data.results,
        objectiveLoot: next.objectiveLoot ?? data.objectiveLoot,
        objectiveContributionReviews: next.objectiveContributionReviews ?? data.objectiveContributionReviews,
        pointLedger: next.pointLedger ?? data.pointLedger,
      });
    };
    const updateObjective = (objectiveId: string, update: (objective: Objective) => Objective) => {
      rebuildData({ objectives: data.objectives.map((objective) => (objective.id === objectiveId ? update(objective) : objective)) });
    };
    const dataForMember = (member: string) => {
      const objectives = data.objectives.filter((objective) => objective.challengers.includes(member));
      const objectiveIds = new Set(objectives.map((objective) => objective.id));
      return taskManagementData({
        objectives,
        results: data.results.filter((result) => objectiveIds.has(result.objectiveId)),
        objectiveLoot: data.objectiveLoot.filter((loot) => objectiveIds.has(loot.objectiveId)),
        objectiveContributionReviews: data.objectiveContributionReviews.filter((review) => objectiveIds.has(review.objectiveId)),
        pointLedger: data.pointLedger,
      });
    };
    const bountiesForMember = (member: string) =>
      bountyHallData(
        data.objectives
          .filter((objective) => ["open", "applying", "recruiting"].includes(objective.flowStatus) && !objective.challengers.includes(member))
          .map((objective) =>
            bountyHallItem(objective, data.results.filter((result) => result.objectiveId === objective.id), {
              hasCurrentApplication: objective.challengeApplications.some((application) => application.applicant === member && application.status === "pending"),
            }),
          ),
      );
    const appendApplication = (objectiveId: string, applicant: string) => {
      updateObjective(objectiveId, (objective) => {
        if (objective.challengeApplications.some((application) => application.applicant === applicant && application.status === "pending")) return objective;
        return {
          ...objective,
          flowStatus: "applying",
          challengeApplications: [
            ...objective.challengeApplications,
            {
              id: `app-ui-audit-${objectiveId}-${applicant.toLowerCase().replace(/\s+/g, "-")}`,
              applicant,
              status: "pending",
              createdAt: acceleratedAt(),
              decidedAt: null,
            },
          ],
        };
      });
    };
    const approveApplication = (applicationId: string) => {
      const objective = data.objectives.find((item) => item.challengeApplications.some((application) => application.id === applicationId));
      const application = objective?.challengeApplications.find((item) => item.id === applicationId);
      if (!objective || !application) return;
      updateObjective(objective.id, (current) => ({
        ...current,
        flowStatus: "reestimating",
        stage: "orfReestimate",
        challengers: Array.from(new Set([...current.challengers, application.applicant])),
        acceptedAt: acceleratedAt(),
        confirmationDueAt: "2999-01-01T00:00:00.000Z",
        challengeApplications: current.challengeApplications.map((item) =>
          item.id === applicationId ? { ...item, status: "approved" as const, decidedAt: acceleratedAt(), decidedBy: adminUser.name } : item,
        ),
      }));
    };
    const createResult = (payload: unknown) => {
      const input = payload as ResultCreatePayload;
      const objectiveId = input.objectiveId ?? activeObjectiveId;
      const round = currentRound(objectiveId);
      createdPayloads.push(input);
      const created = resultFixture({
        id: round.resultId,
        objectiveId,
        title: input.title ?? round.resultTitle,
        metricName: input.metricName ?? "迭代指标",
        source: "memberProposed",
        definer: memberUser.name,
      });
      rebuildData({
        objectives: data.objectives.map((objective) => (objective.id === objectiveId ? { ...objective, resultIds: [created.id] } : objective)),
        results: [...data.results.filter((result) => result.id !== created.id), created],
      });
    };
    const submitLoot = (payload: unknown) => {
      const input = payload as LootSubmitPayload;
      const round = currentRound();
      const loot = objectiveLootFixture({
        id: round.lootId,
        objectiveId: activeObjectiveId,
        submittedBy: memberUser.name,
        body: input.body ?? `${round.title} 战利品`,
        resultClaims: input.resultClaims ?? [{ resultId: round.resultId, claim: "completed", evidenceText: "" }],
        selfTestReportBody: input.selfTestReportBody ?? null,
        submittedAt: acceleratedAt(),
      });
      updateObjective(activeObjectiveId, (objective) => ({
        ...objective,
        flowStatus: "submitted",
        lootSubmittedAt: loot.submittedAt,
      }));
      rebuildData({ objectiveLoot: [...data.objectiveLoot.filter((item) => item.id !== loot.id), loot] });
    };
    const submitContributionReview = (reviewer: string, payload: unknown) => {
      const input = payload as ContributionReviewPayload;
      rebuildData({
        objectiveContributionReviews: [
          ...data.objectiveContributionReviews,
          contributionReviewFixture({
            id: `review-ui-audit-${activeObjectiveId}-${reviewer.toLowerCase().replace(/\s+/g, "-")}`,
            objectiveId: activeObjectiveId,
            reviewer,
            allocations: input.allocations ?? [
              { member: memberUser.name, ratio: 1 },
              { member: observerUser.name, ratio: 1 },
            ],
            submittedAt: acceleratedAt(),
          }),
        ],
      });
    };
    const settleLoot = () => {
      const round = currentRound();
      updateObjective(activeObjectiveId, (objective) => ({
        ...objective,
        flowStatus: "settled",
        acceptedResult: "completed",
        objectiveSettlementPoints: 100,
        progress: 100,
      }));
      rebuildData({
        results: data.results.map((result) => (result.objectiveId === activeObjectiveId ? { ...result, acceptedResult: "completed" as const } : result)),
        pointLedger: [
          ...data.pointLedger,
          pointLedgerFixture({ id: `ledger-ui-audit-${round.id}-mia`, objectiveId: activeObjectiveId, memberName: memberUser.name, points: 50, reason: `${round.title} 50%` }),
          pointLedgerFixture({ id: `ledger-ui-audit-${round.id}-ethan`, objectiveId: activeObjectiveId, memberName: observerUser.name, points: 50, reason: `${round.title} 50%` }),
        ],
      });
    };

    const context = await browser.newContext();
    const commanderPage = await context.newPage();
    const challengerPage = await context.newPage();
    const secondChallengerPage = await context.newPage();
    await Promise.all([
      commanderPage.addInitScript(() => window.localStorage.clear()),
      challengerPage.addInitScript(() => window.localStorage.clear()),
      secondChallengerPage.addInitScript(() => window.localStorage.clear()),
    ]);

    await mockOrfApp(commanderPage, adminUser, data, {
      allChallenges: () => data,
      onApprove: approveApplication,
      onFreeze: () =>
        updateObjective(activeObjectiveId, (objective) => ({
          ...objective,
          flowStatus: "frozen",
          stage: "goalFrozen",
          confirmedAt: acceleratedAt(),
          confirmationDueAt: null,
        })),
      onPublish: () => updateObjective(activeObjectiveId, (objective) => ({ ...objective, flowStatus: "open", stage: "resultClaiming" })),
      onReviewLoot: settleLoot,
      tasks: () => data,
    });
    await mockOrfApp(challengerPage, memberUser, data, {
      bounties: () => bountiesForMember(memberUser.name),
      mineChallenges: () => dataForMember(memberUser.name),
      onApply: () => appendApplication(activeObjectiveId, memberUser.name),
      onCreateResult: createResult,
      onSubmitContributionReview: (payload) => submitContributionReview(memberUser.name, payload),
      onSubmitLoot: submitLoot,
      tasks: () => data,
    });
    await mockOrfApp(secondChallengerPage, observerUser, data, {
      bounties: () => bountiesForMember(observerUser.name),
      mineChallenges: () => dataForMember(observerUser.name),
      onApply: () => appendApplication(activeObjectiveId, observerUser.name),
      onSubmitContributionReview: (payload) => submitContributionReview(observerUser.name, payload),
      tasks: () => data,
    });

    const runRound = async (round: (typeof rounds)[number], index: number) => {
      activeObjectiveId = round.id;
      await commanderPage.goto("/tasks");
      await attachAuditScreenshot(commanderPage, testInfo, `audit-multi-round-${index}-candidate`);
      await objectivePanel(commanderPage, round.title).getByRole("button", { name: "发布" }).click();
      await expect(objectivePanel(commanderPage, round.title)).toContainText("可申请");

      for (const [page, user] of [
        [challengerPage, memberUser] as const,
        [secondChallengerPage, observerUser] as const,
      ]) {
        activeObjectiveId = round.id;
        await page.goto("/bounties");
        await expect(page.getByRole("heading", { name: round.title })).toBeVisible();
        await page.getByRole("button", { name: "申请挑战" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
        await expect(page.getByRole("button", { name: "已申请" })).toBeDisabled();
      }

      await commanderPage.goto("/tasks");
      const reviewPanel = objectivePanel(commanderPage, round.title);
      await attachAuditScreenshot(commanderPage, testInfo, `audit-multi-round-${index}-applications`);
      await expect(reviewPanel).toContainText(memberUser.name);
      await expect(reviewPanel).toContainText(observerUser.name);
      await reviewPanel.getByRole("button", { name: "通过" }).first().click();
      await expect(reviewPanel.getByRole("button", { name: "通过" })).toHaveCount(1);
      await reviewPanel.getByRole("button", { name: "通过" }).click();
      await expect(reviewPanel).toContainText("重估中");

      await challengerPage.goto("/tasks");
      const challengerPanel = objectivePanel(challengerPage, round.title);
      await challengerPanel.hover();
      await challengerPanel.getByRole("button", { name: "提出指标" }).click();
      await challengerPage.getByLabel("指标标题").fill(round.resultTitle);
      await challengerPage.getByLabel("衡量指标").fill(index === 1 ? "幻觉率" : "Recall");
      await challengerPage.getByRole("button", { name: "提交指标" }).click();
      await expect(challengerPanel).toContainText(round.resultTitle);
      await expect(createdPayloads.at(-1)).toMatchObject({ objectiveId: round.id, source: "memberProposed", definer: memberUser.name });

      await secondChallengerPage.goto("/tasks");
      await expect(objectivePanel(secondChallengerPage, round.title)).toContainText(round.resultTitle);

      activeObjectiveId = round.id;
      await commanderPage.goto("/tasks");
      await attachAuditScreenshot(commanderPage, testInfo, `audit-multi-round-${index}-reestimate`);
      await objectivePanel(commanderPage, round.title).getByRole("button", { name: "冻结" }).click();
      await expect(objectivePanel(commanderPage, round.title)).toContainText("已冻结");

      await challengerPage.goto(`/objectives/${round.id}/loot`);
      await challengerPage.getByLabel("完成说明").fill(`${round.title} 已完成并通过自测。`);
      await challengerPage.getByPlaceholder("证据、数据或链接").fill(`https://example.test/orf/audit/${round.id}`);
      await challengerPage.getByLabel("自测报告").fill(`${round.title} 自动化和人工抽样均通过。`);
      await challengerPage.getByRole("button", { name: "提交" }).click();
      await expect(challengerPage).toHaveURL(/\/tasks$/);
      await expect(objectivePanel(challengerPage, round.title)).toContainText("待验收");

      for (const page of [challengerPage, secondChallengerPage]) {
        activeObjectiveId = round.id;
        await page.goto(`/objectives/${round.id}/loot`);
        await expect(page.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
        await page.getByRole("button", { name: "提交匿名互评" }).click();
        await expect(page).toHaveURL(/\/tasks$/);
      }

      activeObjectiveId = round.id;
      await commanderPage.goto(`/objectives/${round.id}/loot`);
      await attachAuditScreenshot(commanderPage, testInfo, `audit-multi-round-${index}-review`);
      await expect(commanderPage.getByText("50%")).toHaveCount(2);
      await commanderPage.getByLabel("验收说明").fill(`${round.title} 验收通过。`);
      await commanderPage.getByRole("button", { name: "验收并结算" }).click();
      await expect(commanderPage).toHaveURL(/\/reports$/);

      await commanderPage.goto("/tasks");
      await expect(objectivePanel(commanderPage, round.title)).toContainText("已结算");

      await challengerPage.goto("/bounties");
      await expect(challengerPage.getByRole("heading", { name: round.title })).toHaveCount(0);
    };

    try {
      await runRound(rounds[0]!, 1);
      await runRound(rounds[1]!, 2);

      await commanderPage.goto("/tasks");
      await attachAuditScreenshot(commanderPage, testInfo, "audit-multi-round-final-workbench");
      await expect(objectivePanel(commanderPage, rounds[0]!.title)).toContainText("已结算");
      await expect(objectivePanel(commanderPage, rounds[1]!.title)).toContainText("已结算");

      await commanderPage.goto("/reports");
      await attachAuditScreenshot(commanderPage, testInfo, "audit-multi-round-final-reports");
      await expect(commanderPage.getByLabel("100 积分")).toHaveCount(2);
    } finally {
      await context.close();
    }
  });

  test("submitted objectives expose visible next steps from the workbench", async ({ browser }, testInfo) => {
    const objective = submittedObjectiveFixture("obj-ui-audit-submitted-next-step", "审计 提交后应有下一步入口", [memberUser.name, observerUser.name], ["res-ui-audit-submitted-next-step"]);
    const result = resultFixture({ id: "res-ui-audit-submitted-next-step", objectiveId: objective.id, title: "审计 提交后验收指标" });
    const loot = objectiveLootFixture({
      id: "loot-ui-audit-submitted-next-step",
      objectiveId: objective.id,
      submittedBy: memberUser.name,
      body: "审计用已提交战利品。",
      resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "audit evidence" }],
    });
    const data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot] });
    const context = await browser.newContext();
    const commanderPage = await context.newPage();
    const challengerPage = await context.newPage();
    await Promise.all([
      commanderPage.addInitScript(() => window.localStorage.clear()),
      challengerPage.addInitScript(() => window.localStorage.clear()),
    ]);

    await mockOrfApp(commanderPage, adminUser, data, { allChallenges: () => data, tasks: () => data });
    await mockOrfApp(challengerPage, memberUser, data, { mineChallenges: () => data, tasks: () => data });

    try {
      await commanderPage.goto("/tasks");
      await expect(objectivePanel(commanderPage, objective.title)).toBeVisible();
      await attachAuditScreenshot(commanderPage, testInfo, "audit-submitted-commander-workbench");
      await expect.soft(objectivePanel(commanderPage, objective.title).getByRole("link", { name: "验收战利品" })).toBeVisible();

      await challengerPage.goto("/tasks");
      await expect(objectivePanel(challengerPage, objective.title)).toBeVisible();
      await attachAuditScreenshot(challengerPage, testInfo, "audit-submitted-challenger-workbench");
      await expect.soft(objectivePanel(challengerPage, objective.title).getByRole("link", { name: "提交匿名互评" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("closed metric windows hide proposal affordances instead of relying on denial toasts", async ({ page }, testInfo) => {
    const expired = objectiveFixture({
      id: "obj-ui-audit-expired-proposal",
      title: "审计 截止后不应显示提指标",
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: [memberUser.name],
      confirmationDueAt: "2000-01-01T00:00:00.000Z",
      resultIds: ["res-ui-audit-expired-proposal"],
    });
    const frozen = objectiveFixture({
      id: "obj-ui-audit-frozen-proposal",
      title: "审计 冻结后不应显示提指标",
      flowStatus: "frozen",
      stage: "goalFrozen",
      challengers: [memberUser.name],
      resultIds: ["res-ui-audit-frozen-proposal"],
    });
    const data = taskManagementData({
      objectives: [expired, frozen],
      results: [
        resultFixture({ id: "res-ui-audit-expired-proposal", objectiveId: expired.id, title: "审计 截止后已有指标" }),
        resultFixture({ id: "res-ui-audit-frozen-proposal", objectiveId: frozen.id, title: "审计 冻结后已有指标" }),
      ],
    });

    await mockOrfApp(page, memberUser, data, { mineChallenges: () => data, tasks: () => data });

    await page.goto("/tasks");
    await objectivePanel(page, expired.title).hover();
    await attachAuditScreenshot(page, testInfo, "audit-expired-proposal-hover");
    await expect.soft(objectivePanel(page, expired.title).getByRole("button", { name: "提出指标" })).toHaveCount(0);

    await objectivePanel(page, frozen.title).hover();
    await attachAuditScreenshot(page, testInfo, "audit-frozen-proposal-hover");
    await expect.soft(objectivePanel(page, frozen.title).getByRole("button", { name: "提出指标" })).toHaveCount(0);
  });

  test("mine workbench applies challenger filtering even if the API returns full data", async ({ page }, testInfo) => {
    const mine = objectiveFixture({
      id: "obj-ui-audit-mine-filter",
      title: "审计 我的冻结目标",
      flowStatus: "frozen",
      stage: "goalFrozen",
      challengers: [memberUser.name],
      resultIds: ["res-ui-audit-mine-filter"],
    });
    const leaked = objectiveFixture({
      id: "obj-ui-audit-leaked-filter",
      title: "审计 泄漏的他人冻结目标",
      flowStatus: "frozen",
      stage: "goalFrozen",
      challengers: [observerUser.name],
      resultIds: ["res-ui-audit-leaked-filter"],
    });
    const data = taskManagementData({
      objectives: [mine, leaked],
      results: [
        resultFixture({ id: "res-ui-audit-mine-filter", objectiveId: mine.id, title: "审计 我的指标" }),
        resultFixture({ id: "res-ui-audit-leaked-filter", objectiveId: leaked.id, title: "审计 他人的指标" }),
      ],
    });

    await mockOrfApp(page, memberUser, data, { mineChallenges: () => data, tasks: () => data });

    await page.goto("/tasks");
    await attachAuditScreenshot(page, testInfo, "audit-mine-scope-full-data-leak");
    await expect.soft(objectivePanel(page, mine.title).getByRole("link", { name: "提交战利品" })).toBeVisible();
    await expect.soft(page.getByText(leaked.title)).toHaveCount(0);
    await expect.soft(objectivePanel(page, leaked.title).getByRole("link", { name: "提交战利品" })).toHaveCount(0);
  });

  test("result detail deep link does not expose privileged mutations to non-challengers", async ({ page }, testInfo) => {
    const objective = objectiveFixture({
      id: "obj-ui-audit-result-detail-guard",
      title: "审计 详情页越权目标",
      flowStatus: "open",
      resultIds: ["res-ui-audit-result-detail-guard"],
    });
    const result = resultFixture({ id: "res-ui-audit-result-detail-guard", objectiveId: objective.id, title: "审计 详情页越权指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, observerUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}/results/${result.id}`);
    await expect(page.getByRole("heading", { name: result.title })).toBeVisible();
    await attachAuditScreenshot(page, testInfo, "audit-result-detail-non-challenger");
    await expect.soft(page.getByRole("button", { name: "创建行动项" })).toHaveCount(0);
    await expect.soft(page.getByRole("button", { name: "提出指标更新" })).toHaveCount(0);
    await expect.soft(page.getByRole("slider")).toHaveCount(0);
  });

  test("mobile challenge workbench has no page-level horizontal overflow", async ({ page }, testInfo) => {
    const objective = objectiveFixture({
      id: "obj-ui-audit-mobile-overflow",
      title: "审计 移动端超长目标标题用于验证布局不会横向溢出",
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: [memberUser.name],
      confirmationDueAt: "2999-01-01T00:00:00.000Z",
      resultIds: ["res-ui-audit-mobile-overflow"],
    });
    const result = resultFixture({
      id: "res-ui-audit-mobile-overflow",
      objectiveId: objective.id,
      title: "审计 移动端超长指标标题用于检查按钮、状态、进度和日期是否撑破视口",
    });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await page.setViewportSize({ width: 390, height: 844 });
    await mockOrfApp(page, memberUser, data, { mineChallenges: () => data, tasks: () => data });

    await page.goto("/tasks");
    await expect(objectivePanel(page, objective.title)).toBeVisible();
    await attachAuditScreenshot(page, testInfo, "audit-mobile-workbench-overflow");
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
      return {
        bodyScrollWidth: body.scrollWidth,
        clientWidth: root.clientWidth,
        overflowingPx: scrollWidth - root.clientWidth,
        rootScrollWidth: root.scrollWidth,
      };
    });
    await expect.soft(metrics.overflowingPx, JSON.stringify(metrics)).toBeLessThanOrEqual(1);
  });
});

test("commander challenge page exposes only valid ORF flow actions", async ({ page }) => {
  const candidate = objectiveFixture({ id: "obj-ui-candidate", title: "前端测试 候选目标", flowStatus: "candidate", stage: "goalSetting" });
  const applying = objectiveFixture({
    id: "obj-ui-applying",
    title: "前端测试 等待审核目标",
    flowStatus: "applying",
    resultIds: ["res-ui-applying"],
    challengeApplications: [{ id: "app-ui-mia", applicant: memberUser.name, status: "pending", createdAt: "2026-05-18T08:00:00.000Z", decidedAt: null }],
  });
  const reestimating = objectiveFixture({
    id: "obj-ui-reestimating",
    title: "前端测试 重估目标",
    flowStatus: "reestimating",
    stage: "orfReestimate",
    resultIds: ["res-ui-reestimating"],
    challengers: [memberUser.name],
    confirmationDueAt: "2999-01-01T00:00:00.000Z",
  });
  const frozen = objectiveFixture({
    id: "obj-ui-frozen",
    title: "前端测试 冻结目标",
    flowStatus: "frozen",
    stage: "goalFrozen",
    resultIds: ["res-ui-frozen"],
    challengers: [memberUser.name],
    confirmedAt: "2026-05-18T09:00:00.000Z",
  });
  const data = taskManagementData({
    objectives: [candidate, applying, reestimating, frozen],
    results: [
      resultFixture({ id: "res-ui-applying", objectiveId: applying.id, title: "前端测试 待审核指标" }),
      resultFixture({ id: "res-ui-reestimating", objectiveId: reestimating.id, title: "前端测试 重估指标" }),
      resultFixture({ id: "res-ui-frozen", objectiveId: frozen.id, title: "前端测试 冻结指标" }),
    ],
  });

  await mockOrfApp(page, adminUser, data, { allChallenges: data });

  await page.goto("/tasks");

  const candidatePanel = objectivePanel(page, candidate.title);
  await expect(candidatePanel.getByRole("button", { name: "发布" })).toBeVisible();

  const applyingPanel = objectivePanel(page, applying.title);
  await expect(applyingPanel.getByText("挑战申请")).toBeVisible();
  await expect(applyingPanel.getByText(memberUser.name)).toBeVisible();
  await expect(applyingPanel.getByRole("button", { name: "通过" })).toBeVisible();
  await expect(applyingPanel.getByRole("button", { name: "拒绝" })).toBeVisible();

  const reestimatingPanel = objectivePanel(page, reestimating.title);
  await expect(reestimatingPanel.getByText("重估中")).toBeVisible();
  await expect(reestimatingPanel.getByRole("button", { name: "冻结" })).toBeVisible();

  const frozenPanel = objectivePanel(page, frozen.title);
  await expect(frozenPanel.getByText("已冻结")).toBeVisible();
  await expect(frozenPanel.getByRole("button", { name: "重估" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重估" })).toHaveCount(0);
});

test("member challenge page stays scoped to own challenges and hides commander flow actions", async ({ page }) => {
  const activeMine = objectiveFixture({
    id: "obj-ui-member-active",
    title: "前端测试 成员重估目标",
    flowStatus: "reestimating",
    stage: "orfReestimate",
    resultIds: ["res-ui-member-active"],
    challengers: [memberUser.name],
    confirmationDueAt: "2999-01-01T00:00:00.000Z",
  });
  const frozenMine = objectiveFixture({
    id: "obj-ui-member-frozen",
    title: "前端测试 成员冻结目标",
    flowStatus: "frozen",
    stage: "goalFrozen",
    resultIds: ["res-ui-member-frozen"],
    challengers: [memberUser.name],
    confirmedAt: "2026-05-18T09:00:00.000Z",
  });
  const others = objectiveFixture({
    id: "obj-ui-other-frozen",
    title: "前端测试 他人冻结目标",
    flowStatus: "frozen",
    stage: "goalFrozen",
    resultIds: ["res-ui-other-frozen"],
    challengers: [observerUser.name],
    confirmedAt: "2026-05-18T09:00:00.000Z",
  });
  const allData = taskManagementData({
    objectives: [activeMine, frozenMine, others],
    results: [
      resultFixture({ id: "res-ui-member-active", objectiveId: activeMine.id, title: "前端测试 成员重估指标" }),
      resultFixture({ id: "res-ui-member-frozen", objectiveId: frozenMine.id, title: "前端测试 成员冻结指标" }),
      resultFixture({ id: "res-ui-other-frozen", objectiveId: others.id, title: "前端测试 他人冻结指标" }),
    ],
  });
  const mineData = {
    ...allData,
    objectives: [activeMine, frozenMine],
    results: allData.results.filter((result) => result.objectiveId !== others.id),
  };

  await mockOrfApp(page, memberUser, allData, { mineChallenges: mineData });

  await page.goto("/tasks");

  await expect(objectivePanel(page, activeMine.title)).toBeVisible();
  await expect(objectivePanel(page, frozenMine.title)).toBeVisible();
  await expect(page.getByText(others.title)).toHaveCount(0);

  await expect(page.getByRole("button", { name: "发布" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "冻结" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "通过" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "拒绝" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重估" })).toHaveCount(0);

  await expect(objectivePanel(page, frozenMine.title).getByRole("link", { name: "提交战利品" })).toBeVisible();
  await expect(objectivePanel(page, activeMine.title).getByRole("link", { name: "提交战利品" })).toHaveCount(0);
});

test("bounty hall apply action waits for API success and refreshed bounty data", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-apply",
    title: "前端测试 可申请目标",
    flowStatus: "open",
    stage: "resultClaiming",
    resultIds: ["res-ui-apply"],
  });
  const result = resultFixture({ id: "res-ui-apply", objectiveId: objective.id, title: "前端测试 可申请指标" });
  let taskData = taskManagementData({ objectives: [objective], results: [result] });
  let bountyData = bountyHallData([bountyHallItem(objective, [result])]);

  await mockOrfApp(page, observerUser, taskData, {
    bounties: () => bountyData,
    onApply: async () => {
      const nextObjective = {
        ...objective,
        flowStatus: "applying" as const,
        challengeApplications: [{ id: "app-ui-apply", applicant: observerUser.name, status: "pending" as const, createdAt: "2026-05-18T10:00:00.000Z", decidedAt: null }],
      };
      taskData = taskManagementData({ objectives: [nextObjective], results: [result] });
      bountyData = bountyHallData([bountyHallItem(nextObjective, [result], { hasCurrentApplication: true })]);
    },
    tasks: () => taskData,
  });

  await page.goto("/bounties");
  await expect(page.getByRole("heading", { name: objective.title })).toBeVisible();

  await page.getByRole("button", { name: "申请挑战" }).click();
  await expect(page.getByRole("dialog")).toContainText("提交后等待指挥官确认");

  await page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
  await expect(page.getByRole("button", { name: "已申请" })).toBeVisible();
  await expect(page.getByRole("button", { name: "已申请" })).toBeDisabled();
});

test("commander publishes a candidate objective and the bounty hall exposes it after refresh", async ({ page }) => {
  const candidate = objectiveFixture({
    id: "obj-ui-publish",
    title: "前端测试 发布候选目标",
    flowStatus: "candidate",
    stage: "goalSetting",
    resultIds: ["res-ui-publish"],
  });
  const result = resultFixture({ id: "res-ui-publish", objectiveId: candidate.id, title: "前端测试 发布候选指标" });
  let taskData = taskManagementData({ objectives: [candidate], results: [result] });
  let bountyData = bountyHallData([]);

  await mockOrfApp(page, adminUser, taskData, {
    allChallenges: () => taskData,
    bounties: () => bountyData,
    onPublish: async () => {
      const publishedObjective = {
        ...candidate,
        flowStatus: "open" as const,
        stage: "resultClaiming" as const,
      };
      taskData = taskManagementData({ objectives: [publishedObjective], results: [result] });
      bountyData = bountyHallData([bountyHallItem(publishedObjective, [result])]);
    },
    tasks: () => taskData,
  });

  await page.goto("/tasks");

  const panel = objectivePanel(page, candidate.title);
  await panel.getByRole("button", { name: "发布" }).click();
  await expect(panel.getByText("可申请")).toBeVisible();
  await expect(panel.getByRole("button", { name: "发布" })).toHaveCount(0);

  await page.goto("/bounties");
  await expect(page.getByRole("heading", { name: candidate.title })).toBeVisible();
  await expect(page.getByRole("button", { name: "申请挑战" })).toBeVisible();
});

test("bounty hall recruitment accept moves the member into reestimate after refreshed data", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-accept",
    title: "前端测试 征召目标",
    flowStatus: "recruiting",
    stage: "resultClaiming",
    assignedChallengers: [memberUser.name],
    resultIds: ["res-ui-accept"],
  });
  const result = resultFixture({ id: "res-ui-accept", objectiveId: objective.id, title: "前端测试 征召指标" });
  let taskData = taskManagementData({ objectives: [objective], results: [result] });
  let bountyData = bountyHallData([], [bountyHallItem(objective, [result], { isRecruitment: true })]);

  await mockOrfApp(page, memberUser, taskData, {
    bounties: () => bountyData,
    mineChallenges: () => taskData,
    onAccept: async () => {
      const nextObjective = {
        ...objective,
        flowStatus: "reestimating" as const,
        stage: "orfReestimate" as const,
        assignedChallengers: [],
        challengers: [memberUser.name],
        acceptedAt: "2026-05-18T10:20:00.000Z",
        confirmationDueAt: "2999-01-01T00:00:00.000Z",
      };
      taskData = taskManagementData({ objectives: [nextObjective], results: [result] });
      bountyData = bountyHallData([]);
    },
    tasks: () => taskData,
  });

  await page.goto("/bounties");
  await expect(page.getByRole("heading", { name: objective.title })).toBeVisible();

  await page.getByRole("button", { name: "接受挑战" }).click();
  await expect(page.getByRole("dialog")).toContainText("接受后会进入你的挑战页");

  await page.getByRole("dialog").getByRole("button", { name: "接受挑战" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(objectivePanel(page, objective.title)).toContainText("重估中");
  await expect(page.getByText(memberUser.name).first()).toBeVisible();
});

test("commander approval moves applying objective into reestimate from refreshed data", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-approve",
    title: "前端测试 审批通过目标",
    flowStatus: "applying",
    stage: "resultClaiming",
    resultIds: ["res-ui-approve"],
    challengeApplications: [{ id: "app-ui-approve", applicant: memberUser.name, status: "pending", createdAt: "2026-05-18T08:00:00.000Z", decidedAt: null }],
  });
  const result = resultFixture({ id: "res-ui-approve", objectiveId: objective.id, title: "前端测试 审批通过指标" });
  let data = taskManagementData({ objectives: [objective], results: [result] });

  await mockOrfApp(page, adminUser, data, {
    allChallenges: () => data,
    onApprove: async () => {
      const approvedObjective = {
        ...objective,
        flowStatus: "reestimating" as const,
        stage: "orfReestimate" as const,
        challengers: [memberUser.name],
        acceptedAt: "2026-05-18T10:30:00.000Z",
        confirmationDueAt: "2999-01-01T00:00:00.000Z",
        challengeApplications: objective.challengeApplications.map((application) => ({
          ...application,
          status: "approved" as const,
          decidedAt: "2026-05-18T10:30:00.000Z",
          decidedBy: adminUser.name,
        })),
      };
      data = taskManagementData({ objectives: [approvedObjective], results: [result] });
    },
    tasks: () => data,
  });

  await page.goto("/tasks");

  const panel = objectivePanel(page, objective.title);
  await panel.getByRole("button", { name: "通过" }).click();
  await expect(panel.getByText("挑战申请")).toHaveCount(0);
  await expect(panel.getByText("重估中")).toBeVisible();
  await expect(panel.getByRole("button", { name: "冻结" })).toBeVisible();
});

test("commander rejection clears pending application without reopening accepted challenges", async ({ page }) => {
  const acceptedApplication = { id: "app-ui-accepted", applicant: memberUser.name, status: "approved" as const, createdAt: "2026-05-18T08:00:00.000Z", decidedAt: "2026-05-18T09:00:00.000Z", decidedBy: adminUser.name };
  const pendingApplication = { id: "app-ui-pending", applicant: observerUser.name, status: "pending" as const, createdAt: "2026-05-18T09:30:00.000Z", decidedAt: null };
  const objective = objectiveFixture({
    id: "obj-ui-reject",
    title: "前端测试 拒绝申请目标",
    flowStatus: "reestimating",
    stage: "orfReestimate",
    resultIds: ["res-ui-reject"],
    challengers: [memberUser.name],
    confirmationDueAt: "2999-01-01T00:00:00.000Z",
    challengeApplications: [acceptedApplication, pendingApplication],
  });
  const result = resultFixture({ id: "res-ui-reject", objectiveId: objective.id, title: "前端测试 拒绝申请指标" });
  let data = taskManagementData({ objectives: [objective], results: [result] });

  await mockOrfApp(page, adminUser, data, {
    allChallenges: () => data,
    onReject: async () => {
      const rejectedObjective = {
        ...objective,
        flowStatus: "reestimating" as const,
        challengers: [memberUser.name],
        challengeApplications: objective.challengeApplications.map((application) =>
          application.id === pendingApplication.id
            ? { ...application, status: "declined" as const, decidedAt: "2026-05-18T10:40:00.000Z", decidedBy: adminUser.name }
            : application,
        ),
      };
      data = taskManagementData({ objectives: [rejectedObjective], results: [result] });
    },
    tasks: () => data,
  });

  await page.goto("/tasks");

  const panel = objectivePanel(page, objective.title);
  await expect(panel.getByText(observerUser.name)).toBeVisible();
  await panel.getByRole("button", { name: "拒绝" }).click();
  await expect(panel.getByText(observerUser.name)).toHaveCount(0);
  await expect(panel.getByText("重估中")).toBeVisible();
  await expect(panel.getByRole("button", { name: "冻结" })).toBeVisible();
});

test("commander freeze waits for refreshed frozen data and removes reopen affordances", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-freeze",
    title: "前端测试 冻结交互目标",
    flowStatus: "reestimating",
    stage: "orfReestimate",
    resultIds: ["res-ui-freeze"],
    challengers: [memberUser.name],
    confirmationDueAt: "2999-01-01T00:00:00.000Z",
  });
  const result = resultFixture({ id: "res-ui-freeze", objectiveId: objective.id, title: "前端测试 冻结交互指标" });
  let data = taskManagementData({ objectives: [objective], results: [result] });

  await mockOrfApp(page, adminUser, data, {
    allChallenges: () => data,
    onFreeze: async () => {
      const frozenObjective = {
        ...objective,
        flowStatus: "frozen" as const,
        stage: "goalFrozen" as const,
        confirmationDueAt: null,
        confirmedAt: "2026-05-18T11:00:00.000Z",
      };
      data = taskManagementData({ objectives: [frozenObjective], results: [result] });
    },
    tasks: () => data,
  });

  await page.goto("/tasks");

  const panel = objectivePanel(page, objective.title);
  await panel.getByRole("button", { name: "冻结" }).click();
  await expect(panel.getByText("已冻结")).toBeVisible();
  await expect(panel.getByRole("button", { name: "冻结" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "重估" })).toHaveCount(0);
});

test("commander freeze failure keeps reestimate state from refreshed API data", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-freeze-fail",
    title: "前端测试 冻结失败目标",
    flowStatus: "reestimating",
    stage: "orfReestimate",
    resultIds: ["res-ui-freeze-fail"],
    challengers: [memberUser.name],
    confirmationDueAt: "2999-01-01T00:00:00.000Z",
  });
  const result = resultFixture({ id: "res-ui-freeze-fail", objectiveId: objective.id, title: "前端测试 冻结失败指标" });
  const data = taskManagementData({ objectives: [objective], results: [result] });

  await mockOrfApp(page, adminUser, data, {
    allChallenges: () => data,
    onFreeze: async () => ({ status: 409, json: { error: "Objective status does not allow this operation" } }),
    tasks: () => data,
  });

  await page.goto("/tasks");

  const panel = objectivePanel(page, objective.title);
  await panel.getByRole("button", { name: "冻结" }).click();
  await expect(panel.getByText("重估中")).toBeVisible();
  await expect(panel.getByRole("button", { name: "冻结" })).toBeVisible();
  await expect(page.getByText("Objective status does not allow this operation")).toBeVisible();
});

test("member can submit loot only after frozen objective and returns to challenges after refresh", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-loot-submit",
    title: "前端测试 战利品提交目标",
    flowStatus: "frozen",
    stage: "goalFrozen",
    resultIds: ["res-ui-loot-submit"],
    challengers: [memberUser.name],
    confirmedAt: "2026-05-18T11:10:00.000Z",
  });
  const result = resultFixture({ id: "res-ui-loot-submit", objectiveId: objective.id, title: "前端测试 战利品提交指标" });
  let data = taskManagementData({ objectives: [objective], results: [result] });

  await mockOrfApp(page, memberUser, data, {
    mineChallenges: () => data,
    onSubmitLoot: async () => {
      const submittedObjective = {
        ...objective,
        flowStatus: "submitted" as const,
        lootSubmittedAt: "2026-05-18T11:20:00.000Z",
      };
      const loot = objectiveLootFixture({
        id: "loot-ui-submit",
        objectiveId: objective.id,
        submittedBy: memberUser.name,
        body: "提交前端 E2E 验证战利品。",
        resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "E2E evidence link" }],
      });
      data = taskManagementData({ objectives: [submittedObjective], results: [result], objectiveLoot: [loot] });
    },
    tasks: () => data,
  });

  await page.goto(`/objectives/${objective.id}/loot`);
  await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();

  await page.getByLabel("完成说明").fill("提交前端 E2E 验证战利品。");
  await page.getByPlaceholder("证据、数据或链接").fill("E2E evidence link");
  await page.getByLabel("自测报告").fill("自测摘要：前端流程通过。");
  await page.getByRole("button", { name: "提交" }).click();

  await expect(page).toHaveURL(/\/tasks$/);
  await expect(objectivePanel(page, objective.title)).toContainText("待验收");
  await expect(objectivePanel(page, objective.title).getByRole("link", { name: "提交战利品" })).toHaveCount(0);
});

test("commander reviews submitted loot and sees settled points after refreshed data", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-loot-review",
    title: "前端测试 验收结算目标",
    flowStatus: "submitted",
    stage: "goalFrozen",
    resultIds: ["res-ui-loot-review"],
    challengers: [memberUser.name],
    lootSubmittedAt: "2026-05-18T11:30:00.000Z",
    objectiveBasePoints: 100,
  });
  const result = resultFixture({ id: "res-ui-loot-review", objectiveId: objective.id, title: "前端测试 验收结算指标" });
  const loot = objectiveLootFixture({
    id: "loot-ui-review",
    objectiveId: objective.id,
    submittedBy: memberUser.name,
    body: "请验收前端 E2E 战利品。",
    resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "review evidence" }],
  });
  let data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot] });

  await mockOrfApp(page, adminUser, data, {
    allChallenges: () => data,
    onReviewLoot: async () => {
      const settledObjective = {
        ...objective,
        flowStatus: "settled" as const,
        acceptedResult: "completed" as const,
        objectiveSettlementPoints: 100,
      };
      const settledResult = { ...result, acceptedResult: "completed" as const };
      const ledger = pointLedgerFixture({ id: "ledger-ui-review", objectiveId: objective.id, memberName: memberUser.name, points: 100, reason: "完成目标" });
      data = taskManagementData({ objectives: [settledObjective], results: [settledResult], objectiveLoot: [loot], pointLedger: [ledger] });
    },
    tasks: () => data,
  });

  await page.goto(`/objectives/${objective.id}/loot`);
  await expect(page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
  await expect(page.getByText("请验收前端 E2E 战利品。")).toBeVisible();

  await page.getByLabel("验收说明").fill("验收通过，计入积分。");
  await page.getByRole("button", { name: "验收并结算" }).click();

  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByLabel(memberUser.name).first()).toBeVisible();
  await expect(page.getByLabel("100 积分")).toBeVisible();
});

test("member reestimate metric proposal uses the member-proposed interaction contract", async ({ page }) => {
  const objective = objectiveFixture({
    id: "obj-ui-member-metric",
    title: "前端测试 成员提指标目标",
    flowStatus: "reestimating",
    stage: "orfReestimate",
    challengers: [memberUser.name],
    confirmationDueAt: "2999-01-01T00:00:00.000Z",
  });
  let createPayload: unknown = null;
  let data = taskManagementData({ objectives: [objective], results: [] });

  await mockOrfApp(page, memberUser, data, {
    mineChallenges: () => data,
    onCreateResult: async (payload) => {
      createPayload = payload;
      const createdResult = resultFixture({
        id: "res-ui-member-metric",
        objectiveId: objective.id,
        title: "前端测试 成员候选指标",
        source: "memberProposed",
        definer: memberUser.name,
      });
      data = taskManagementData({ objectives: [{ ...objective, resultIds: [createdResult.id] }], results: [createdResult] });
    },
    tasks: () => data,
  });

  await page.goto("/tasks");
  const panel = objectivePanel(page, objective.title);
  await panel.hover();
  await panel.getByRole("button", { name: "提出指标" }).click();

  await expect(page.getByText("提出指标")).toBeVisible();
  await page.getByLabel("指标标题").fill("前端测试 成员候选指标");
  await page.getByLabel("衡量指标").fill("候选指标");
  await page.getByRole("button", { name: "提交指标" }).click();

  await expect.poll(() => createPayload).toMatchObject({ objectiveId: objective.id, source: "memberProposed", definer: memberUser.name });
  await expect(objectivePanel(page, objective.title)).toContainText("前端测试 成员候选指标");
});

test.describe("ORF frontend guard coverage", () => {
  test("commander publish failure keeps candidate state", async ({ page }) => {
    const candidate = objectiveFixture({ id: "obj-ui-publish-fail", title: "前端测试 发布失败目标", flowStatus: "candidate", stage: "goalSetting" });
    const data = taskManagementData({ objectives: [candidate], results: [] });

    await mockOrfApp(page, adminUser, data, {
      allChallenges: () => data,
      onPublish: async () => ({ status: 409, json: { error: "publish rejected" } }),
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, candidate.title);
    await panel.getByRole("button", { name: "发布" }).click();

    await expect(panel.getByText("候选中")).toBeVisible();
    await expect(panel.getByRole("button", { name: "发布" })).toBeVisible();
    await expect(page.getByText("publish rejected")).toBeVisible();
  });

  test("bounty hall apply failure keeps apply action available", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-apply-fail", title: "前端测试 申请失败目标", flowStatus: "open", resultIds: ["res-ui-apply-fail"] });
    const result = resultFixture({ id: "res-ui-apply-fail", objectiveId: objective.id, title: "前端测试 申请失败指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, observerUser, data, {
      bounties: bountyHallData([bountyHallItem(objective, [result])]),
      onApply: async () => ({ status: 500, json: { error: "apply rejected" } }),
      tasks: () => data,
    });

    await page.goto("/bounties");
    await page.getByRole("button", { name: "申请挑战" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();

    await expect(page.getByText("apply rejected")).toBeVisible();
    await expect(page.getByRole("button", { name: "已申请" })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("button", { name: "申请挑战" })).toBeEnabled();
  });

  test("recruitment accept failure keeps recruitment item visible", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-accept-fail",
      title: "前端测试 接受征召失败目标",
      flowStatus: "recruiting",
      assignedChallengers: [memberUser.name],
      resultIds: ["res-ui-accept-fail"],
    });
    const result = resultFixture({ id: "res-ui-accept-fail", objectiveId: objective.id, title: "前端测试 接受征召失败指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, memberUser, data, {
      bounties: bountyHallData([], [bountyHallItem(objective, [result], { isRecruitment: true })]),
      onAccept: async () => ({ status: 500, json: { error: "accept rejected" } }),
      tasks: () => data,
    });

    await page.goto("/bounties");
    await page.getByRole("button", { name: "接受挑战" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "接受挑战" }).click();

    await expect(page).toHaveURL(/\/bounties$/);
    await expect(page.getByText("accept rejected")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "接受挑战" })).toBeEnabled();
  });

  test("application approval failure keeps pending review strip", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-approve-fail",
      title: "前端测试 审批失败目标",
      flowStatus: "applying",
      resultIds: ["res-ui-approve-fail"],
      challengeApplications: [{ id: "app-ui-approve-fail", applicant: memberUser.name, status: "pending", createdAt: "2026-05-18T08:00:00.000Z", decidedAt: null }],
    });
    const result = resultFixture({ id: "res-ui-approve-fail", objectiveId: objective.id, title: "前端测试 审批失败指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, adminUser, data, {
      allChallenges: () => data,
      onApprove: async () => ({ status: 409, json: { error: "approval rejected" } }),
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, objective.title);
    await panel.getByRole("button", { name: "通过" }).click();

    await expect(panel.getByText("挑战申请")).toBeVisible();
    await expect(panel.getByText(memberUser.name)).toBeVisible();
    await expect(panel.getByText("重估中")).toHaveCount(0);
    await expect(page.getByText("approval rejected")).toBeVisible();
  });

  test("application rejection failure keeps pending applicant visible", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-reject-fail",
      title: "前端测试 拒绝失败目标",
      flowStatus: "applying",
      resultIds: ["res-ui-reject-fail"],
      challengeApplications: [{ id: "app-ui-reject-fail", applicant: observerUser.name, status: "pending", createdAt: "2026-05-18T08:00:00.000Z", decidedAt: null }],
    });
    const result = resultFixture({ id: "res-ui-reject-fail", objectiveId: objective.id, title: "前端测试 拒绝失败指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, adminUser, data, {
      allChallenges: () => data,
      onReject: async () => ({ status: 409, json: { error: "rejection rejected" } }),
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, objective.title);
    await panel.getByRole("button", { name: "拒绝" }).click();

    await expect(panel.getByText("挑战申请")).toBeVisible();
    await expect(panel.getByText(observerUser.name)).toBeVisible();
    await expect(page.getByText("rejection rejected")).toBeVisible();
  });

  test("loot submit failure stays on form and keeps frozen state", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-loot-submit-fail",
      title: "前端测试 战利品提交失败目标",
      flowStatus: "frozen",
      stage: "goalFrozen",
      challengers: [memberUser.name],
      resultIds: ["res-ui-loot-submit-fail"],
    });
    const result = resultFixture({ id: "res-ui-loot-submit-fail", objectiveId: objective.id, title: "前端测试 战利品提交失败指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, memberUser, data, {
      mineChallenges: () => data,
      onSubmitLoot: async () => ({ status: 500, json: { error: "loot submit rejected" } }),
      tasks: () => data,
    });

    await page.goto(`/objectives/${objective.id}/loot`);
    await page.getByLabel("完成说明").fill("失败路径提交说明");
    await page.getByPlaceholder("证据、数据或链接").fill("failure evidence");
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page).toHaveURL(new RegExp(`/objectives/${objective.id}/loot$`));
    await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
    await expect(page.getByText("loot submit rejected")).toBeVisible();
  });

  test("loot review failure stays on review form without points", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-review-fail",
      title: "前端测试 验收失败目标",
      flowStatus: "submitted",
      stage: "goalFrozen",
      challengers: [memberUser.name],
      resultIds: ["res-ui-review-fail"],
      lootSubmittedAt: "2026-05-18T11:30:00.000Z",
    });
    const result = resultFixture({ id: "res-ui-review-fail", objectiveId: objective.id, title: "前端测试 验收失败指标" });
    const loot = objectiveLootFixture({ id: "loot-ui-review-fail", objectiveId: objective.id, submittedBy: memberUser.name, body: "待验收但会失败", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "evidence" }] });
    const data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot] });

    await mockOrfApp(page, adminUser, data, {
      allChallenges: () => data,
      onReviewLoot: async () => ({ status: 500, json: { error: "review rejected" } }),
      tasks: () => data,
    });

    await page.goto(`/objectives/${objective.id}/loot`);
    await page.getByLabel("验收说明").fill("失败路径验收说明");
    await page.getByRole("button", { name: "验收并结算" }).click();

    await expect(page).toHaveURL(new RegExp(`/objectives/${objective.id}/loot$`));
    await expect(page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
    await expect(page.getByText("review rejected")).toBeVisible();
    await expect(page.getByLabel("100 积分")).toHaveCount(0);
  });

  test("member proposed metric failure does not append result", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-proposed-fail",
      title: "前端测试 候选指标失败目标",
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: [memberUser.name],
      confirmationDueAt: "2999-01-01T00:00:00.000Z",
    });
    const data = taskManagementData({ objectives: [objective], results: [] });

    await mockOrfApp(page, memberUser, data, {
      mineChallenges: () => data,
      onCreateResult: async () => ({ status: 500, json: { error: "proposed metric rejected" } }),
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, objective.title);
    await panel.hover();
    await panel.getByRole("button", { name: "提出指标" }).click();

    await expect(page.getByText("提出指标")).toBeVisible();
    await page.getByLabel("指标标题").fill("前端测试 不应出现的候选指标");
    await page.getByRole("button", { name: "提交指标" }).click();
    await expect(page.getByText("proposed metric rejected")).toBeVisible();
    await expect(panel.getByText("前端测试 不应出现的候选指标")).toHaveCount(0);
  });

  test("member direct review page cannot settle submitted loot", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-member-review-denied",
      title: "前端测试 成员不能验收目标",
      flowStatus: "submitted",
      stage: "goalFrozen",
      challengers: [memberUser.name],
      resultIds: ["res-ui-member-review-denied"],
      lootSubmittedAt: "2026-05-18T11:30:00.000Z",
    });
    const result = resultFixture({ id: "res-ui-member-review-denied", objectiveId: objective.id, title: "前端测试 成员不能验收指标" });
    const loot = objectiveLootFixture({ id: "loot-ui-member-review-denied", objectiveId: objective.id, submittedBy: memberUser.name, body: "成员不能验收", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "evidence" }] });
    const data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot] });

    await mockOrfApp(page, memberUser, data, { mineChallenges: () => data, tasks: () => data });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByRole("heading", { name: "验收战利品" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "验收并结算" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
    await expect(page.getByRole("button", { name: "提交匿名互评" })).toBeEnabled();
  });

  test("observer direct loot page cannot submit frozen objective", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-observer-loot-denied",
      title: "前端测试 旁观者不能提交目标",
      flowStatus: "frozen",
      stage: "goalFrozen",
      challengers: [memberUser.name],
      resultIds: ["res-ui-observer-loot-denied"],
    });
    const result = resultFixture({ id: "res-ui-observer-loot-denied", objectiveId: objective.id, title: "前端测试 旁观者不能提交指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, observerUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
    await expect(page.getByRole("button", { name: "提交" })).toBeDisabled();
  });

  test("member never sees commander flow actions with full data", async ({ page }) => {
    const candidate = objectiveFixture({ id: "obj-ui-member-full-candidate", title: "前端测试 成员全量候选目标", flowStatus: "candidate", stage: "goalSetting" });
    const applying = objectiveFixture({
      id: "obj-ui-member-full-applying",
      title: "前端测试 成员全量申请目标",
      flowStatus: "applying",
      challengeApplications: [{ id: "app-ui-member-full", applicant: observerUser.name, status: "pending", createdAt: "2026-05-18T08:00:00.000Z", decidedAt: null }],
    });
    const reestimating = objectiveFixture({ id: "obj-ui-member-full-reestimating", title: "前端测试 成员全量重估目标", flowStatus: "reestimating", stage: "orfReestimate", challengers: [memberUser.name], confirmationDueAt: "2999-01-01T00:00:00.000Z" });
    const data = taskManagementData({ objectives: [candidate, applying, reestimating], results: [] });

    await mockOrfApp(page, memberUser, data, { mineChallenges: () => data, tasks: () => data });

    await page.goto("/tasks");
    await expect(page.getByRole("button", { name: "发布" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "通过" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "拒绝" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "冻结" })).toHaveCount(0);
  });

  test("commander cannot submit loot unless also challenger", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-commander-submit-denied",
      title: "前端测试 指挥官不能代交目标",
      flowStatus: "frozen",
      stage: "goalFrozen",
      challengers: [memberUser.name],
      resultIds: ["res-ui-commander-submit-denied"],
    });
    const result = resultFixture({ id: "res-ui-commander-submit-denied", objectiveId: objective.id, title: "前端测试 指挥官不能代交指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, adminUser, data, { allChallenges: () => data, tasks: () => data });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
    await expect(page.getByRole("button", { name: "提交" })).toBeDisabled();
  });

  test("loot entry is visible only to current challenger", async ({ page }) => {
    const mine = objectiveFixture({ id: "obj-ui-loot-entry-mine", title: "前端测试 我的提交入口目标", flowStatus: "frozen", stage: "goalFrozen", challengers: [memberUser.name], resultIds: ["res-ui-loot-entry-mine"] });
    const other = objectiveFixture({ id: "obj-ui-loot-entry-other", title: "前端测试 他人提交入口目标", flowStatus: "frozen", stage: "goalFrozen", challengers: [observerUser.name], resultIds: ["res-ui-loot-entry-other"] });
    const mineResult = resultFixture({ id: "res-ui-loot-entry-mine", objectiveId: mine.id, title: "前端测试 我的提交入口指标" });
    const otherResult = resultFixture({ id: "res-ui-loot-entry-other", objectiveId: other.id, title: "前端测试 他人提交入口指标" });
    const data = taskManagementData({
      objectives: [mine, other],
      results: [mineResult, otherResult],
    });
    const mineData = taskManagementData({
      objectives: [mine],
      results: [mineResult],
    });

    await mockOrfApp(page, memberUser, data, { mineChallenges: () => mineData, tasks: () => data });

    await page.goto("/tasks");
    await expect(objectivePanel(page, mine.title).getByRole("link", { name: "提交战利品" })).toBeVisible();
    await expect(objectivePanel(page, other.title).getByRole("link", { name: "提交战利品" })).toHaveCount(0);
  });

  test("member can propose metric before reestimate deadline", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-before-deadline",
      title: "前端测试 截止前提指标目标",
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: [memberUser.name],
      confirmationDueAt: "2999-01-01T00:00:00.000Z",
    });
    let payload: unknown = null;
    let data = taskManagementData({ objectives: [objective], results: [] });

    await mockOrfApp(page, memberUser, data, {
      mineChallenges: () => data,
      onCreateResult: async (body) => {
        payload = body;
        const created = resultFixture({ id: "res-ui-before-deadline", objectiveId: objective.id, title: "前端测试 截止前候选指标", source: "memberProposed", definer: memberUser.name });
        data = taskManagementData({ objectives: [{ ...objective, resultIds: [created.id] }], results: [created] });
      },
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, objective.title);
    await panel.hover();
    await panel.getByRole("button", { name: "提出指标" }).click();
    await expect(page.getByText("提出指标")).toBeVisible();
    await page.getByLabel("指标标题").fill("前端测试 截止前候选指标");
    await page.getByRole("button", { name: "提交指标" }).click();

    await expect.poll(() => payload).toMatchObject({ source: "memberProposed" });
  });

  test("member cannot propose metric after reestimate deadline", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-after-deadline",
      title: "前端测试 截止后提指标目标",
      flowStatus: "reestimating",
      stage: "orfReestimate",
      challengers: [memberUser.name],
      confirmationDueAt: "2000-01-01T00:00:00.000Z",
    });
    let postCount = 0;
    const data = taskManagementData({ objectives: [objective], results: [] });

    await mockOrfApp(page, memberUser, data, {
      mineChallenges: () => data,
      onCreateResult: () => {
        postCount += 1;
      },
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, objective.title);
    await panel.hover();

    await expect(panel.getByRole("button", { name: "提出指标" })).toHaveCount(0);
    await expect(page.getByText("新增指标")).toHaveCount(0);
    await expect.poll(() => postCount).toBe(0);
  });

  test("member cannot adjust metrics after objective frozen", async ({ page }) => {
    const objective = objectiveFixture({
      id: "obj-ui-frozen-adjust-denied",
      title: "前端测试 冻结后提指标目标",
      flowStatus: "frozen",
      stage: "goalFrozen",
      challengers: [memberUser.name],
    });
    let postCount = 0;
    const data = taskManagementData({ objectives: [objective], results: [] });

    await mockOrfApp(page, memberUser, data, {
      mineChallenges: () => data,
      onCreateResult: () => {
        postCount += 1;
      },
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, objective.title);
    await panel.hover();

    await expect(panel.getByRole("button", { name: "提出指标" })).toHaveCount(0);
    await expect.poll(() => postCount).toBe(0);
  });

  test("member metric proposal is limited to active reestimate", async ({ page }) => {
    const statuses = [
      objectiveFixture({ id: "obj-ui-metric-candidate", title: "前端测试 候选不能提指标", flowStatus: "candidate", stage: "goalSetting" }),
      objectiveFixture({ id: "obj-ui-metric-open", title: "前端测试 可申请不能提指标", flowStatus: "open" }),
      objectiveFixture({ id: "obj-ui-metric-applying", title: "前端测试 申请中不能提指标", flowStatus: "applying", challengeApplications: [{ id: "app-ui-metric", applicant: memberUser.name, status: "pending", createdAt: "2026-05-18T08:00:00.000Z", decidedAt: null }] }),
      objectiveFixture({ id: "obj-ui-metric-recruiting", title: "前端测试 征召中不能提指标", flowStatus: "recruiting", assignedChallengers: [memberUser.name] }),
    ];
    let postCount = 0;
    const data = taskManagementData({ objectives: statuses, results: [] });

    await mockOrfApp(page, memberUser, data, {
      mineChallenges: () => data,
      onCreateResult: () => {
        postCount += 1;
      },
      tasks: () => data,
    });

    await page.goto("/tasks");
    for (const objective of statuses) {
      await expect(page.getByText(objective.title)).toHaveCount(0);
    }

    await expect.poll(() => postCount).toBe(0);
  });

  test("loot form requires body before submit", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-loot-empty-body", title: "前端测试 空战利品目标", flowStatus: "frozen", stage: "goalFrozen", challengers: [memberUser.name], resultIds: ["res-ui-loot-empty-body"] });
    const result = resultFixture({ id: "res-ui-loot-empty-body", objectiveId: objective.id, title: "前端测试 空战利品指标" });
    let postCount = 0;
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, memberUser, data, {
      onSubmitLoot: () => {
        postCount += 1;
      },
      tasks: () => data,
    });

    await page.goto(`/objectives/${objective.id}/loot`);
    await page.getByRole("button", { name: "提交" }).click();
    await expect(page.getByText("请填写完成说明")).toBeVisible();
    await expect.poll(() => postCount).toBe(0);
  });

  test("loot form rejects frozen objective without results", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-loot-no-results", title: "前端测试 无指标战利品目标", flowStatus: "frozen", stage: "goalFrozen", challengers: [memberUser.name], resultIds: [] });
    let postCount = 0;
    const data = taskManagementData({ objectives: [objective], results: [] });

    await mockOrfApp(page, memberUser, data, {
      onSubmitLoot: () => {
        postCount += 1;
      },
      tasks: () => data,
    });

    await page.goto(`/objectives/${objective.id}/loot`);
    await page.getByLabel("完成说明").fill("没有指标也不能提交");
    await page.getByRole("button", { name: "提交" }).click();
    await expect(page.getByText("这个目标没有可验收的指标")).toBeVisible();
    await expect.poll(() => postCount).toBe(0);
  });

  test("review page rejects submitted objective without latest loot", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-review-no-loot", title: "前端测试 无战利品验收目标", flowStatus: "submitted", stage: "goalFrozen", challengers: [memberUser.name], resultIds: ["res-ui-review-no-loot"] });
    const result = resultFixture({ id: "res-ui-review-no-loot", objectiveId: objective.id, title: "前端测试 无战利品验收指标" });
    let reviewCount = 0;
    const data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [] });

    await mockOrfApp(page, adminUser, data, {
      onReviewLoot: () => {
        reviewCount += 1;
      },
      tasks: () => data,
    });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByRole("button", { name: "验收并结算" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "提交" })).toBeDisabled();
    await expect.poll(() => reviewCount).toBe(0);
  });

  test("challenge confirm cancel does not call mutation API", async ({ page }) => {
    const applyObjective = objectiveFixture({ id: "obj-ui-cancel-apply", title: "前端测试 取消申请目标", flowStatus: "open", resultIds: ["res-ui-cancel-apply"] });
    const acceptObjective = objectiveFixture({ id: "obj-ui-cancel-accept", title: "前端测试 取消接受目标", flowStatus: "recruiting", assignedChallengers: [memberUser.name], resultIds: ["res-ui-cancel-accept"] });
    const applyResult = resultFixture({ id: "res-ui-cancel-apply", objectiveId: applyObjective.id, title: "前端测试 取消申请指标" });
    const acceptResult = resultFixture({ id: "res-ui-cancel-accept", objectiveId: acceptObjective.id, title: "前端测试 取消接受指标" });
    let mutationCount = 0;
    const data = taskManagementData({ objectives: [applyObjective, acceptObjective], results: [applyResult, acceptResult] });

    await mockOrfApp(page, memberUser, data, {
      bounties: bountyHallData([bountyHallItem(applyObjective, [applyResult])], [bountyHallItem(acceptObjective, [acceptResult], { isRecruitment: true })]),
      onAccept: () => {
        mutationCount += 1;
      },
      onApply: () => {
        mutationCount += 1;
      },
      tasks: () => data,
    });

    await page.goto("/bounties");
    await page.getByRole("button", { name: "申请挑战" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
    await page.getByRole("button", { name: "接受挑战" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();

    await expect.poll(() => mutationCount).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("member proposed metric modal close does not mutate data", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-proposed-close", title: "前端测试 关闭候选指标目标", flowStatus: "reestimating", stage: "orfReestimate", challengers: [memberUser.name], confirmationDueAt: "2999-01-01T00:00:00.000Z" });
    let postCount = 0;
    const data = taskManagementData({ objectives: [objective], results: [] });

    await mockOrfApp(page, memberUser, data, {
      mineChallenges: () => data,
      onCreateResult: () => {
        postCount += 1;
      },
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, objective.title);
    await panel.hover();
    await panel.getByRole("button", { name: "提出指标" }).click();
    await expect(page.getByText("提出指标")).toBeVisible();
    await page.getByRole("button").filter({ has: page.locator("svg") }).last().click();
    await expect(page.getByText("提出指标")).toHaveCount(0);
    await expect.poll(() => postCount).toBe(0);
  });

  test("multiple challengers see their own frozen loot entry", async ({ browser }) => {
    const objective = objectiveFixture({ id: "obj-ui-multi-loot-entry", title: "前端测试 多挑战者提交入口目标", flowStatus: "frozen", stage: "goalFrozen", challengers: [memberUser.name, observerUser.name], resultIds: ["res-ui-multi-loot-entry"] });
    const result = resultFixture({ id: "res-ui-multi-loot-entry", objectiveId: objective.id, title: "前端测试 多挑战者提交入口指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });
    const context = await browser.newContext();
    const miaPage = await context.newPage();
    const ethanPage = await context.newPage();
    await miaPage.addInitScript(() => window.localStorage.clear());
    await ethanPage.addInitScript(() => window.localStorage.clear());

    await mockOrfApp(miaPage, memberUser, data, { mineChallenges: () => data, tasks: () => data });
    await mockOrfApp(ethanPage, observerUser, data, { mineChallenges: () => data, tasks: () => data });

    await miaPage.goto("/tasks");
    await ethanPage.goto("/tasks");
    await expect(objectivePanel(miaPage, objective.title).getByRole("link", { name: "提交战利品" })).toBeVisible();
    await expect(objectivePanel(ethanPage, objective.title).getByRole("link", { name: "提交战利品" })).toBeVisible();
    await context.close();
  });

  test("review form uses peer review contribution results", async ({ page }) => {
    const objective = submittedObjectiveFixture("obj-ui-multi-review-inputs", "前端测试 多人验收互评目标", [memberUser.name, observerUser.name], ["res-ui-multi-review-inputs"]);
    const result = resultFixture({ id: "res-ui-multi-review-inputs", objectiveId: objective.id, title: "前端测试 多人验收互评指标" });
    const loot = objectiveLootFixture({ id: "loot-ui-multi-review-inputs", objectiveId: objective.id, submittedBy: memberUser.name, body: "多人验收", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "evidence" }] });
    const contributionReviews = [
      contributionReviewFixture({ id: "review-ui-mia", objectiveId: objective.id, reviewer: memberUser.name, allocations: [{ member: memberUser.name, ratio: 1 }, { member: observerUser.name, ratio: 1 }] }),
      contributionReviewFixture({ id: "review-ui-ethan", objectiveId: objective.id, reviewer: observerUser.name, allocations: [{ member: memberUser.name, ratio: 1 }, { member: observerUser.name, ratio: 1 }] }),
    ];
    const data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot], objectiveContributionReviews: contributionReviews });

    await mockOrfApp(page, adminUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByText("匿名互评贡献结果")).toBeVisible();
    await expect(page.getByText(memberUser.name)).toBeVisible();
    await expect(page.getByText(observerUser.name)).toBeVisible();
    await expect(page.getByText("50%")).toHaveCount(2);
    await expect(page.getByLabel(`${memberUser.name} 处理后贡献比例`)).toHaveCount(0);
  });

  test("multi challenger settlement updates leaderboard by contribution ratios", async ({ page }) => {
    const objective = submittedObjectiveFixture("obj-ui-multi-settlement", "前端测试 多人结算目标", [memberUser.name, observerUser.name], ["res-ui-multi-settlement"]);
    const result = resultFixture({ id: "res-ui-multi-settlement", objectiveId: objective.id, title: "前端测试 多人结算指标" });
    const loot = objectiveLootFixture({ id: "loot-ui-multi-settlement", objectiveId: objective.id, submittedBy: memberUser.name, body: "多人结算", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "evidence" }] });
    const contributionReviews = [
      contributionReviewFixture({ id: "review-ui-settlement-mia", objectiveId: objective.id, reviewer: memberUser.name, allocations: [{ member: memberUser.name, ratio: 3 }, { member: observerUser.name, ratio: 1 }] }),
      contributionReviewFixture({ id: "review-ui-settlement-ethan", objectiveId: objective.id, reviewer: observerUser.name, allocations: [{ member: memberUser.name, ratio: 3 }, { member: observerUser.name, ratio: 1 }] }),
    ];
    let data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot], objectiveContributionReviews: contributionReviews });

    await mockOrfApp(page, adminUser, data, {
      onReviewLoot: async () => {
        const settled = { ...objective, flowStatus: "settled" as const, acceptedResult: "completed" as const, objectiveSettlementPoints: 100 };
        data = taskManagementData({
          objectives: [settled],
          results: [{ ...result, acceptedResult: "completed" as const }],
          objectiveLoot: [loot],
          objectiveContributionReviews: contributionReviews,
          pointLedger: [
            pointLedgerFixture({ id: "ledger-ui-multi-mia", objectiveId: objective.id, memberName: memberUser.name, points: 75, reason: "匿名互评贡献比例 75%" }),
            pointLedgerFixture({ id: "ledger-ui-multi-ethan", objectiveId: objective.id, memberName: observerUser.name, points: 25, reason: "匿名互评贡献比例 25%" }),
          ],
        });
      },
      tasks: () => data,
    });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByText("75%")).toBeVisible();
    await expect(page.getByText("25%")).toBeVisible();
    await expect(page.getByLabel(`${memberUser.name} 处理后贡献比例`)).toHaveCount(0);
    await page.getByRole("button", { name: "验收并结算" }).click();

    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByLabel("75 积分")).toBeVisible();
    await expect(page.getByLabel("25 积分")).toBeVisible();
  });

  test("review contribution form excludes non challengers", async ({ page }) => {
    const objective = submittedObjectiveFixture("obj-ui-review-excludes-observer", "前端测试 验收排除旁观者目标", [memberUser.name], ["res-ui-review-excludes-observer"]);
    const result = resultFixture({ id: "res-ui-review-excludes-observer", objectiveId: objective.id, title: "前端测试 验收排除旁观者指标" });
    const loot = objectiveLootFixture({ id: "loot-ui-review-excludes-observer", objectiveId: objective.id, submittedBy: memberUser.name, body: "排除旁观者", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "evidence" }] });
    const data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot] });

    await mockOrfApp(page, adminUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByText(memberUser.name)).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
    await expect(page.getByText(observerUser.name)).toHaveCount(0);
    await expect(page.getByLabel(`${observerUser.name} 处理后贡献比例`)).toHaveCount(0);
  });

  test("loot deep link opens submit form for frozen challenger", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-loot-submit-deep", title: "前端测试 战利品提交深链目标", flowStatus: "frozen", stage: "goalFrozen", challengers: [memberUser.name], resultIds: ["res-ui-loot-submit-deep"] });
    const result = resultFixture({ id: "res-ui-loot-submit-deep", objectiveId: objective.id, title: "前端测试 战利品提交深链指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, memberUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
    await expect(page.getByRole("button", { name: "提交" })).toBeEnabled();
  });

  test("loot deep link opens review form for commander on submitted objective", async ({ page }) => {
    const objective = submittedObjectiveFixture("obj-ui-loot-review-deep", "前端测试 战利品验收深链目标", [memberUser.name], ["res-ui-loot-review-deep"]);
    const result = resultFixture({ id: "res-ui-loot-review-deep", objectiveId: objective.id, title: "前端测试 战利品验收深链指标" });
    const loot = objectiveLootFixture({ id: "loot-ui-loot-review-deep", objectiveId: objective.id, submittedBy: memberUser.name, body: "深链验收", resultClaims: [{ resultId: result.id, claim: "completed", evidenceText: "evidence" }] });
    const data = taskManagementData({ objectives: [objective], results: [result], objectiveLoot: [loot] });

    await mockOrfApp(page, adminUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}/loot`);
    await expect(page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
    await expect(page.getByRole("button", { name: "验收并结算" })).toBeEnabled();
  });

  test("loot deep link redirects missing objective to challenges", async ({ page }) => {
    const data = taskManagementData({ objectives: [], results: [] });
    await mockOrfApp(page, memberUser, data, { tasks: () => data });

    await page.goto("/objectives/missing-objective/loot");
    await expect(page).toHaveURL(/\/tasks$/);
  });

  test("result detail loot entry follows objective flow permissions", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-result-detail-loot", title: "前端测试 Result 详情未冻结目标", flowStatus: "open", resultIds: ["res-ui-result-detail-loot"] });
    const result = resultFixture({ id: "res-ui-result-detail-loot", objectiveId: objective.id, title: "前端测试 Result 详情未冻结指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, observerUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}/results/${result.id}`);
    await expect(page.getByRole("link", { name: "提交目标战利品" })).toHaveCount(0);
  });

  test("objective detail metric entry follows reestimate proposal contract", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-objective-detail-proposal", title: "前端测试 Objective 详情候选指标目标", flowStatus: "reestimating", stage: "orfReestimate", challengers: [memberUser.name], confirmationDueAt: "2999-01-01T00:00:00.000Z" });
    const data = taskManagementData({ objectives: [objective], results: [] });

    await mockOrfApp(page, memberUser, data, { tasks: () => data });

    await page.goto(`/objectives/${objective.id}`);
    await expect(page.getByRole("button", { name: "提出指标" })).toBeVisible();
  });

  test("bounty hall renders loading and empty states", async ({ page }) => {
    const deferred = createDeferred<BountyHallData>();
    const data = taskManagementData({ objectives: [], results: [] });

    await mockOrfApp(page, memberUser, data, {
      bounties: () => deferred.promise,
      tasks: () => data,
    });

    await page.goto("/bounties");
    await expect(page.getByText("正在加载悬赏大厅")).toBeVisible();
    deferred.resolve(bountyHallData([]));
    await expect(page.getByText("当前没有可申请或待接受的悬赏目标")).toBeVisible();
  });

  test("bounty hall api failure does not show stale business data", async ({ page }) => {
    const data = taskManagementData({ objectives: [objectiveTemplate], results: [resultTemplate] });

    await mockOrfApp(page, memberUser, data, {
      bounties: { status: 500, json: { error: "bounties failed" } },
      tasks: () => data,
    });

    await page.goto("/bounties");
    await expect(page.getByText("当前没有可申请或待接受的悬赏目标")).toBeVisible();
    await expect(page.getByRole("heading", { name: objectiveTemplate.title })).toHaveCount(0);
  });

  test("challenge mutation button is disabled while processing", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-processing", title: "前端测试 处理中目标", flowStatus: "open", resultIds: ["res-ui-processing"] });
    const result = resultFixture({ id: "res-ui-processing", objectiveId: objective.id, title: "前端测试 处理中指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });
    const deferred = createDeferred<void>();

    await mockOrfApp(page, memberUser, data, {
      bounties: bountyHallData([bountyHallItem(objective, [result])]),
      onApply: async () => {
        await deferred.promise;
      },
      tasks: () => data,
    });

    await page.goto("/bounties");
    await page.getByRole("button", { name: "申请挑战" }).click();
    const confirmButton = page.getByRole("dialog").getByRole("button", { name: "申请挑战" });
    await confirmButton.click();
    await expect(confirmButton).toBeDisabled();
    deferred.resolve();
    await expect(confirmButton).toHaveCount(0);
  });

  test("business error toast can be dismissed", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-toast-dismiss", title: "前端测试 toast 关闭目标", flowStatus: "reestimating", stage: "orfReestimate", challengers: [memberUser.name], resultIds: ["res-ui-toast-dismiss"] });
    const result = resultFixture({ id: "res-ui-toast-dismiss", objectiveId: objective.id, title: "前端测试 toast 关闭指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });

    await mockOrfApp(page, adminUser, data, {
      allChallenges: () => data,
      onFreeze: async () => ({ status: 409, json: { error: "toast dismiss error" } }),
      tasks: () => data,
    });

    await page.goto("/tasks");
    await objectivePanel(page, objective.title).getByRole("button", { name: "冻结" }).click();
    const toast = toastByText(page, "toast dismiss error");
    await expect(toast).toBeVisible();
    await toast.locator("button").click();
    await expect(toast).toHaveCount(0);
  });

  test("successful mutation still trusts stale refresh response", async ({ page }) => {
    const candidate = objectiveFixture({ id: "obj-ui-stale-refresh", title: "前端测试 成功但刷新旧状态目标", flowStatus: "candidate", stage: "goalSetting" });
    const data = taskManagementData({ objectives: [candidate], results: [] });

    await mockOrfApp(page, adminUser, data, {
      allChallenges: () => data,
      onPublish: async () => undefined,
      tasks: () => data,
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, candidate.title);
    await panel.getByRole("button", { name: "发布" }).click();
    await expect(panel.getByText("候选中")).toBeVisible();
    await expect(panel.getByRole("button", { name: "发布" })).toBeVisible();
  });

  test("mutation success with refresh failure does not fabricate new state", async ({ page }) => {
    const candidate = objectiveFixture({ id: "obj-ui-refresh-fail", title: "前端测试 成功但刷新失败目标", flowStatus: "candidate", stage: "goalSetting" });
    const data = taskManagementData({ objectives: [candidate], results: [] });
    let tasksCallCount = 0;

    await mockOrfApp(page, adminUser, data, {
      allChallenges: () => data,
      onPublish: async () => undefined,
      tasks: () => {
        tasksCallCount += 1;
        return tasksCallCount > 1 ? { status: 500, json: { error: "refresh failed" } } : data;
      },
    });

    await page.goto("/tasks");
    const panel = objectivePanel(page, candidate.title);
    await panel.getByRole("button", { name: "发布" }).click();
    await expect(panel.getByText("候选中")).toBeVisible();
    await expect(panel.getByRole("button", { name: "发布" })).toBeVisible();
    await expect(page.getByText("refresh failed")).toBeVisible();
  });

  test("double click on ORF mutation does not duplicate requests", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-double-click", title: "前端测试 防重复点击目标", flowStatus: "open", resultIds: ["res-ui-double-click"] });
    const result = resultFixture({ id: "res-ui-double-click", objectiveId: objective.id, title: "前端测试 防重复点击指标" });
    const data = taskManagementData({ objectives: [objective], results: [result] });
    const deferred = createDeferred<void>();
    let applyCount = 0;

    await mockOrfApp(page, memberUser, data, {
      bounties: bountyHallData([bountyHallItem(objective, [result])]),
      onApply: async () => {
        applyCount += 1;
        await deferred.promise;
      },
      tasks: () => data,
    });

    await page.goto("/bounties");
    await page.getByRole("button", { name: "申请挑战" }).click();
    const confirmButton = page.getByRole("dialog").getByRole("button", { name: "申请挑战" });
    await confirmButton.click();
    await confirmButton.click({ force: true });
    deferred.resolve();

    await expect.poll(() => applyCount).toBe(1);
  });

  test("browser back after ORF mutation keeps refreshed API state", async ({ page }) => {
    const objective = objectiveFixture({ id: "obj-ui-browser-back", title: "前端测试 浏览器返回目标", flowStatus: "open", resultIds: ["res-ui-browser-back"] });
    const result = resultFixture({ id: "res-ui-browser-back", objectiveId: objective.id, title: "前端测试 浏览器返回指标" });
    let data = taskManagementData({ objectives: [objective], results: [result] });
    let bounties = bountyHallData([bountyHallItem(objective, [result])]);

    await mockOrfApp(page, observerUser, data, {
      bounties: () => bounties,
      onApply: async () => {
        const applied = { ...objective, flowStatus: "applying" as const, challengeApplications: [{ id: "app-ui-browser-back", applicant: observerUser.name, status: "pending" as const, createdAt: "2026-05-18T10:00:00.000Z", decidedAt: null }] };
        data = taskManagementData({ objectives: [applied], results: [result] });
        bounties = bountyHallData([bountyHallItem(applied, [result], { hasCurrentApplication: true })]);
      },
      tasks: () => data,
    });

    await page.goto("/bounties");
    await page.getByRole("button", { name: "申请挑战" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
    await expect(page.getByRole("button", { name: "已申请" })).toBeVisible();
    await page.goto("/tasks");
    await page.goBack();
    await expect(page.getByRole("button", { name: "已申请" })).toBeVisible();
  });
});

function objectivePanel(page: Page, title: string) {
  return page.locator("section.orf-objective-panel").filter({ hasText: title });
}

async function attachAuditScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const safeName = name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const path = testInfo.outputPath(`${safeName}.png`);
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(safeName, { contentType: "image/png", path });
}

async function mockOrfApp(
  page: Page,
  user: OrfUser,
  initialTasks: TaskManagementData,
  options: {
    allChallenges?: MockRouteSource<TaskManagementData>;
    bounties?: MockRouteSource<BountyHallData>;
    mineChallenges?: MockRouteSource<TaskManagementData>;
    onAccept?: () => Promise<void | MockMutationResult> | void | MockMutationResult;
    onApply?: () => Promise<void | MockMutationResult> | void | MockMutationResult;
    onApprove?: (applicationId: string) => Promise<void | MockMutationResult> | void | MockMutationResult;
    onCreateResult?: (payload: unknown) => Promise<void | MockMutationResult> | void | MockMutationResult;
    onFreeze?: () => Promise<void | MockMutationResult> | void | MockMutationResult;
    onPublish?: () => Promise<void | MockMutationResult> | void | MockMutationResult;
    onReject?: (applicationId: string) => Promise<void | MockMutationResult> | void | MockMutationResult;
    onReviewLoot?: (payload: unknown) => Promise<void | MockMutationResult> | void | MockMutationResult;
    onSubmitContributionReview?: (payload: unknown) => Promise<void | MockMutationResult> | void | MockMutationResult;
    onSubmitLoot?: (payload: unknown) => Promise<void | MockMutationResult> | void | MockMutationResult;
    tasks?: () => MockRouteResponse<TaskManagementData> | Promise<MockRouteResponse<TaskManagementData>>;
  } = {},
) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user } });
  });
  await page.route("**/api/permissions", async (route) => {
    await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
  await page.route("**/api/settings/visual/backgrounds?**", async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        message: "ok",
        data: {
          scene: "sidebar_background",
          config: { mode: "fixed", fixedBackgroundId: null, switchTrigger: "on_open", switchOrder: "sequential", switchIntervalMinutes: 30 },
          list: [],
        },
      },
    });
  });
  await page.route("**/settings/backgrounds/**", async (route) => {
    await route.fulfill({ status: 404, body: "" });
  });
  await page.route("**/api/tasks-page", async (route) => {
    await fulfillData(route, options.tasks?.() ?? initialTasks);
  });
  await page.route("**/api/my-challenges?scope=all", async (route) => {
    const data = resolveRouteSource(options.allChallenges) ?? options.tasks?.() ?? initialTasks;
    await fulfillData(route, data);
  });
  await page.route("**/api/my-challenges?scope=mine", async (route) => {
    const data = resolveRouteSource(options.mineChallenges) ?? options.tasks?.() ?? initialTasks;
    await fulfillData(route, data);
  });
  await page.route("**/api/bounties", async (route) => {
    await fulfillData(route, resolveRouteSource(options.bounties) ?? bountyHallData([]));
  });
  await page.route("**/api/results", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onCreateResult?.(route.request().postDataJSON()));
  });
  await page.route("**/api/objectives/*/challenge", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onAccept?.());
  });
  await page.route("**/api/objectives/*/publish", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onPublish?.());
  });
  await page.route("**/api/objectives/*/challenge-applications/*/approve", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onApprove?.(routePathSegmentBefore(route, "approve")));
  });
  await page.route("**/api/objectives/*/challenge-applications/*/reject", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onReject?.(routePathSegmentBefore(route, "reject")));
  });
  await page.route("**/api/objectives/*/challenge-applications", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onApply?.());
  });
  await page.route("**/api/objectives/*/freeze", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onFreeze?.());
  });
  await page.route("**/api/objectives/*/loot", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onSubmitLoot?.(route.request().postDataJSON()));
  });
  await page.route("**/api/objectives/*/contribution-reviews", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onSubmitContributionReview?.(route.request().postDataJSON()));
  });
  await page.route("**/api/objectives/*/review", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await fulfillMutation(route, options.onReviewLoot?.(route.request().postDataJSON()));
  });
}

type MockMutationResult = { status?: number; json?: unknown };
type MockRouteResponse<T> = T | { status: number; json?: unknown };
type MockRouteSource<T> = MockRouteResponse<T> | (() => MockRouteResponse<T> | Promise<MockRouteResponse<T>>);
type ResultCreatePayload = { definer?: string; metricName?: string; objectiveId?: string; source?: string; title?: string };
type LootSubmitPayload = { body?: string; resultClaims?: ObjectiveLoot["resultClaims"]; selfTestReportBody?: string | null };
type ContributionReviewPayload = { allocations?: ContributionAllocation[] };

async function fulfillMutation(route: Route, result: Promise<void | MockMutationResult> | void | MockMutationResult) {
  const resolved = await result;
  if (resolved && typeof resolved === "object" && "status" in resolved && resolved.status && resolved.status >= 400) {
    await route.fulfill({ status: resolved.status, json: resolved.json ?? { error: "Mutation failed" } });
    return;
  }

  await route.fulfill({ status: resolved?.status ?? 200, json: resolved?.json ?? { ok: true } });
}

function resolveRouteSource<T>(source: MockRouteSource<T> | undefined) {
  return typeof source === "function" ? source() : source;
}

function routePathSegmentBefore(route: Route, segment: string) {
  const parts = new URL(route.request().url()).pathname.split("/");
  const index = parts.indexOf(segment);
  return index > 0 ? decodeURIComponent(parts[index - 1] ?? "") : "";
}

async function fulfillData<T>(route: Route, result: MockRouteResponse<T> | Promise<MockRouteResponse<T>>) {
  const resolved = await result;
  if (isMockRouteStatus(resolved)) {
    await route.fulfill({ status: resolved.status, json: resolved.json ?? { error: "Request failed" } });
    return;
  }

  await route.fulfill({ json: resolved });
}

function isMockRouteStatus(value: unknown): value is { status: number; json?: unknown } {
  return Boolean(value && typeof value === "object" && "status" in value && typeof (value as { status?: unknown }).status === "number");
}

function taskManagementData(input: {
  objectives: Objective[];
  results: Result[];
  tasks?: Task[];
  objectiveLoot?: ObjectiveLoot[];
  objectiveContributionReviews?: ObjectiveContributionReview[];
  pointLedger?: PointLedgerEntry[];
}): TaskManagementData {
  return {
    objectives: input.objectives,
    results: input.results,
    tasks: input.tasks ?? [],
    evidence: [],
    feedback: [],
    comments: [],
    objectiveLoot: input.objectiveLoot ?? [],
    objectiveContributionReviews: input.objectiveContributionReviews ?? [],
    pointLedger: input.pointLedger ?? [],
    permissionRules: initialOrfState.permissionRules,
  };
}

function objectiveFixture(overrides: Partial<Objective> & Pick<Objective, "id" | "title">): Objective {
  return {
    ...objectiveTemplate,
    id: overrides.id,
    title: overrides.title,
    description: `${overrides.title} description`,
    stage: "resultClaiming",
    flowStatus: "open",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    ...overrides,
  };
}

function submittedObjectiveFixture(id: string, title: string, challengers: string[], resultIds: string[]): Objective {
  return objectiveFixture({
    id,
    title,
    flowStatus: "submitted",
    stage: "goalFrozen",
    challengers,
    resultIds,
    lootSubmittedAt: "2026-05-18T11:30:00.000Z",
  });
}

function resultFixture(overrides: Partial<Result> & Pick<Result, "id" | "objectiveId" | "title">): Result {
  return {
    ...resultTemplate,
    id: overrides.id,
    objectiveId: overrides.objectiveId,
    title: overrides.title,
    description: `${overrides.title} description`,
    metricName: `${overrides.title} metric`,
    metricRequirement: `${overrides.title} requirement`,
    acceptedResult: "unreviewed",
    taskIds: [],
    feedbackIds: [],
    evidenceIds: [],
    ...overrides,
  };
}

function objectiveLootFixture(overrides: Partial<ObjectiveLoot> & Pick<ObjectiveLoot, "id" | "objectiveId" | "submittedBy" | "body" | "resultClaims">): ObjectiveLoot {
  return {
    id: overrides.id,
    objectiveId: overrides.objectiveId,
    submittedBy: overrides.submittedBy,
    body: overrides.body,
    resultClaims: overrides.resultClaims,
    selfTestReportUrl: null,
    selfTestReportBody: null,
    submittedAt: "2026-05-18T11:20:00.000Z",
    ...overrides,
  };
}

function contributionReviewFixture(
  overrides: Partial<ObjectiveContributionReview> & Pick<ObjectiveContributionReview, "id" | "objectiveId" | "reviewer" | "allocations">,
): ObjectiveContributionReview {
  return {
    id: overrides.id,
    objectiveId: overrides.objectiveId,
    reviewer: overrides.reviewer,
    allocations: overrides.allocations,
    submittedAt: "2026-05-18T11:30:00.000Z",
    ...overrides,
  };
}

function pointLedgerFixture(overrides: Partial<PointLedgerEntry> & Pick<PointLedgerEntry, "id" | "objectiveId" | "memberName" | "points" | "reason">): PointLedgerEntry {
  return {
    id: overrides.id,
    objectiveId: overrides.objectiveId,
    userId: null,
    memberName: overrides.memberName,
    points: overrides.points,
    reason: overrides.reason,
    createdAt: "2026-05-18T11:40:00.000Z",
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function toastByText(page: Page, text: string) {
  return page.locator(".orf-surface-elevated").filter({ hasText: text });
}

function bountyHallData(availableItems: BountyHallItem[], recruitmentItems: BountyHallItem[] = []): BountyHallData {
  return {
    availableItems,
    recruitmentItems,
    objectiveOptions: [...recruitmentItems, ...availableItems].map((item) => item.objective),
    contribution: { points: 0 },
  };
}

function bountyHallItem(objective: Objective, results: Result[], overrides: Partial<BountyHallItem> = {}): BountyHallItem {
  return {
    uncertaintyPoints: results.reduce((sum, result) => sum + result.uncertaintyScore, 0),
    deadline: objective.finalDueAt,
    definer: results[0]?.definer ?? "",
    difficultyRank: 2,
    hasCurrentApplication: false,
    isRecruitment: false,
    objective,
    result: results[0] ?? null,
    results,
    source: results[0]?.source ?? "managerDefined",
    ...overrides,
  };
}
