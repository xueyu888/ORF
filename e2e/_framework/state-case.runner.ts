import { test, type TestInfo } from "@playwright/test";
import type { StateCase } from "./state-case.types";

export async function runStateCase<TContext, TSetupState, TActionResult>(
  testCase: StateCase<TContext, TSetupState, TActionResult>,
  ctx: TContext,
  testInfo?: TestInfo,
) {
  let setupState: TSetupState | undefined;
  let setupCompleted = false;

  testInfo?.annotations.push(
    { type: "state-case-id", description: testCase.id },
    { type: "state-case-title", description: testCase.title },
  );

  await test.step("B", async () => {
    await testCase.B(ctx);
  });

  try {
    const currentSetupState = await test.step("Setup", async () => testCase.setup(ctx));
    setupState = currentSetupState;
    setupCompleted = true;

    await test.step("S0", async () => {
      await testCase.S0(ctx, currentSetupState);
    });

    const actionResult = await test.step("Action", async () => testCase.action(ctx, currentSetupState));

    await test.step("S1", async () => {
      await testCase.S1(ctx, currentSetupState, actionResult);
    });
  } finally {
    if (setupCompleted) {
      await test.step("Clean", async () => {
        await testCase.clean(ctx, setupState as TSetupState);
      });
    }

    await test.step("B after Clean", async () => {
      await testCase.B(ctx);
    });
  }
}
