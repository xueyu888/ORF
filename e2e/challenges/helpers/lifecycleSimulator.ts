import { expect, test as base, type Page, type TestInfo } from "@playwright/test";
import type { ObjectiveFlowStatus } from "../../../src/types/orf";
import { RealClock } from "./realClock";
import { RealScenarioDsl } from "./realScenarioDsl";
import type { LoggedInPage, RealSystemHarness, RealUser } from "./realSystemHarness";
import { assertLifecycleInvariants } from "./lifecycleInvariants";

export type LifecycleActor =
  | "commander"
  | "disabled"
  | "member1"
  | "member2"
  | "member3"
  | "member4"
  | "member5"
  | "member6"
  | "observer";

export type LifecycleObjectiveRecord = {
  cycle: "2999 Q1" | "2999 Q2" | "2999 Q3";
  id?: string;
  resultIds: string[];
  title: string;
};

export type LifecycleStepLog = {
  action: string;
  actor: LifecycleActor;
  actualState?: ObjectiveFlowStatus | "missing";
  expectedState?: ObjectiveFlowStatus;
  objectiveId?: string;
  objectiveTitle?: string;
  seed: number;
  stepIndex: number;
};

export type LifecycleStepMeta = {
  action: string;
  actor: LifecycleActor;
  expectedState?: ObjectiveFlowStatus;
  objectiveKey?: string;
};

export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x100000000;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array.");
    }
    return items[Math.floor(this.next() * items.length)]!;
  }
}

export class LifecycleWorld {
  readonly clock: RealClock;
  readonly dsl: RealScenarioDsl;
  readonly objectives = new Map<string, LifecycleObjectiveRecord>();
  readonly rng: DeterministicRng;
  readonly seed: number;
  readonly stepLogs: LifecycleStepLog[] = [];
  readonly targetSteps: number;
  readonly users: Record<LifecycleActor, RealUser>;
  readonly pages: Partial<Record<LifecycleActor, LoggedInPage>> = {};
  remainingRecruitment?: { objectiveTitle: string; user: RealUser };

  private readonly settledObjectiveIds = new Set<string>();

  constructor(readonly real: RealSystemHarness) {
    this.seed = parseLifecycleSeed();
    this.targetSteps = parseLifecycleSteps();
    this.rng = new DeterministicRng(this.seed);
    this.dsl = new RealScenarioDsl(real);
    this.clock = new RealClock(real);
    this.users = {
      commander: real.fixture.commander,
      disabled: real.fixture.disabledMember,
      member1: real.fixture.member1,
      member2: real.fixture.member2,
      member3: real.fixture.member3,
      member4: real.fixture.member4,
      member5: real.fixture.member5,
      member6: real.fixture.member6,
      observer: real.fixture.observer,
    };
  }

  activeMembers() {
    return [this.users.member1, this.users.member2, this.users.member3, this.users.member4, this.users.member5, this.users.member6];
  }

  activeActors(): LifecycleActor[] {
    return ["commander", "member1", "member2", "member3", "member4", "member5", "member6", "observer"];
  }

  addObjective(key: string, input: Omit<LifecycleObjectiveRecord, "resultIds"> & { resultIds?: string[] }) {
    this.objectives.set(key, { ...input, resultIds: input.resultIds ?? [] });
  }

  objective(key: string) {
    const objective = this.objectives.get(key);
    if (!objective) {
      throw new Error(`Lifecycle objective key not found: ${key}`);
    }
    return objective;
  }

  recordResult(objectiveKey: string, resultId: string) {
    const objective = this.objective(objectiveKey);
    objective.resultIds.push(resultId);
  }

  recordSettled(objectiveKey: string) {
    const objectiveId = this.objective(objectiveKey).id;
    if (objectiveId) {
      this.settledObjectiveIds.add(objectiveId);
    }
  }

  invariantContext() {
    return {
      members: this.activeMembers(),
      observer: this.users.observer,
      objectiveIds: [...this.objectives.values()].map((objective) => objective.id).filter((id): id is string => Boolean(id)),
      remainingRecruitment: this.remainingRecruitment,
      settledObjectiveIds: [...this.settledObjectiveIds],
    };
  }

  page(actor: LifecycleActor): Page {
    const loggedIn = this.pages[actor];
    if (!loggedIn) {
      throw new Error(`Page for actor ${actor} is not open.`);
    }
    return loggedIn.page;
  }

