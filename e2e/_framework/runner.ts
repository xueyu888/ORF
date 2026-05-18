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

const SCREENSHOT_ATTACHMENT_PREFIX = "state-case-screenshot";

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
  const runtime: StateCaseRuntime = { values: {} };
  let failedStage: StateCaseRunStageName | undefined;

  options.testInfo?.annotations.push(
    { type: "state-case-id", description: testCase.id },
    { type: "state-case-title", description: testCase.title },
  );

  try {
    await runStateBlock("B", testCase.B);

    let primaryError: unknown;
    try {
      await runActionBlock("Setup", testCase.Setup);
      await runStateBlock("S0", testCase.S0);
      await runActionBlock("Action", testCase.Action);
      await runStateBlock("S1", testCase.S1);
    } catch (error) {
      primaryError = error;
    }

    primaryError = await runCleanupBlock("Clean", () => runActionBlock("Clean", testCase.Clean), primaryError);
    primaryError = await runCleanupBlock(
      "B after Clean",
      () => runStateBlock("B after Clean", testCase.B),
      primaryError,
    );

    if (primaryError) {
      throw primaryError;
    }
  } finally {
    if (failedStage) {
      await attachScreenshot(ctx, options.testInfo, failedStage, "after-failure");
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
      return primaryError ?? error;
    }
  }

  async function runStateBlock(stage: StateCaseRunStageName, block: StateBlock) {
    await runStage(stage, async () => {
      for (const step of block.assertions) {
        await runStep(stage, step);
      }
    });
  }

  async function runActionBlock(stage: StateCaseRunStageName, block: ActionBlock) {
    await runStage(stage, async () => {
      for (const step of block.steps) {
        await runStep(stage, step);
      }
    });
  }

  async function runStage<T>(stage: StateCaseRunStageName, body: () => Promise<T>): Promise<T> {
    return test.step(stage, async () => {
      try {
        return await body();
      } catch (error) {
        failedStage ??= stage;
        await attachScreenshot(ctx, options.testInfo, stage, "on-failure");
        throw error;
      }
    });
  }

  async function runStep(stage: StateCaseRunStageName, step: StepSpec) {
    await test.step(`${step.id}: ${step.title}`, async () => {
      const operator = options.operators[step.operator];
      if (!operator) {
        throw new Error(`未注册测试算子: ${step.operator}`);
      }

      const params = resolveStepParams(step.params ?? {}, testCase.data, runtime);
      const result = await operator({
        ctx,
        data: testCase.data,
        runtime,
        testCase,
        stage,
        step,
        params,
      });

      const saveAs = params.saveAs;
      if (typeof saveAs === "string" && result !== undefined) {
        runtime.values[saveAs] = result;
      }
    });
  }
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
