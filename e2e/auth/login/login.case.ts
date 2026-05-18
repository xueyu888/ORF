import type { StateCase } from "../../_framework/state-case.types";
import { action, clean, setup } from "./login.actions";
import type { ActionResult, SetupState, TestContext } from "./login.context";
import { B, S0, S1 } from "./login.states";

export const loginSuccessCase: StateCase<TestContext, SetupState, ActionResult> = {
  id: "auth.login.success",
  title: "普通成员可以使用正确邮箱和密码登录 ORF",

  B,
  setup,
  S0,
  action,
  S1,
  clean,
};