  pageOrCommander(actor: LifecycleActor): Page | null {
    return this.pages[actor]?.page ?? this.pages.commander?.page ?? null;
  }

  async closePages() {
    await Promise.all(Object.values(this.pages).map((item) => item?.context.close()));
  }

  title(cycle: LifecycleObjectiveRecord["cycle"], label: string) {
    return `${this.real.fixture.runLabel} 生命周期 ${cycle} ${label} seed-${this.seed}`;
  }
}

export class LifecycleSimulator {
  private stepIndex = 0;

  constructor(
    private readonly world: LifecycleWorld,
    private readonly testInfo: TestInfo,
  ) {}

  get stepsRun() {
    return this.stepIndex;
  }

  async runStep(meta: LifecycleStepMeta, action: () => Promise<void>, options: { includeApiVisibility?: boolean; skipInvariants?: boolean } = {}) {
    this.stepIndex += 1;
    const log = this.createLog(meta);
    const label = `seed=${this.world.seed} step=${log.stepIndex} actor=${meta.actor} action=${meta.action}${log.objectiveTitle ? ` objective=${log.objectiveTitle}` : ""}`;

    console.log(`[orf-lifecycle] start ${label}`);
    if (this.stepIndex % 10 === 0) {
      await this.testInfo.attach("orf-lifecycle-latest-step", {
        body: Buffer.from(JSON.stringify(log, null, 2)),
        contentType: "application/json",
      });
    }

    await base.step(label, async () => {
      try {
        await action();
        await this.refreshLogState(log, meta);
        if (meta.expectedState) {
          expect(log.actualState, expectedStateFailureMessage(log)).toBe(meta.expectedState);
        }
        if (!options.skipInvariants) {
          await assertLifecycleInvariants(this.world.real, this.world.invariantContext(), {
            includeApiVisibility: options.includeApiVisibility ?? true,
          });
        }
        if (this.stepIndex % 10 === 0) {
          await this.attachProgressScreenshot(meta.actor, log);
        }
        this.world.stepLogs.push(log);
        console.log(`[orf-lifecycle] done step=${log.stepIndex} action=${log.action} actual=${log.actualState ?? "n/a"}`);
      } catch (error) {
        await this.refreshLogState(log, meta).catch(() => undefined);
        this.world.stepLogs.push(log);
        await this.attachFailureContext(meta.actor, log);
        console.log(`[orf-lifecycle] fail step=${log.stepIndex} action=${log.action} actual=${log.actualState ?? "n/a"}`);
        throw withLifecycleContext(error, log);
      }
    });
  }

  async fillReadOnlySteps() {
    await this.fillMutationSteps();
  }

  async fillMutationSteps() {
    const readActions = [
      async () => {
        const actor = this.world.rng.pick(["member1", "member2", "member3", "member4", "observer"] as const);
        await this.runStep({ action: "seeded-read-open-tasks", actor }, async () => {
          await this.world.dsl.openTasks(this.world.page(actor));
        }, { includeApiVisibility: false });
      },
      async () => {
        const actor = this.world.rng.pick(["member1", "member2", "member3", "member4", "member5", "member6"] as const);
        await this.runStep({ action: "seeded-read-open-bounties", actor }, async () => {
          await this.world.dsl.openBounties(this.world.page(actor));
        }, { includeApiVisibility: false });
      },
      async () => {
        await this.runStep({ action: "seeded-read-open-reports", actor: "commander" }, async () => {
          await this.world.dsl.openReports(this.world.page("commander"));
        }, { includeApiVisibility: false });
      },
    ];

    while (this.stepIndex < this.world.targetSteps) {
      const mutationActions = await this.seededMutationActions();
      await this.world.rng.pick(mutationActions.length > 0 ? mutationActions : readActions)();
    }
  }

