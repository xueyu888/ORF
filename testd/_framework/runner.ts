import { randomUUID } from "node:crypto";
import { test, type Page, type TestInfo } from "@playwright/test";
import type {
  ActionBlock,
  OperatorRegistry,
  StateBlock,
  StateCaseRunStageName,
  StateCaseSpec,
  StateCaseRuntime,
  StepParams,
  StepSpec,
} from "./types";
import {
  createTestdRunScope,
  scopeStateCaseSpec,
} from "./run-scope";
import {
  acquireRolePermissionLock,
  acquireRolePermissionReadLock,
  releaseRolePermissionLock,
} from "../_operators/role-permission-lock";
import {
  createTestdInterruptError,
  installTestdInterruptHandlers,
  isTestdInterruptError,
  isTestdInterruptRequested,
  markTestdCaseCleanupComplete,
  markTestdCaseCleanupRequired,
  waitForTestdInterruptWrapperTermination,
} from "./interrupt";
import {
  claimStaleTestdRecoveryCases,
  isTestdRecoveryOnly,
  markTestdRecoveryCleanupCompleted,
  markTestdRecoveryCleanupFailed,
  markTestdRecoveryCleanupStarted,
  recordTestdRecoveryStepComplete,
  recordTestdRecoveryStepFailed,
  recordTestdRecoveryStepStart,
  registerTestdRecoveryCase,
  registerTestdRecoveryRun,
  type TestdRecoveryCaseRecord,
} from "./recovery";

const SCREENSHOT_ATTACHMENT_PREFIX = "state-case-screenshot";

type RecoveryTarget = {
  runId: string;
  caseId: string;
  markerId: string;
};

type RunStateCaseOptions<
  TContext,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = {
  operators: OperatorRegistry<TContext, TData>;
  testInfo?: TestInfo;
};

