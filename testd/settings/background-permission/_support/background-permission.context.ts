export type { ApiAttemptResult, BackgroundSettingsTestContext as TestContext, BackgroundSnapshots } from "../../_support/background-settings.context";

export type BackgroundPersonalCaseData = {
  email: string;
  password: string;
  name: string;
  role: "member" | "admin";
  firstPersonalBackgroundFileName: string;
  secondPersonalBackgroundFileName: string;
};