  private async seededMutationActions(): Promise<Array<() => Promise<void>>> {
    const data = await this.world.real.taskData();
    const objectiveKeyById = new Map(
      [...this.world.objectives.entries()]
        .filter(([, record]) => record.id)
        .map(([key, record]) => [record.id!, key]),
    );
    const trackedObjectives = data.objectives.filter((objective) => objectiveKeyById.has(objective.id));
    const resultMutationStatuses = new Set<ObjectiveFlowStatus>(["candidate", "open", "applying", "recruiting", "reestimating"]);
    const workItemMutationStatuses = new Set<ObjectiveFlowStatus>(["reestimating", "frozen"]);
    const commentMutationStatuses = new Set<ObjectiveFlowStatus>(["reestimating", "frozen", "submitted"]);
    const actions: Array<() => Promise<void>> = [];

    for (const objective of trackedObjectives) {
      const objectiveKey = objectiveKeyById.get(objective.id);
      if (!objectiveKey) continue;
      const objectiveResults = data.results.filter((result) => result.objectiveId === objective.id);
      const objectiveTasks = data.tasks.filter((task) => task.linkedObjectiveId === objective.id);
      const expectedState = objective.flowStatus;
      const nextStep = this.stepIndex + 1;

      if (resultMutationStatuses.has(objective.flowStatus)) {
        actions.push(async () => {
          await this.runStep({ action: "seeded-mutation-admin-add-metric", actor: "commander", expectedState, objectiveKey }, async () => {
            const title = `${objective.title} 随机指标 ${nextStep}`;
            const response = await this.world.real.apiAs<{ result: { id: string } }>(this.world.users.commander, "/api/results", {
              body: JSON.stringify({
                objectiveId: objective.id,
                title,
                metricName: `${title} metric`,
                baseline: 0,
                current: 0,
                target: 1,
                unit: "case",
                direction: "increase",
                source: "managerDefined",
              }),
              method: "POST",
            });
            expect(response.status, `seeded admin metric create ${objective.title}`).toBe(200);
            this.world.recordResult(objectiveKey, response.body.result.id);
          }, { includeApiVisibility: false });
        });

        const editableResult = objectiveResults[0];
        if (editableResult) {
          actions.push(async () => {
            await this.runStep({ action: "seeded-mutation-admin-edit-metric", actor: "commander", expectedState, objectiveKey }, async () => {
              const response = await this.world.dsl.editMetric(this.world.users.commander, editableResult.id, `${editableResult.title} 随机修订 ${nextStep}`);
              expect(response.status, `seeded admin metric edit ${objective.title}`).toBe(200);
            }, { includeApiVisibility: false });
          });
        }

        if (objectiveResults.length >= 2) {
          actions.push(async () => {
            await this.runStep({ action: "seeded-mutation-admin-reorder-metric", actor: "commander", expectedState, objectiveKey }, async () => {
              const response = await this.world.real.apiAs(this.world.users.commander, `/api/results/${encodeURIComponent(objectiveResults[0]!.id)}/order`, {
                body: JSON.stringify({ referenceResultId: objectiveResults[1]!.id, placement: "after" }),
                method: "PATCH",
              });
              expect(response.status, `seeded admin metric reorder ${objective.title}`).toBe(200);
            }, { includeApiVisibility: false });
          });
        }
      }

      if (objective.flowStatus === "reestimating" && objective.challengers.length > 0 && this.isReestimateWindowOpen(objective.confirmationDueAt)) {
        const actor = this.actorForMemberName(this.world.rng.pick(objective.challengers));
        if (actor) {
          actions.push(async () => {
            await this.runStep({ action: "seeded-mutation-member-propose-metric", actor, expectedState, objectiveKey }, async () => {
              const title = `${objective.title} 随机成员指标 ${nextStep}`;
              const response = await this.world.real.apiAs<{ result: { id: string } }>(this.world.users[actor], "/api/results", {
                body: JSON.stringify({
                  objectiveId: objective.id,
                  title,
                  metricName: `${title} metric`,
                  source: "memberProposed",
                }),
                method: "POST",
              });
              expect(response.status, `seeded member metric create ${objective.title}`).toBe(200);
              this.world.recordResult(objectiveKey, response.body.result.id);
            }, { includeApiVisibility: false });
          });
        }
      }

      if (workItemMutationStatuses.has(objective.flowStatus) && objectiveResults.length > 0) {
        const actor = this.actorForMemberName(objective.challengers[0] ?? "") ?? "commander";
        actions.push(async () => {
          await this.runStep({ action: "seeded-mutation-add-task", actor, expectedState, objectiveKey }, async () => {
            await this.world.dsl.addTask(this.world.users[actor], objective.id, `${objective.title} 随机行动项 ${nextStep}`);
          }, { includeApiVisibility: false });
        });

        const task = objectiveTasks[0];
        if (task) {
          actions.push(async () => {
            await this.runStep({ action: "seeded-mutation-add-subtask", actor, expectedState, objectiveKey }, async () => {
              await this.world.dsl.addSubtask(this.world.users[actor], task.id, `${objective.title} 随机子行动项 ${nextStep}`);
            }, { includeApiVisibility: false });
          });
        }
      }

      if (commentMutationStatuses.has(objective.flowStatus)) {
        const actor = this.actorForMemberName(objective.challengers[0] ?? "") ?? "commander";
        actions.push(async () => {
          await this.runStep({ action: "seeded-mutation-add-comment", actor, expectedState, objectiveKey }, async () => {
            const response = await this.world.real.apiAs(this.world.users[actor], "/api/comments", {
              body: JSON.stringify({
                targetType: "objective",
                targetId: objective.id,
                targetTitle: objective.title,
                body: `${objective.title} 随机评论 ${nextStep}`,
              }),
              method: "POST",
            });
            expect(response.status, `seeded comment create ${objective.title}`).toBe(200);
          }, { includeApiVisibility: false });
        });
      }
    }

    return actions;
  }

