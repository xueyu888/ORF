export type TestdCaseChangePolicy = "open" | "locked";

export type TestdCaseConfig = {
  id: string;
  title: string;
  doc: string;
  // locked cases are manually confirmed; batch edits should skip them unless explicitly named.
  changePolicy: TestdCaseChangePolicy;
  enabled: boolean;
  fixtureLifecycle?: "isolated" | "legacy-base-data";
  // Omitted for imported disabled cases until document-to-StepSpec mapping is verified.
  traceability?: "verified";
  spec?: string;
  note?: string;
};

// Keep this list in the same order as testd-doc/cases/测试用例集合.md.
export const testdCases = [
  {
    id: "auth.register.approve-login",
    title: "账号注册登录",
    doc: "testd-doc/cases/auth/用户注册.md",
    changePolicy: "locked",
    spec: "testd/auth/register/_entry/register.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "auth.register.invalid-email",
    title: "账号注册登录-非邮箱账号",
    doc: "testd-doc/cases/auth/账号注册登录-非邮箱账号.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "auth.member.login",
    title: "member 登录",
    doc: "testd-doc/cases/auth/member登录.md",
    changePolicy: "locked",
    spec: "testd/auth/mlogin/_entry/mlogin.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "auth.member.login-wrong-password",
    title: "member登录-错误密码",
    doc: "testd-doc/cases/auth/member登录-错误密码.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "auth.admin.login",
    title: "admin 登录",
    doc: "testd-doc/cases/auth/admin登录.md",
    changePolicy: "locked",
    spec: "testd/auth/alogin/_entry/alogin.spec.ts",
    enabled: true,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "auth.admin.login-wrong-password",
    title: "admin登录-错误密码",
    doc: "testd-doc/cases/auth/admin登录-错误密码.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "objectives.publish",
    title: "管理员新增并发布目标",
    doc: "testd-doc/cases/objectives/管理员新增并发布目标.md",
    changePolicy: "locked",
    spec: "testd/objectives/publish/_entry/objective-publish.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "objectives.publish.member-forbidden",
    title: "管理员新增并发布目标-普通成员不可新增目标",
    doc: "testd-doc/cases/objectives/管理员新增并发布目标-普通成员不可新增目标.md",
    changePolicy: "locked",
    spec: "testd/objectives/publish-member-forbidden/_entry/objective-create-forbidden.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "bounties.recruit-member",
    title: "管理员征召成员执行目标",
    doc: "testd-doc/cases/bounties/管理员征召成员执行目标.md",
    changePolicy: "locked",
    spec: "testd/bounties/recruit-member/_entry/recruit-member.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "bounties.recruit-member.member-forbidden",
    title: "管理员征召成员执行目标-普通成员不可征召成员",
    doc: "testd-doc/cases/bounties/管理员征召成员执行目标-普通成员不可征召成员.md",
    changePolicy: "locked",
    spec: "testd/bounties/recruit-member-member-forbidden/_entry/recruit-member-forbidden.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "bounties.review-application",
    title: "成员申请挑战审批",
    doc: "testd-doc/cases/bounties/成员申请挑战审批.md",
    changePolicy: "locked",
    spec: "testd/bounties/review-application/_entry/review-application.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "bounties.review-application.member-forbidden",
    title: "成员申请挑战审批-普通成员不可审批申请",
    doc: "testd-doc/cases/bounties/成员申请挑战审批-普通成员不可审批申请.md",
    changePolicy: "locked",
    spec: "testd/bounties/review-application-member-forbidden/_entry/review-application-forbidden.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "bounties.apply-challenge",
    title: "悬赏大厅申请挑战",
    doc: "testd-doc/cases/bounties/悬赏大厅申请挑战.md",
    changePolicy: "open",
    spec: "testd/bounties/apply-challenge/_entry/apply-challenge.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "bounties.apply-challenge.unauthenticated",
    title: "悬赏大厅申请挑战-未登录不可申请挑战",
    doc: "testd-doc/cases/bounties/悬赏大厅申请挑战-未登录不可申请挑战.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "results.admin-create",
    title: "管理员新增指标",
    doc: "testd-doc/cases/results/管理员新增指标.md",
    changePolicy: "open",
    spec: "testd/results/admin-create-result/_entry/admin-create-result.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "results.admin-create.member-forbidden",
    title: "管理员新增指标-普通成员不可新增指标",
    doc: "testd-doc/cases/results/管理员新增指标-普通成员不可新增指标.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "results.member-propose",
    title: "成员提出指标",
    doc: "testd-doc/cases/results/成员提出指标.md",
    changePolicy: "open",
    spec: "testd/results/member-propose-result/_entry/member-propose-result.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "results.member-propose.non-participant-forbidden",
    title: "成员提出指标-非参与成员不可提出指标",
    doc: "testd-doc/cases/results/成员提出指标-非参与成员不可提出指标.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "tasks.member-create-task",
    title: "用户增加行动项和子行动项",
    doc: "testd-doc/cases/tasks/用户增加行动项和子行动项.md",
    changePolicy: "open",
    spec: "testd/tasks/member-create-task/_entry/member-create-task.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "tasks.member-create-task.forbidden",
    title: "用户增加行动项和子行动项-无权限用户不可增加",
    doc: "testd-doc/cases/tasks/用户增加行动项和子行动项-无权限用户不可增加.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "implementation.admin-freeze-objective",
    title: "管理员冻结目标进入实施阶段",
    doc: "testd-doc/cases/implementation/管理员冻结目标进入实施阶段.md",
    changePolicy: "open",
    spec: "testd/implementation/admin-freeze-objective/_entry/admin-freeze-objective.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "implementation.admin-freeze-objective.member-forbidden",
    title: "管理员冻结目标进入实施阶段-普通成员不可冻结目标",
    doc: "testd-doc/cases/implementation/管理员冻结目标进入实施阶段-普通成员不可冻结目标.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "implementation.member-cannot-propose-result-frozen",
    title: "实施阶段成员不可提出指标",
    doc: "testd-doc/cases/implementation/实施阶段成员不可提出指标.md",
    changePolicy: "open",
    spec: "testd/implementation/member-cannot-propose-result-frozen/_entry/member-cannot-propose-result-frozen.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "implementation.member-can-propose-result-evaluation",
    title: "实施阶段成员不可提出指标-评估阶段成员可提出指标",
    doc: "testd-doc/cases/implementation/实施阶段成员不可提出指标-评估阶段成员可提出指标.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "implementation.admin-cannot-create-result-frozen",
    title: "实施阶段管理员不可新增指标",
    doc: "testd-doc/cases/implementation/实施阶段管理员不可新增指标.md",
    changePolicy: "open",
    spec: "testd/implementation/admin-cannot-create-result-frozen/_entry/admin-cannot-create-result-frozen.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "implementation.admin-can-create-result-evaluation",
    title: "实施阶段管理员不可新增指标-评估阶段管理员可新增指标",
    doc: "testd-doc/cases/implementation/实施阶段管理员不可新增指标-评估阶段管理员可新增指标.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "acceptance.member-submit-loot",
    title: "成员提交战利品",
    doc: "testd-doc/cases/acceptance/成员提交战利品.md",
    changePolicy: "open",
    spec: "testd/acceptance/member-submit-loot/_entry/member-submit-loot.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "acceptance.member-submit-loot.non-challenger-forbidden",
    title: "成员提交战利品-非挑战成员不可提交",
    doc: "testd-doc/cases/acceptance/成员提交战利品-非挑战成员不可提交.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "acceptance.member-submit-peer-review",
    title: "成员提交匿名互评",
    doc: "testd-doc/cases/acceptance/成员提交匿名互评.md",
    changePolicy: "open",
    spec: "testd/acceptance/member-submit-peer-review/_entry/member-submit-peer-review.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "acceptance.member-submit-peer-review.non-participant-forbidden",
    title: "成员提交匿名互评-非参与成员不可互评",
    doc: "testd-doc/cases/acceptance/成员提交匿名互评-非参与成员不可互评.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "acceptance.view-final-score",
    title: "查看最终分数",
    doc: "testd-doc/cases/acceptance/查看最终分数.md",
    changePolicy: "open",
    spec: "testd/acceptance/view-final-score/_entry/view-final-score.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "acceptance.view-final-score.before-accepted-forbidden",
    title: "查看最终分数-未验收完成不可查看",
    doc: "testd-doc/cases/acceptance/查看最终分数-未验收完成不可查看.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "acceptance.admin-review-loot",
    title: "管理员验收战利品",
    doc: "testd-doc/cases/acceptance/管理员验收战利品.md",
    changePolicy: "open",
    spec: "testd/acceptance/admin-review-loot/_entry/admin-review-loot.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "acceptance.admin-review-loot.member-forbidden",
    title: "管理员验收战利品-普通成员不可验收",
    doc: "testd-doc/cases/acceptance/管理员验收战利品-普通成员不可验收.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "statistics.member-score",
    title: "成员分数统计",
    doc: "testd-doc/cases/statistics/成员分数统计.md",
    changePolicy: "open",
    spec: "testd/statistics/member-score-statistics/_entry/member-score-statistics.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "statistics.member-score.empty",
    title: "成员分数统计-无分数时显示空状态",
    doc: "testd-doc/cases/statistics/成员分数统计-无分数时显示空状态.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "members.admin-edit",
    title: "管理员编辑成员",
    doc: "testd-doc/cases/members/管理员编辑成员.md",
    changePolicy: "locked",
    spec: "testd/members/admin-edit-member/_entry/admin-edit-member.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "members.admin-edit.member-forbidden",
    title: "管理员编辑成员-普通成员不可编辑成员",
    doc: "testd-doc/cases/members/管理员编辑成员-普通成员不可编辑成员.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "permissions.member.update",
    title: "管理员修改member权限",
    doc: "testd-doc/cases/permissions/管理员修改member权限.md",
    changePolicy: "locked",
    spec: "testd/permissions/member-permission/_entry/admin-permission.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "permissions.member.update.member-forbidden",
    title: "管理员修改member权限-普通成员不可修改",
    doc: "testd-doc/cases/permissions/管理员修改member权限-普通成员不可修改.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "comments.objective-comment",
    title: "目标新增评论",
    doc: "testd-doc/cases/comments/目标新增评论.md",
    changePolicy: "locked",
    spec: "testd/comments/objective-comment/_entry/objective-comment.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "comments.objective-comment.unauthenticated",
    title: "目标新增评论-未登录不可评论",
    doc: "testd-doc/cases/comments/目标新增评论-未登录不可评论.md",
    changePolicy: "open",
    enabled: false,
    note: "测试代码待实现",
  },
  {
    id: "settings.background-permission",
    title: "设置页面修改背景",
    doc: "testd-doc/cases/settings/设置页面修改背景.md",
    changePolicy: "locked",
    spec: "testd/settings/background-permission/_entry/background-permission.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
  {
    id: "settings.background-admin",
    title: "设置页面修改背景-管理员可以修改背景",
    doc: "testd-doc/cases/settings/设置页面修改背景-管理员可以修改背景.md",
    changePolicy: "locked",
    spec: "testd/settings/background-admin/_entry/background-admin.spec.ts",
    enabled: false,
    fixtureLifecycle: "isolated",
    traceability: "verified",
  },
] satisfies TestdCaseConfig[];

const enabledCasesWithoutSpec = testdCases.filter((testdCase) => testdCase.enabled && !testdCase.spec);
if (enabledCasesWithoutSpec.length > 0) {
  throw new Error(
    `testd config enabled cases without spec: ${enabledCasesWithoutSpec
      .map((testdCase) => `${testdCase.id} (${testdCase.title})`)
      .join(", ")}`,
  );
}

const enabledCasesWithoutTraceability = testdCases.filter(
  (testdCase) => testdCase.enabled && testdCase.traceability !== "verified",
);
if (enabledCasesWithoutTraceability.length > 0) {
  throw new Error(
    `testd config enabled cases without verified traceability: ${enabledCasesWithoutTraceability
      .map((testdCase) => `${testdCase.id} (${testdCase.title})`)
      .join(", ")}`,
  );
}

const executableCasesWithoutIsolatedFixtures = testdCases.filter(
  (testdCase) =>
    (testdCase.enabled || testdCase.traceability === "verified") &&
    testdCase.fixtureLifecycle !== "isolated",
);
if (executableCasesWithoutIsolatedFixtures.length > 0) {
  throw new Error(
    `testd config executable cases without isolated fixture lifecycle: ${executableCasesWithoutIsolatedFixtures
      .map((testdCase) => `${testdCase.id} (${testdCase.title})`)
      .join(", ")}`,
  );
}

export const disabledTestdSpecGlobs = testdCases
  .filter((testdCase) => testdCase.spec && !testdCase.enabled)
  .map((testdCase) => `**/${testdCase.spec}`);