export async function runStateCase<
  TContext,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(
  testCase: StateCaseSpec<TData>,
  ctx: TContext,
  options: RunStateCaseOptions<TContext, TData>,
) {
  installTestdInterruptHandlers();

  const runScope = createTestdRunScope(testCase, options.testInfo);
  const scopedTestCase = scopeStateCaseSpec(testCase, runScope);
  const cleanupMarkerId = `${process.pid}-${randomUUID()}`;
  const runtime: StateCaseRuntime = { values: {} };
  let failedStage: StateCaseRunStageName | undefined;
  let rolePermissionLockOwner: string | undefined;
  let cleanupRequired = false;

  options.testInfo?.annotations.push(
    { type: "state-case-id", description: testCase.id },
    { type: "state-case-title", description: testCase.title },
    { type: "testd-run-id", description: runScope.runId },
  );

  try {
    rolePermissionLockOwner = stateCaseWritesRolePermissions(testCase)
      ? await acquireRolePermissionLock()
      : await acquireRolePermissionReadLock();

    await registerTestdRecoveryRun(runScope.runId);
    await recoverStaleCasesForCurrentTestCase();

    if (isTestdRecoveryOnly()) {
      return;
    }

    await runStateBlock("B", testCase.B, scopedTestCase, runtime);

    let primaryError: unknown;
    const recoveryTarget: RecoveryTarget = {
      runId: runScope.runId,
      caseId: scopedTestCase.id,
      markerId: cleanupMarkerId,
    };
    try {
      markTestdCaseCleanupRequired({
        markerId: cleanupMarkerId,
        testCaseId: scopedTestCase.id,
        title: scopedTestCase.title,
      });
      cleanupRequired = true;
      await registerTestdRecoveryCase({
        runId: runScope.runId,
        markerId: cleanupMarkerId,
        testCase: scopedTestCase,
        workerIndex: runScope.workerIndex,
      });
      await runActionBlock("Setup", testCase.Setup, scopedTestCase, runtime, recoveryTarget);
      await runStateBlock("S0", testCase.S0, scopedTestCase, runtime, recoveryTarget);
      await runActionBlock("Action", testCase.Action, scopedTestCase, runtime, recoveryTarget);
      await runStateBlock("S1", testCase.S1, scopedTestCase, runtime, recoveryTarget);
    } catch (error) {
      primaryError = error;
    }

    let cleanCompleted = false;
    primaryError = await runCleanupBlock("Clean", async () => {
      await markTestdRecoveryCleanupStarted(recoveryTarget);
      await runActionBlock("Clean", testCase.Clean, scopedTestCase, runtime, recoveryTarget);
      cleanCompleted = true;
      if (cleanupRequired) {
        await markTestdRecoveryCleanupCompleted({ ...recoveryTarget, runtime });
        markTestdCaseCleanupComplete({ markerId: cleanupMarkerId, testCaseId: scopedTestCase.id });
      }
    }, primaryError);

    if (isTestdInterruptRequested()) {
      if (!primaryError) {
        primaryError = createTestdInterruptError();
      }
      if (cleanCompleted) {
        await waitForTestdInterruptWrapperTermination();
      }
    }

    if (!isTestdInterruptRequested() && !isTestdInterruptError(primaryError)) {
      primaryError = await runCleanupBlock(
        "B after Clean",
        () => runStateBlock("B after Clean", testCase.B, scopedTestCase, runtime),
        primaryError,
      );
    }

    if (primaryError) {
      throw primaryError;
    }
  } finally {
    const releaseError = await releaseRolePermissionLock(rolePermissionLockOwner).catch((error: unknown) => error);
    if (failedStage) {
      await attachScreenshot(ctx, options.testInfo, failedStage, "after-failure");
    }
    if (releaseError && !failedStage) {
      throw releaseError;
    }
  }

  async function runCleanupBlock(
    stage: StateCaseRunStageName,
    body: () => Promise<void>,
    primaryError: unknown,
  ) {
    try {
      await body();
      return primaryError;
    } catch (error) {
      failedStage ??= stage;
      if (stage === "Clean") {
        await markTestdRecoveryCleanupFailed({
          runId: runScope.runId,
          caseId: scopedTestCase.id,
          markerId: cleanupMarkerId,
          runtime,
          error,
        });
      }
      return primaryError ?? error;
    }
  }

  async function runStateBlock(
    stage: StateCaseRunStageName,
    block: StateBlock,
    activeTestCase: StateCaseSpec<TData>,
    activeRuntime: StateCaseRuntime,
    recoveryTarget?: RecoveryTarget,
  ) {
    await runStage(stage, async () => {
      for (const [index, step] of block.assertions.entries()) {
        await runStep(stage, step, activeTestCase, activeRuntime, index + 1, recoveryTarget);
      }
    });
  }

  async function runActionBlock(
    stage: StateCaseRunStageName,
    block: ActionBlock,
    activeTestCase: StateCaseSpec<TData>,
    activeRuntime: StateCaseRuntime,
    recoveryTarget?: RecoveryTarget,
  ) {
    await runStage(stage, async () => {
      for (const [index, step] of block.steps.entries()) {
        await runStep(stage, step, activeTestCase, activeRuntime, index + 1, recoveryTarget);
      }
    });
  }

  async function runStage<T>(stage: StateCaseRunStageName, body: () => Promise<T>): Promise<T> {
    return test.step(stage, async () => {
      try {
        return await body();
      } catch (error) {
        if (!isTestdInterruptError(error)) {
          failedStage ??= stage;
          await attachScreenshot(ctx, options.testInfo, stage, "on-failure");
        }
        throw error;
      }
    });
  }

  async function runStep(
    stage: StateCaseRunStageName,
    step: StepSpec,
    activeTestCase: StateCaseSpec<TData>,
    activeRuntime: StateCaseRuntime,
    stepIndex: number,
    recoveryTarget?: RecoveryTarget,
  ) {
    await test.step(formatStepTitle(step), async () => {
      try {
        if (recoveryTarget) {
          await recordTestdRecoveryStepStart({
            ...recoveryTarget,
            stage,
            step,
            stepIndex,
          });
        }

        if (stage !== "Clean" && isTestdInterruptRequested()) {
          throw createTestdInterruptError();
        }

        const operator = options.operators[step.object]?.[step.operator];
        if (!operator) {
          throw new Error(`未注册测试算子: ${formatStepOperator(step)}`);
        }

        const params = resolveStepParams(step.params ?? {}, activeTestCase.data, activeRuntime);
        const result = await operator({
          ctx,
          data: activeTestCase.data,
          runtime: activeRuntime,
          testCase: activeTestCase,
          stage,
          step,
          params,
        });

        const saveAs = params.saveAs;
        if (typeof saveAs === "string" && result !== undefined) {
          activeRuntime.values[saveAs] = result;
        }

        if (recoveryTarget) {
          await recordTestdRecoveryStepComplete({
            ...recoveryTarget,
            stage,
            step,
            stepIndex,
            runtime: activeRuntime,
          });
        }
      } catch (error) {
        if (recoveryTarget) {
          await recordTestdRecoveryStepFailed({
            ...recoveryTarget,
            stage,
            step,
            stepIndex,
            runtime: activeRuntime,
            error,
          });
        }
        throw error;
      }
    });
  }

  async function recoverStaleCasesForCurrentTestCase() {
    const records = await claimStaleTestdRecoveryCases({
      currentRunId: runScope.runId,
      caseId: scopedTestCase.id,
    });

    for (const record of records) {
      await recoverStaleCase(record);
    }
  }

  async function recoverStaleCase(record: TestdRecoveryCaseRecord) {
    const recoveryTarget: RecoveryTarget = {
      runId: record.runId,
      caseId: record.caseId,
      markerId: record.markerId,
    };
    const recoveryRuntime: StateCaseRuntime = { values: record.runtimeValues };
    const recoveryTestCase = {
      ...scopedTestCase,
      title: record.caseTitle,
      data: record.scopedData as TData,
    };

    console.error(
      `TestD recovery 正在补清理旧运行: run=${record.runId} case=${record.caseId}`,
    );

    try {
      await markTestdRecoveryCleanupStarted(recoveryTarget);
      await runActionBlock("Clean", recoveryTestCase.Clean, recoveryTestCase, recoveryRuntime, recoveryTarget);
      await markTestdRecoveryCleanupCompleted({ ...recoveryTarget, runtime: recoveryRuntime });
      console.error(
        `TestD recovery 已完成旧运行清理: run=${record.runId} case=${record.caseId}`,
      );
    } catch (error) {
      await markTestdRecoveryCleanupFailed({
        ...recoveryTarget,
        runtime: recoveryRuntime,
        error,
      });
      throw error;
    }
  }
}