  private actorForMemberName(memberName: string): LifecycleActor | null {
    const entry = Object.entries(this.world.users).find(([, user]) => user.name === memberName);
    return entry ? (entry[0] as LifecycleActor) : null;
  }

  private isReestimateWindowOpen(confirmationDueAt?: string | null) {
    if (!confirmationDueAt) return true;
    const dueAt = new Date(confirmationDueAt).getTime();
    return Number.isFinite(dueAt) && Date.now() <= dueAt;
  }

  private createLog(meta: LifecycleStepMeta): LifecycleStepLog {
    const objective = meta.objectiveKey ? this.world.objectives.get(meta.objectiveKey) : undefined;
    return {
      action: meta.action,
      actor: meta.actor,
      expectedState: meta.expectedState,
      objectiveId: objective?.id,
      objectiveTitle: objective?.title,
      seed: this.world.seed,
      stepIndex: this.stepIndex,
    };
  }

  private async refreshLogState(log: LifecycleStepLog, meta: LifecycleStepMeta) {
    const objective = meta.objectiveKey ? this.world.objectives.get(meta.objectiveKey) : undefined;
    log.objectiveId = objective?.id ?? log.objectiveId;
    log.objectiveTitle = objective?.title ?? log.objectiveTitle;
    if (!log.objectiveId) return;

    const data = await this.world.real.taskData();
    const current = data.objectives.find((item) => item.id === log.objectiveId);
    log.actualState = current?.flowStatus ?? "missing";
  }

  private async attachProgressScreenshot(actor: LifecycleActor, log: LifecycleStepLog) {
    const page = this.world.pageOrCommander(actor);
    if (!page) return;
    await this.world.real.attachScreenshot(page, this.testInfo, `lifecycle-step-${log.stepIndex}-${actor}-${log.action}`);
  }

  private async attachFailureContext(actor: LifecycleActor, log: LifecycleStepLog) {
    const page = this.world.pageOrCommander(actor);
    if (page) {
      await this.world.real.attachScreenshot(page, this.testInfo, `lifecycle-failure-step-${log.stepIndex}-${actor}`);
    }

    await this.attachJson("lifecycle-failure-step-log", log);
    await this.attachJson("lifecycle-step-log", this.world.stepLogs);
    await this.attachJson("lifecycle-objective-snapshot", await this.objectiveSnapshot(log.objectiveId));
    await this.attachJson("lifecycle-user-visibility", await this.visibilitySnapshot());
  }

