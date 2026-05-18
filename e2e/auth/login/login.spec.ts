import { test } from "@playwright/test";
import { action, clean, setup } from "./login.actions";
import { closeLoginTestDb } from "./login.helpers";
import { B, S0, S1 } from "./login.states";
import type { SetupState, TestContext } from "./login.context";

test.describe("登录测试用例", () => {
  test.afterAll(async () => {
    await closeLoginTestDb();
  });

  test("普通成员可以使用正确邮箱和密码登录 ORF", async ({ context, page }) => {
    const ctx: TestContext = { context, page };

    await B(ctx);

    let setupState: SetupState | null = null;

    try {
      setupState = await setup(ctx);
      await S0(ctx, setupState);

      const actionResult = await action(ctx, setupState);

      await S1(ctx, setupState, actionResult);
    } finally {
      if (setupState) {
        await clean(ctx, setupState);
      }
      await B(ctx);
    }
  });
});