const rolePermissionWriteOperators = new Set([
  "api.permissions.update_member",
  "api.permissions.restore_member",
  "page.permissions_save.submit",
]);

function stateCaseWritesRolePermissions(testCase: StateCaseSpec) {
  return stateCaseSteps(testCase).some((step) =>
    rolePermissionWriteOperators.has(`${step.object}.${step.operator}`),
  );
}

function stateCaseSteps(testCase: StateCaseSpec) {
  return [
    ...testCase.B.assertions,
    ...testCase.Setup.steps,
    ...testCase.S0.assertions,
    ...testCase.Action.steps,
    ...testCase.S1.assertions,
    ...testCase.Clean.steps,
  ];
}

function formatStepTitle(step: StepSpec) {
  return step.source
    ? `[${step.source.caseStepId}][${step.source.method}] ${step.id}: ${step.title}`
    : `[未追溯] ${step.id}: ${step.title}`;
}

function formatStepOperator(step: StepSpec) {
  return `${step.object}.${step.operator}`;
}

function resolveStepParams(params: StepParams, data: Record<string, unknown>, runtime: StateCaseRuntime): StepParams {
  return resolveParamValue(params, data, runtime) as StepParams;
}

function resolveParamValue(value: unknown, data: Record<string, unknown>, runtime: StateCaseRuntime): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveParamValue(item, data, runtime));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const resolved: StepParams = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (key.endsWith("From") && typeof childValue === "string") {
      resolved[key.slice(0, -"From".length)] = readStateCasePath(childValue, data, runtime);
    } else {
      resolved[key] = resolveParamValue(childValue, data, runtime);
    }
  }
  return resolved;
}

function readStateCasePath(path: string, data: Record<string, unknown>, runtime: StateCaseRuntime): unknown {
  const [root, ...segments] = path.split(".");
  const source = root === "data" ? data : root === "runtime" ? runtime.values : undefined;
  if (!source) {
    return undefined;
  }

  return segments.reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

async function attachScreenshot<TContext>(
  ctx: TContext,
  testInfo: TestInfo | undefined,
  stage: string,
  moment: "on-failure" | "after-failure",
) {
  if (!testInfo) {
    return;
  }

  const page = getScreenshotPage(ctx);
  if (!page) {
    return;
  }

  try {
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach(`${SCREENSHOT_ATTACHMENT_PREFIX}:${moment}:${stage}`, {
      body: screenshot,
      contentType: "image/png",
    });
  } catch {
    // Screenshot capture must not hide the original test failure.
  }
}

function getScreenshotPage(ctx: unknown): Pick<Page, "screenshot"> | null {
  if (!ctx || typeof ctx !== "object" || !("page" in ctx)) {
    return null;
  }

  const page = (ctx as { page?: Partial<Pick<Page, "screenshot">> }).page;
  if (!page || typeof page.screenshot !== "function") {
    return null;
  }

  return page as Pick<Page, "screenshot">;
}