  private async objectiveSnapshot(objectiveId?: string) {
    const data = await this.world.real.taskData();
    const objectiveIds = objectiveId
      ? new Set([objectiveId])
      : new Set([...this.world.objectives.values()].map((objective) => objective.id).filter(Boolean) as string[]);
    const resultIds = new Set(data.results.filter((result) => objectiveIds.has(result.objectiveId)).map((result) => result.id));
    const taskIds = new Set(data.tasks.filter((task) => objectiveIds.has(task.linkedObjectiveId)).map((task) => task.id));

    return {
      comments: data.comments.filter((thread) => objectiveIds.has(thread.targetId) || resultIds.has(thread.targetId) || taskIds.has(thread.targetId)),
      objectiveContributionReviews: data.objectiveContributionReviews.filter((review) => objectiveIds.has(review.objectiveId)),
      objectiveLoot: data.objectiveLoot.filter((loot) => objectiveIds.has(loot.objectiveId)),
      objectives: data.objectives.filter((objective) => objectiveIds.has(objective.id)),
      pointLedger: data.pointLedger.filter((entry) => objectiveIds.has(entry.objectiveId)),
      results: data.results.filter((result) => objectiveIds.has(result.objectiveId)),
      tasks: data.tasks.filter((task) => objectiveIds.has(task.linkedObjectiveId)),
    };
  }

  private async visibilitySnapshot() {
    const snapshot: Record<string, unknown> = {};
    for (const actor of ["commander", "member1", "member2", "member3", "member4", "member5", "member6", "observer", "disabled"] as const) {
      const user = this.world.users[actor];
      const [tasksPage, bounties, allScope, orfState] = await Promise.all([
        this.world.real.apiAs<{ objectives?: Array<{ id: string; title: string; flowStatus: string }> }>(user, "/api/tasks-page"),
        this.world.real.apiAs<{ availableItems?: Array<{ objective: { title: string } }>; recruitmentItems?: Array<{ objective: { title: string } }> }>(user, "/api/bounties"),
        this.world.real.apiAs(user, "/api/my-challenges?scope=all"),
        this.world.real.apiAs(user, "/api/orf-state"),
      ]);
      snapshot[actor] = {
        allScopeStatus: allScope.status,
        bounties: {
          available: bounties.body && typeof bounties.body === "object" && "availableItems" in bounties.body
            ? bounties.body.availableItems?.map((item) => item.objective.title)
            : [],
          recruitment: bounties.body && typeof bounties.body === "object" && "recruitmentItems" in bounties.body
            ? bounties.body.recruitmentItems?.map((item) => item.objective.title)
            : [],
          status: bounties.status,
        },
        orfStateStatus: orfState.status,
        tasksPage: {
          objectives: tasksPage.body && typeof tasksPage.body === "object" && "objectives" in tasksPage.body
            ? tasksPage.body.objectives?.map((objective) => ({ flowStatus: objective.flowStatus, id: objective.id, title: objective.title }))
            : [],
          status: tasksPage.status,
        },
        user: { id: user.id, name: user.name, role: user.role, status: user.status ?? "active" },
      };
    }
    return snapshot;
  }

  private async attachJson(name: string, value: unknown) {
    await this.testInfo.attach(name, {
      body: Buffer.from(JSON.stringify(value, null, 2)),
      contentType: "application/json",
    });
  }
}

function parseLifecycleSeed() {
  const raw = process.env.ORF_LIFECYCLE_SEED ?? "20260518";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 20260518;
}

function parseLifecycleSteps() {
  const raw = process.env.ORF_LIFECYCLE_STEPS ?? "80";
  const parsed = Number.parseInt(raw, 10);
  return Math.max(80, Number.isFinite(parsed) ? parsed : 80);
}

function expectedStateFailureMessage(log: LifecycleStepLog) {
  return [
    `ORF lifecycle expectedState mismatch: seed=${log.seed}`,
    `step=${log.stepIndex}`,
    `actor=${log.actor}`,
    `action=${log.action}`,
    `objectiveTitle=${log.objectiveTitle ?? "n/a"}`,
    `objectiveId=${log.objectiveId ?? "n/a"}`,
  ].join(" ");
}

function withLifecycleContext(error: unknown, log: LifecycleStepLog) {
  const message = [
    `ORF lifecycle simulation failed: seed=${log.seed}`,
    `step=${log.stepIndex}`,
    `actor=${log.actor}`,
    `action=${log.action}`,
    `objectiveTitle=${log.objectiveTitle ?? "n/a"}`,
    `objectiveId=${log.objectiveId ?? "n/a"}`,
    `expectedState=${log.expectedState ?? "n/a"}`,
    `actualState=${log.actualState ?? "n/a"}`,
  ].join(" ");

  if (error instanceof Error) {
    error.message = `${message}\n${error.message}`;
    return error;
  }

  return new Error(`${message}\n${String(error)}`);
}
