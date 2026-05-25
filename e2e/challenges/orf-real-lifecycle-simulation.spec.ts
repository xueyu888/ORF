import { assertLatestPeerReviewWins, assertLifecycleSecurityBoundaries, assertStatusCoverage, assertAcceptedResultCoverage } from "./helpers/lifecycleInvariants";
import {
  addExecutionWork,
  createCandidateLifecycleObjective,
  createPublishedLifecycleObjective,
  prepareFrozenObjectiveViaApi,
  rejectPendingApplication,
  settlePreparedObjectiveViaApi,
} from "./helpers/lifecycleActions";
import { bountyRow, expectObjectiveChildCreateOptionAbsent, leaderboardRow, objectivePanel, openObjectiveChildCreateMenu } from "./helpers/realAssertions";
import { expect, realSystemEnabled, test } from "./helpers/realSystemHarness";
import { LifecycleSimulator, LifecycleWorld, type LifecycleObjectiveRecord } from "./helpers/lifecycleSimulator";

test.describe("ORF real lifecycle simulation", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 900_000 });

  test("ORF real lifecycle simulation", async ({ browser, real }, testInfo) => {
    const world = new LifecycleWorld(real);
    const simulator = new LifecycleSimulator(world, testInfo);
    let securityTargets: Parameters<typeof assertLifecycleSecurityBoundaries>[2] | null = null;

    const registerObjective = (key: string, cycle: LifecycleObjectiveRecord["cycle"], label: string) => {
      world.addObjective(key, { cycle, title: world.title(cycle, label) });
      return world.objective(key);
    };

    const createPublished = async (key: string, uncertainty: Parameters<typeof createPublishedLifecycleObjective>[4] = "进阶") => {
      const record = world.objective(key);
      const created = await createPublishedLifecycleObjective(world.dsl, world.users.commander, record.title, record.cycle, uncertainty);
      record.id = created.objectiveId;
      record.resultIds = [created.resultId];
      return created;
    };

    const settleApiObjective = async (
      key: string,
      input: {
        acceptedResult?: Parameters<typeof settlePreparedObjectiveViaApi>[2]["acceptedResult"];
        challengers: Array<"member1" | "member2" | "member3" | "member4">;
        expectedMultiplier: number;
        late?: boolean;
        resultReviews?: Parameters<typeof settlePreparedObjectiveViaApi>[2]["resultReviews"];
        uncertainty?: Parameters<typeof createPublishedLifecycleObjective>[4];
      },
    ) => {
      const record = world.objective(key);
      const created = await createPublished(key, input.uncertainty ?? "入门");
      await prepareFrozenObjectiveViaApi(world.dsl, {
        commander: world.users.commander,
        objectiveId: created.objectiveId,
        challengers: input.challengers.map((actor) => world.users[actor]),
      });
      if (input.late) {
        await world.clock.makeSubmissionLate(created.objectiveId);
      }
      await settlePreparedObjectiveViaApi(real, world.dsl, {
        acceptedResult: input.acceptedResult,
        commander: world.users.commander,
        contributionResolution: input.challengers.map((actor) => ({ member: world.users[actor].name, ratio: 1 })),
        objectiveId: created.objectiveId,
        resultReviews: input.resultReviews,
        submitter: world.users[input.challengers[0]!],
        title: record.title,
      });
      world.recordSettled(key);
      const objective = await world.dsl.objective(created.objectiveId);
      expect(objective.completionMultiplier, `${record.title} multiplier`).toBe(input.expectedMultiplier);
    };

    const assertCyclePages = async (cycle: LifecycleObjectiveRecord["cycle"]) => {
      const cycleObjectives = [...world.objectives.values()].filter((objective) => objective.cycle === cycle && objective.id);
      const data = await real.taskData();

      await world.dsl.openTasks(world.page("commander"));
      for (const objective of cycleObjectives) {
        await expect(objectivePanel(world.page("commander"), objective.title), `${cycle} commander sees ${objective.title}`).toBeVisible();
      }

      for (const actor of ["member1", "member2", "member3", "member4"] as const) {
        await world.dsl.openTasks(world.page(actor));
        for (const record of cycleObjectives) {
          const objective = data.objectives.find((item) => item.id === record.id);
          if (objective?.challengers.includes(world.users[actor].name)) {
            await expect(objectivePanel(world.page(actor), record.title), `${actor} sees own ${record.title}`).toBeVisible();
          } else {
            await expect(world.page(actor).getByText(record.title), `${actor} cannot see non-owned ${record.title}`).toHaveCount(0);
          }
        }
      }

      await world.dsl.openTasks(world.page("observer"));
      for (const objective of cycleObjectives) {
        await expect(world.page("observer").getByText(objective.title), `observer cannot see ${objective.title}`).toHaveCount(0);
      }

      await world.dsl.openReports(world.page("commander"));
    };

    try {
      await simulator.runStep({ action: "login-active-users", actor: "commander" }, async () => {
        for (const actor of world.activeActors()) {
          world.pages[actor] = await real.newLoggedInPage(browser, world.users[actor]);
        }
      }, { skipInvariants: true });

      await simulator.runStep({ action: "inactive-users-blocked-from-business", actor: "disabled" }, async () => {
        for (const inactive of [
          {
            expectedCopy: /你的账号已停用/,
            expectedHeading: "账号已停用",
            user: world.users.disabled,
          },
          {
            expectedCopy: /等待管理员审核通过/,
            expectedHeading: "等待注册审核",
            user: real.fixture.pendingMember,
          },
        ]) {
          const context = await browser.newContext();
          await real.connectContextToRealApi(context);
          const page = await context.newPage();
          if (inactive.user.id === world.users.disabled.id) {
            world.pages.disabled = { context, page };
          }
          const businessRequests: string[] = [];
          page.on("request", (request) => {
            const path = new URL(request.url()).pathname;
            if (["/api/tasks-page", "/api/bounties", "/api/my-challenges"].includes(path)) {
              businessRequests.push(path);
            }
          });

          await page.goto("/auth");
          await page.getByPlaceholder("Email").fill(inactive.user.email);
          await page.getByPlaceholder("Password").fill(inactive.user.password);
          const [loginResponse] = await Promise.all([
            page.waitForResponse((response) => response.url().includes("/api/auth/login")),
            page.getByRole("button", { name: "Sign In" }).click(),
          ]);
          expect(loginResponse.status()).toBe(200);

          for (const path of ["/bounties", "/tasks"]) {
            await page.goto(path);
            await expect(page.getByRole("heading", { name: inactive.expectedHeading })).toBeVisible();
            await expect(page.getByText(inactive.expectedCopy)).toBeVisible();
            await expect(page.getByRole("heading", { name: "悬赏大厅" })).toHaveCount(0);
            await expect(page.getByRole("heading", { name: "我的挑战" })).toHaveCount(0);
          }
          expect(businessRequests, `${inactive.user.name} should not load business data in the UI`).toEqual([]);

          const tasksPage = await real.apiAs(inactive.user, "/api/tasks-page");
          const bounties = await real.apiAs(inactive.user, "/api/bounties");
          const createObjective = await real.apiAs(inactive.user, "/api/objectives", {
            body: JSON.stringify({
              boundary: "inactive user should not create objectives",
              cycle: "2999 Q1",
              finalDueAt: "2999-12-31",
              title: `${inactive.user.name} forbidden objective`,
              whyItMatters: "Inactive users must not reach business mutations.",
            }),
            method: "POST",
          });
          expect(tasksPage.status).toBe(403);
          expect(bounties.status).toBe(403);
          expect(createObjective.status).toBe(403);
          if (inactive.user.id !== world.users.disabled.id) {
            await context.close();
          }
        }
      });

      const q1Candidate = registerObjective("q1Candidate", "2999 Q1", "候选目标");
      await simulator.runStep({ action: "create-q1-candidate", actor: "commander", expectedState: "candidate", objectiveKey: "q1Candidate" }, async () => {
        q1Candidate.id = await createCandidateLifecycleObjective(world.dsl, world.users.commander, q1Candidate.title, q1Candidate.cycle);
        await world.dsl.openTasks(world.page("commander"));
        await expect(objectivePanel(world.page("commander"), q1Candidate.title)).toBeVisible();
      });

      registerObjective("q1Open", "2999 Q1", "开放发现目标");
      await simulator.runStep({ action: "publish-q1-open", actor: "commander", expectedState: "open", objectiveKey: "q1Open" }, async () => {
        await createPublished("q1Open", "入门");
        await world.dsl.openBounties(world.page("member1"));
        await expect(bountyRow(world.page("member1"), world.objective("q1Open").title)).toBeVisible();
      });

      registerObjective("q1Applying", "2999 Q1", "申请中目标");
      await simulator.runStep({ action: "member4-applies-q1-applying", actor: "member4", expectedState: "applying", objectiveKey: "q1Applying" }, async () => {
        await createPublished("q1Applying", "进阶");
        await world.dsl.applyForObjective(world.page("member4"), world.objective("q1Applying").title);
      });

      registerObjective("q1Recruiting", "2999 Q1", "保留征召令目标");
      await simulator.runStep({ action: "commander-recruits-member3-and-leaves-recruitment", actor: "commander", expectedState: "recruiting", objectiveKey: "q1Recruiting" }, async () => {
        const created = await createPublished("q1Recruiting", "进阶");
        await world.dsl.recruitViaApi(world.users.commander, created.objectiveId, [world.users.member3.name]);
        await world.dsl.openBounties(world.page("member3"));
        await expect(bountyRow(world.page("member3"), world.objective("q1Recruiting").title)).toContainText("征召令");
        world.remainingRecruitment = { objectiveTitle: world.objective("q1Recruiting").title, user: world.users.member3 };
      });

      registerObjective("q1Rejected", "2999 Q1", "只申请被拒目标");
      await simulator.runStep({ action: "member5-applies-twice-without-duplicate-pending", actor: "member5", expectedState: "applying", objectiveKey: "q1Rejected" }, async () => {
        const created = await createPublished("q1Rejected", "入门");
        await world.dsl.applyForObjective(world.page("member5"), world.objective("q1Rejected").title);
        const duplicate = await world.dsl.apiApply(world.users.member5, created.objectiveId);
        expect(duplicate.status).toBe(409);
        const objective = await world.dsl.objective(created.objectiveId);
        expect(objective.challengeApplications.filter((application) => application.applicant === world.users.member5.name && application.status === "pending")).toHaveLength(1);
      });

      await simulator.runStep({ action: "commander-rejects-member5-only-application", actor: "commander", expectedState: "open", objectiveKey: "q1Rejected" }, async () => {
        await rejectPendingApplication(real, world.users.commander, world.objective("q1Rejected").id!, world.users.member5.name);
        const objective = await world.dsl.objective(world.objective("q1Rejected").id!);
        expect(objective.challengers).not.toContain(world.users.member5.name);
        expect(objective.challengeApplications.some((application) => application.applicant === world.users.member5.name && application.status === "declined")).toBe(true);
      });

      registerObjective("q1PendingRecruitment", "2999 Q1", "只保留征召待确认目标");
      await simulator.runStep({ action: "member6-keeps-recruitment-pending", actor: "member6", expectedState: "recruiting", objectiveKey: "q1PendingRecruitment" }, async () => {
        const created = await createPublished("q1PendingRecruitment", "入门");
        await world.dsl.recruitViaApi(world.users.commander, created.objectiveId, [world.users.member6.name]);
        await world.dsl.openBounties(world.page("member6"));
        const row = bountyRow(world.page("member6"), world.objective("q1PendingRecruitment").title);
        await expect(row).toContainText("征召令");
        await expect(row.getByRole("button", { name: "接受挑战" })).toBeVisible();
        await expect(row.getByRole("button", { name: "拒绝征召" })).toHaveCount(0);
        const objective = await world.dsl.objective(created.objectiveId);
        expect(objective.challengers).not.toContain(world.users.member6.name);
        expect(objective.assignedChallengers).toContain(world.users.member6.name);
      });

      registerObjective("q1StaleBounty", "2999 Q1", "旧大厅失效申请目标");
      await simulator.runStep({ action: "stale-bounties-application-fails-after-acceptance", actor: "member4", expectedState: "reestimating", objectiveKey: "q1StaleBounty" }, async () => {
        const created = await createPublished("q1StaleBounty", "进阶");
        await world.dsl.openBounties(world.page("member4"));
        await expect(bountyRow(world.page("member4"), world.objective("q1StaleBounty").title)).toBeVisible();
        await world.dsl.recruitViaApi(world.users.commander, created.objectiveId, [world.users.member1.name]);
        const accepted = await world.dsl.acceptRecruitmentViaApi(world.users.member1, created.objectiveId);
        expect(accepted.status).toBe(200);
        await bountyRow(world.page("member4"), world.objective("q1StaleBounty").title).getByRole("button", { name: "申请挑战" }).click();
        await world.page("member4").getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
        await expect(world.page("member4").getByText("目标状态已变化，请刷新后再试")).toBeVisible();
        await world.page("member4").reload();
        await expect(bountyRow(world.page("member4"), world.objective("q1StaleBounty").title)).toHaveCount(0);
      });

      registerObjective("q1Main", "2999 Q1", "完整结算目标");
      await simulator.runStep({ action: "q1-main-published", actor: "commander", expectedState: "open", objectiveKey: "q1Main" }, async () => {
        await createPublished("q1Main", "破局");
      });
      await simulator.runStep({ action: "member1-and-member2-apply-q1-main", actor: "member1", expectedState: "applying", objectiveKey: "q1Main" }, async () => {
        await world.dsl.applyForObjective(world.page("member1"), world.objective("q1Main").title);
        await world.dsl.applyForObjective(world.page("member2"), world.objective("q1Main").title);
      });
      await simulator.runStep({ action: "commander-approves-q1-main-applications", actor: "commander", expectedState: "reestimating", objectiveKey: "q1Main" }, async () => {
        await world.dsl.approveApplication(world.page("commander"), world.objective("q1Main").title, 2);
      });
      await simulator.runStep({ action: "member1-proposes-and-member2-edits-q1-main-indicators", actor: "member1", expectedState: "reestimating", objectiveKey: "q1Main" }, async () => {
        await world.dsl.openTasks(world.page("member1"));
        const proposedResultId = await world.dsl.proposeMetric(world.page("member1"), world.objective("q1Main").title, `${world.objective("q1Main").title} 成员提出指标`);
        world.recordResult("q1Main", proposedResultId);
        const edited = await world.dsl.editMetric(world.users.member2, proposedResultId, `${world.objective("q1Main").title} 成员2修订指标`);
        expect(edited.status).toBe(200);
        await addExecutionWork(real, world.dsl, world.users.member1, world.objective("q1Main").id!, proposedResultId, `${world.objective("q1Main").title} 执行协作`);
      });
      await simulator.runStep({ action: "commander-freezes-q1-main", actor: "commander", expectedState: "frozen", objectiveKey: "q1Main" }, async () => {
        await world.dsl.freezeObjective(world.page("commander"), world.objective("q1Main").title);
      });
      await simulator.runStep({ action: "member1-submits-q1-main-loot", actor: "member1", expectedState: "submitted", objectiveKey: "q1Main" }, async () => {
        await world.dsl.submitLoot(world.page("member1"), world.objective("q1Main").id!, world.objective("q1Main").title, `${world.objective("q1Main").title} 战利品`);
      });
      await simulator.runStep({ action: "q1-main-repeat-peer-review-latest-wins", actor: "member1", expectedState: "submitted", objectiveKey: "q1Main" }, async () => {
        const objective = await world.dsl.objective(world.objective("q1Main").id!);
        const first = await world.dsl.submitPeerReviewViaApi(world.users.member1, objective.id, [
          { member: world.users.member1.name, ratio: 9 },
          { member: world.users.member2.name, ratio: 1 },
        ]);
        expect(first.status).toBe(200);
        await new Promise((resolve) => setTimeout(resolve, 5));
        await world.dsl.submitPeerReview(world.page("member1"), objective.id, objective.challengers.map((member) => ({ member, ratio: 1 })));
        await assertLatestPeerReviewWins(real, objective.id, world.users.member1.name, objective.challengers.map((member) => ({ member, ratio: 0.5 })));
        await world.dsl.submitPeerReview(world.page("member2"), objective.id, objective.challengers.map((member) => ({ member, ratio: 1 })));
      });
      await simulator.runStep({ action: "commander-settles-q1-main-and-reports", actor: "commander", expectedState: "settled", objectiveKey: "q1Main" }, async () => {
        await world.dsl.reviewAndSettle(world.page("commander"), world.objective("q1Main").id!, `${world.objective("q1Main").title} 验收通过`);
        world.recordSettled("q1Main");
        await expect(leaderboardRow(world.page("commander"), world.users.member1.name)).toBeVisible();
        await expect(leaderboardRow(world.page("commander"), world.users.member2.name)).toBeVisible();
      });
      await simulator.runStep({ action: "q1-cycle-page-visibility", actor: "commander" }, async () => {
        await assertCyclePages("2999 Q1");
      });

      const q2Candidate = registerObjective("q2Candidate", "2999 Q2", "候选目标");
      await simulator.runStep({ action: "create-q2-candidate", actor: "commander", expectedState: "candidate", objectiveKey: "q2Candidate" }, async () => {
        q2Candidate.id = await createCandidateLifecycleObjective(world.dsl, world.users.commander, q2Candidate.title, q2Candidate.cycle);
      });

      registerObjective("q2Rejected", "2999 Q2", "申请被拒目标");
      await simulator.runStep({ action: "member5-applies-and-is-rejected-in-q2", actor: "member5", expectedState: "open", objectiveKey: "q2Rejected" }, async () => {
        const created = await createPublished("q2Rejected", "入门");
        const applied = await world.dsl.apiApply(world.users.member5, created.objectiveId);
        expect(applied.status).toBe(200);
        await rejectPendingApplication(real, world.users.commander, created.objectiveId, world.users.member5.name);
      });

      registerObjective("q2PendingRecruitment", "2999 Q2", "征召待确认目标");
      await simulator.runStep({ action: "member6-keeps-recruitment-pending-in-q2", actor: "member6", expectedState: "recruiting", objectiveKey: "q2PendingRecruitment" }, async () => {
        const created = await createPublished("q2PendingRecruitment", "入门");
        await world.dsl.recruitViaApi(world.users.commander, created.objectiveId, [world.users.member6.name]);
        const objective = await world.dsl.objective(created.objectiveId);
        expect(objective.assignedChallengers).toContain(world.users.member6.name);
      });

      registerObjective("q2Expired", "2999 Q2", "重估窗口过期目标");
      await simulator.runStep({ action: "member3-and-member4-accept-q2-expired", actor: "member3", expectedState: "reestimating", objectiveKey: "q2Expired" }, async () => {
        const created = await createPublished("q2Expired", "进阶");
        await world.dsl.recruitViaApi(world.users.commander, created.objectiveId, [world.users.member3.name, world.users.member4.name]);
        await world.dsl.acceptRecruitment(world.page("member3"), world.objective("q2Expired").title);
        const accepted = await world.dsl.acceptRecruitmentViaApi(world.users.member4, created.objectiveId);
        expect(accepted.status).toBe(200);
      });
      let q2ExpiredProposedResultId = "";
      let q2ExpiredTaskId = "";
      await simulator.runStep({ action: "q2-expired-members-alternate-indicator-work", actor: "member3", expectedState: "reestimating", objectiveKey: "q2Expired" }, async () => {
        await world.dsl.openTasks(world.page("member3"));
        q2ExpiredProposedResultId = await world.dsl.proposeMetric(world.page("member3"), world.objective("q2Expired").title, `${world.objective("q2Expired").title} 成员3提出指标`);
        world.recordResult("q2Expired", q2ExpiredProposedResultId);
        const edited = await world.dsl.editMetric(world.users.member4, q2ExpiredProposedResultId, `${world.objective("q2Expired").title} 成员4修订指标`);
        expect(edited.status).toBe(200);
        q2ExpiredTaskId = await addExecutionWork(real, world.dsl, world.users.member3, world.objective("q2Expired").id!, q2ExpiredProposedResultId, `${world.objective("q2Expired").title} 执行协作`);
      });
      await simulator.runStep({ action: "q2-expired-window-removes-propose-button-and-blocks-api", actor: "member3", expectedState: "reestimating", objectiveKey: "q2Expired" }, async () => {
        await world.clock.expireReestimateWindow(world.objective("q2Expired").id!);
        await world.page("member3").reload();
        await expect(objectivePanel(world.page("member3"), world.objective("q2Expired").title)).toContainText("重估中");
        await expectObjectiveChildCreateOptionAbsent(objectivePanel(world.page("member3"), world.objective("q2Expired").title), "提出指标");

        const expiredCreate = await real.apiAs(world.users.member3, "/api/results", {
          body: JSON.stringify({
            objectiveId: world.objective("q2Expired").id,
            title: `${world.objective("q2Expired").title} 过期后不应创建`,
            metricName: "过期后指标",
            source: "memberProposed",
          }),
          method: "POST",
        });
        expect(expiredCreate.status).toBe(403);
        const expiredEdit = await world.dsl.editMetric(world.users.member4, q2ExpiredProposedResultId, `${world.objective("q2Expired").title} 过期后不应修改`);
        expect(expiredEdit.status).toBe(403);
        const objective = await world.dsl.objective(world.objective("q2Expired").id!);
        expect(new Date(objective.confirmationDueAt ?? "").getTime()).toBeLessThan(Date.now());
      });

      registerObjective("q2StaleTask", "2999 Q2", "旧挑战页冻结目标");
      await simulator.runStep({ action: "stale-tasks-propose-fails-after-freeze", actor: "member2", expectedState: "frozen", objectiveKey: "q2StaleTask" }, async () => {
        const created = await createPublished("q2StaleTask", "进阶");
        await world.dsl.recruitViaApi(world.users.commander, created.objectiveId, [world.users.member2.name]);
        const accepted = await world.dsl.acceptRecruitmentViaApi(world.users.member2, created.objectiveId);
        expect(accepted.status).toBe(200);
        await world.dsl.openTasks(world.page("member2"));
        const stalePanel = objectivePanel(world.page("member2"), world.objective("q2StaleTask").title);
        await openObjectiveChildCreateMenu(stalePanel);
        await expect(stalePanel.getByRole("button", { name: "提出指标" })).toBeVisible();
        await world.dsl.freezeViaApi(world.users.commander, created.objectiveId);
        await stalePanel.getByRole("button", { name: "提出指标" }).click();
        await stalePanel.getByLabel("编辑指标标题").fill(`${world.objective("q2StaleTask").title} 旧页面不应创建`);
        await stalePanel.getByLabel("编辑指标标题").press("Enter");
        await expect(world.page("member2").getByText("没有执行这个操作的权限")).toBeVisible();
        await world.page("member2").reload();
        await expectObjectiveChildCreateOptionAbsent(objectivePanel(world.page("member2"), world.objective("q2StaleTask").title), "提出指标");
        const frozenEdit = await world.dsl.editMetric(world.users.member2, created.resultId, `${world.objective("q2StaleTask").title} 冻结后不应修改`);
        expect(frozenEdit.status).toBe(403);
        securityTargets = {
          frozenObjectiveId: created.objectiveId,
          reestimatingObjectiveId: world.objective("q2Expired").id!,
          resultId: q2ExpiredProposedResultId,
          taskId: q2ExpiredTaskId,
        };
      });

      await simulator.runStep({ action: "non-challenger-mutation-boundaries", actor: "observer", objectiveKey: "q2Expired" }, async () => {
        expect(securityTargets).toBeTruthy();
        await assertLifecycleSecurityBoundaries(real, world.users.observer, securityTargets!);
      });

      registerObjective("q2Submitted", "2999 Q2", "保留待验收目标");
      await simulator.runStep({ action: "q2-submitted-objective-keeps-loot", actor: "member2", expectedState: "submitted", objectiveKey: "q2Submitted" }, async () => {
        const created = await createPublished("q2Submitted", "进阶");
        await prepareFrozenObjectiveViaApi(world.dsl, {
          commander: world.users.commander,
          objectiveId: created.objectiveId,
          challengers: [world.users.member2],
        });
        const loot = await world.dsl.submitLootViaApi(world.users.member2, created.objectiveId, `${world.objective("q2Submitted").title} 战利品`);
        expect(loot.status).toBe(200);
      });

      registerObjective("q2Duplicate", "2999 Q2", "并发提交结算目标");
      await simulator.runStep({ action: "q2-concurrent-loot-and-review-only-once", actor: "member3", expectedState: "settled", objectiveKey: "q2Duplicate" }, async () => {
        const created = await createPublished("q2Duplicate", "进阶");
        await prepareFrozenObjectiveViaApi(world.dsl, {
          commander: world.users.commander,
          objectiveId: created.objectiveId,
          challengers: [world.users.member3],
        });
        const lootResponses = await Promise.all([
          world.dsl.submitLootViaApi(world.users.member3, created.objectiveId, `${world.objective("q2Duplicate").title} 第一次战利品`),
          world.dsl.submitLootViaApi(world.users.member3, created.objectiveId, `${world.objective("q2Duplicate").title} 第二次战利品`),
        ]);
        expect(lootResponses.map((response) => response.status).sort()).toEqual([200, 409]);
        const reviewResponses = await Promise.all([
          world.dsl.reviewAndSettleViaApi(world.users.commander, created.objectiveId, { reason: `${world.objective("q2Duplicate").title} 第一次验收` }),
          world.dsl.reviewAndSettleViaApi(world.users.commander, created.objectiveId, { reason: `${world.objective("q2Duplicate").title} 第二次验收` }),
        ]);
        expect(reviewResponses.map((response) => response.status).sort()).toEqual([200, 409]);
        world.recordSettled("q2Duplicate");
      });

      registerObjective("q2Falsified", "2999 Q2", "falsified 结算目标");
      await simulator.runStep({ action: "q2-falsified-settlement", actor: "commander", expectedState: "settled", objectiveKey: "q2Falsified" }, async () => {
        await settleApiObjective("q2Falsified", {
          acceptedResult: "falsified",
          challengers: ["member4"],
          expectedMultiplier: 1,
          uncertainty: "入门",
        });
      });
      await simulator.runStep({ action: "q2-cycle-reports-match-ledger", actor: "commander" }, async () => {
        await assertCyclePages("2999 Q2");
        await world.dsl.openReports(world.page("commander"));
        await expect(leaderboardRow(world.page("commander"), world.users.member1.name)).toBeVisible();
        await expect(leaderboardRow(world.page("commander"), world.users.member4.name)).toBeVisible();
      });

      const q3Candidate = registerObjective("q3Candidate", "2999 Q3", "候选目标");
      await simulator.runStep({ action: "create-q3-candidate", actor: "commander", expectedState: "candidate", objectiveKey: "q3Candidate" }, async () => {
        q3Candidate.id = await createCandidateLifecycleObjective(world.dsl, world.users.commander, q3Candidate.title, q3Candidate.cycle);
      });

      registerObjective("q3Rejected", "2999 Q3", "申请被拒目标");
      await simulator.runStep({ action: "member5-applies-and-is-rejected-in-q3", actor: "member5", expectedState: "open", objectiveKey: "q3Rejected" }, async () => {
        const created = await createPublished("q3Rejected", "入门");
        const applied = await world.dsl.apiApply(world.users.member5, created.objectiveId);
        expect(applied.status).toBe(200);
        await rejectPendingApplication(real, world.users.commander, created.objectiveId, world.users.member5.name);
      });

      registerObjective("q3PendingRecruitment", "2999 Q3", "征召待确认目标");
      await simulator.runStep({ action: "member6-keeps-recruitment-pending-in-q3", actor: "member6", expectedState: "recruiting", objectiveKey: "q3PendingRecruitment" }, async () => {
        const created = await createPublished("q3PendingRecruitment", "入门");
        await world.dsl.recruitViaApi(world.users.commander, created.objectiveId, [world.users.member6.name]);
        const objective = await world.dsl.objective(created.objectiveId);
        expect(objective.assignedChallengers).toContain(world.users.member6.name);
      });

      registerObjective("q3Late", "2999 Q3", "截止后完成目标");
      await simulator.runStep({ action: "q3-late-completed-multiplier", actor: "commander", expectedState: "settled", objectiveKey: "q3Late" }, async () => {
        await settleApiObjective("q3Late", {
          acceptedResult: "completed",
          challengers: ["member1", "member3"],
          expectedMultiplier: 0.5,
          late: true,
          uncertainty: "入门",
        });
      });

      registerObjective("q3Overdelivered", "2999 Q3", "超额完成目标");
      await simulator.runStep({ action: "q3-overdelivered-multiplier", actor: "commander", expectedState: "settled", objectiveKey: "q3Overdelivered" }, async () => {
        await settleApiObjective("q3Overdelivered", {
          acceptedResult: "overdelivered",
          challengers: ["member2", "member4"],
          expectedMultiplier: 1.5,
          uncertainty: "入门",
        });
      });

      registerObjective("q3Abandoned", "2999 Q3", "放弃目标");
      await simulator.runStep({ action: "q3-abandoned-zero-points", actor: "commander", expectedState: "settled", objectiveKey: "q3Abandoned" }, async () => {
        await settleApiObjective("q3Abandoned", {
          acceptedResult: "abandoned",
          challengers: ["member3"],
          expectedMultiplier: 0,
          uncertainty: "入门",
        });
      });

      registerObjective("q3Overturned", "2999 Q3", "overturned 目标");
      await simulator.runStep({ action: "q3-overturned-settlement", actor: "commander", expectedState: "settled", objectiveKey: "q3Overturned" }, async () => {
        await settleApiObjective("q3Overturned", {
          acceptedResult: "overturned",
          challengers: ["member4"],
          expectedMultiplier: 1,
          uncertainty: "入门",
        });
      });

      await simulator.runStep({ action: "final-status-and-accepted-result-coverage", actor: "commander" }, async () => {
        const objectiveIds = [...world.objectives.values()].map((objective) => objective.id).filter((id): id is string => Boolean(id));
        await assertStatusCoverage(real, objectiveIds, ["candidate", "open", "applying", "recruiting", "reestimating", "frozen", "submitted", "settled"]);
        await assertAcceptedResultCoverage(real, objectiveIds, ["completed", "falsified", "overdelivered", "abandoned", "overturned"]);
        await world.dsl.openTasks(world.page("commander"));
        for (const objective of world.objectives.values()) {
          await expect(objectivePanel(world.page("commander"), objective.title), `${objective.title} visible to commander`).toBeVisible();
        }
        await world.dsl.openTasks(world.page("observer"));
        for (const objective of world.objectives.values()) {
          await expect(world.page("observer").getByText(objective.title), `${objective.title} hidden from observer`).toHaveCount(0);
        }
        await world.dsl.openReports(world.page("commander"));
        await expect(leaderboardRow(world.page("commander"), world.users.member1.name)).toBeVisible();
        await expect(leaderboardRow(world.page("commander"), world.users.member2.name)).toBeVisible();
        await expect(leaderboardRow(world.page("commander"), world.users.member3.name)).toBeVisible();
        await expect(leaderboardRow(world.page("commander"), world.users.member4.name)).toBeVisible();
        await expect(leaderboardRow(world.page("commander"), world.users.observer.name)).toHaveCount(0);
      });

      await simulator.fillMutationSteps();

      await testInfo.attach("orf-lifecycle-complete-step-log", {
        body: Buffer.from(JSON.stringify(world.stepLogs, null, 2)),
        contentType: "application/json",
      });
    } finally {
      await world.closePages();
    }
  });
});
