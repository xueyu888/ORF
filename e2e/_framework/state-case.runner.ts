import type { StateCase } from "./state-case.types";

export async function runStateCase<TContext, TSetupState, TActionResult>(
  testCase: StateCase<TContext, TSetupState, TActionResult>,
  ctx: TContext,
) {
  let setupState: TSetupState | undefined;
  let setupCompleted = false;

  await testCase.B(ctx);

  try {
    setupState = await testCase.setup(ctx);
    setupCompleted = true;

    await testCase.S0(ctx, setupState);

    const actionResult = await testCase.action(ctx, setupState);

    await testCase.S1(ctx, setupState, actionResult);
  } finally {
    if (setupCompleted) {
      await testCase.clean(ctx, setupState as TSetupState);
    }

    await testCase.B(ctx);
  }
}
