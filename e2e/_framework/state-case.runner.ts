import { test, type Page, type TestInfo } from "@playwright/test";
import type { StateCase } from "./state-case.types";

const SCREENSHOT_ATTACHMENT_PREFIX = "state-case-screenshot";

export async function runStateCase<TContext, TSetupState, TActionResult>(
  testCase: StateCase<TContext, TSetupState, TActionResult>,
  ctx: TContext,
  testInfo?: TestInfo,
) {
  let setupState: TSetupState | undefined;
  let setupCompleted = false;
  let failedStage: string | undefined;

  testInfo?.annotations.push(
    { type: "state-case-id", description: testCase.id },
    { type: "state-case-title", description: testCase.title },
  );

  try {
    await runStage("B", async () => {
      await testCase.B(ctx);
    });

    try {
      const currentSetupState = await runStage("Setup", async () => testCase.setup(ctx));
      setupState = currentSetupState;
      setupCompleted = true;

      await runStage("S0", async () => {
        await testCase.S0(ctx, currentSetupState);
      });

      const actionResult = await runStage("Action", async () => testCase.action(ctx, currentSetupState));

      await runStage("S1", async () => {
        await testCase.S1(ctx, currentSetupState, actionResult);
      });
    } finally {
      if (setupCompleted) {
        await runStage("Clean", async () => {
          await testCase.clean(ctx, setupState as TSetupState);
        });
      }

      await runStage("B after Clean", async () => {
        await testCase.B(ctx);
      });
    }
  } finally {
    if (failedStage) {
      await attachScreenshot(ctx, testInfo, failedStage, "after-failure");
    }
  }

  async function runStage<T>(stage: string, body: () => Promise<T>): Promise<T> {
    return test.step(stage, async () => {
      try {
        return await body();
      } catch (error) {
        failedStage ??= stage;
        await attachScreenshot(ctx, testInfo, stage, "on-failure");
        throw error;
      }
    });
  }
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
