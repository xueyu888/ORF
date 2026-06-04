import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { breadcrumb } from "../src/components/appShellBreadcrumb";
import { designTokens } from "../src/config/designTokens";
import { canShowFrontend, canShowFrontendPath, frontendVisibilityByPath, frontendVisibilityTable } from "../src/config/frontendVisibility";
import { quickActions, quickPages } from "../src/config/navigation";
import type { OrfUser } from "../src/types/orf";

const adminUser: OrfUser = {
  id: "visibility-admin",
  name: "Visibility Admin",
  email: "visibility-admin@orf.test",
  role: "admin",
  status: "active",
};

const memberUser: OrfUser = {
  id: "visibility-member",
  name: "Visibility Member",
  email: "visibility-member@orf.test",
  role: "member",
  status: "active",
};

test("frontend visibility path mappings reference configured keys", () => {
  for (const [routePath, key] of Object.entries(frontendVisibilityByPath)) {
    assert.ok(frontendVisibilityTable[key], `${routePath} references missing frontend visibility key ${key}`);
  }
});

test("personal settings and system management have separate visibility contracts", () => {
  assert.equal(canShowFrontend(adminUser, "nav.personalSettings"), true);
  assert.equal(canShowFrontend(memberUser, "nav.personalSettings"), true);
  assert.equal(canShowFrontend(adminUser, "nav.systemManagement"), true);
  assert.equal(canShowFrontend(memberUser, "nav.systemManagement"), false);
  assert.equal(canShowFrontendPath(adminUser, "/settings"), true);
  assert.equal(canShowFrontendPath(memberUser, "/settings"), true);
  assert.equal(canShowFrontendPath(adminUser, "/system"), true);
  assert.equal(canShowFrontendPath(memberUser, "/system"), false);
  assert.equal(canShowFrontendPath(adminUser, "/system/members"), true);
  assert.equal(canShowFrontendPath(memberUser, "/system/members"), false);
  assert.equal(canShowFrontendPath(adminUser, "/system/permissions"), true);
  assert.equal(canShowFrontendPath(memberUser, "/system/permissions"), false);
  assert.equal(canShowFrontendPath(adminUser, "/system/settings"), true);
  assert.equal(canShowFrontendPath(memberUser, "/system/settings"), false);
  assert.equal(canShowFrontendPath(adminUser, "/settings/system"), true);
  assert.equal(canShowFrontendPath(memberUser, "/settings/system"), false);
});

test("authenticated command pages do not include the auth route", () => {
  assert.equal(
    quickPages.some((item) => item.path === "/auth"),
    false,
    "The logged-in command menu must not expose the login/register route",
  );
});

test("quick command configuration keeps creation actions separate from pages", () => {
  assert.equal(
    quickPages.some((item) => item.label === "新建目标"),
    false,
    "New objective must be a command action, not a fake page link",
  );
  assert.equal(
    quickActions.some((item) => item.action === "createObjective"),
    true,
    "Command menu must expose new objective as an executable action",
  );
});

test("app shell breadcrumb labels objective loot deep links", () => {
  assert.equal(breadcrumb("/tasks/objectives/objective-1/loot"), "目标战利品");
  assert.equal(breadcrumb("/tasks/objectives/objective-1/loot/"), "目标战利品");
  assert.doesNotMatch(
    readFileSync(path.resolve("src/components/AppShell.tsx"), "utf8"),
    /\/tasks\/bounties/,
    "AppShell must not keep obsolete bounty-task loot routes in topbar labels",
  );
});

test("sidebar keeps search separate and account actions in the avatar menu", () => {
  const source = readFileSync(path.resolve("src/components/Sidebar.tsx"), "utf8");
  const footerStart = source.indexOf('<div className="orf-sidebar-footer');
  const footerEnd = source.indexOf("</aside>", footerStart);
  assert.notEqual(footerStart, -1, "Sidebar must keep a footer region for the user panel");
  assert.notEqual(footerEnd, -1, "Sidebar footer must stay inside the aside");

  const footerSource = source.slice(footerStart, footerEnd);
  const userActionsStart = footerSource.indexOf('className="orf-sidebar-user-actions"');
  const userActionsEnd = footerSource.indexOf("</div>", userActionsStart);
  assert.notEqual(userActionsStart, -1, "Sidebar footer search must live inside the user panel action group");
  assert.notEqual(userActionsEnd, -1, "Sidebar user action group must be closed before the avatar menu");

  assert.doesNotMatch(
    footerSource.slice(0, userActionsStart),
    /aria-label="(?:搜索|设置|退出登录)"/,
    "Sidebar utilities must not return as separate footer controls above the user panel",
  );
  assert.doesNotMatch(
    footerSource,
    /className="orf-sidebar-command/,
    "Sidebar utilities must not use full-width footer command buttons",
  );
  const userActionsSource = footerSource.slice(userActionsStart, userActionsEnd);
  assert.match(userActionsSource, /aria-label="搜索"/, "Sidebar search must remain a separate icon action");
  assert.doesNotMatch(
    userActionsSource,
    /aria-label="(?:设置|退出登录)"/,
    "Sidebar account actions must move from utility icons into the avatar menu",
  );

  const userMenuStart = footerSource.indexOf('className="orf-sidebar-user-menu"');
  assert.notEqual(userMenuStart, -1, "Sidebar user avatar must open an account menu");
  for (const label of ["查看头像", "个人设置", "退出登录"]) {
    assert.ok(
      footerSource.indexOf(label, userMenuStart) > userMenuStart,
      `Sidebar avatar menu must include ${label}`,
    );
  }
});

test("app shell chrome keeps sidebar and icons compact", () => {
  assert.equal(designTokens.size.sidebarWidth, "260px");
  assert.equal(designTokens.size.sidebarCollapsedWidth, "76px");
  assert.equal(designTokens.size.topbarHeight, "60px");

  const sidebarSource = readFileSync(path.resolve("src/components/Sidebar.tsx"), "utf8");
  const appShellSource = readFileSync(path.resolve("src/components/AppShell.tsx"), "utf8");
  const stylesSource = readFileSync(path.resolve("src/styles.css"), "utf8");
  assert.match(sidebarSource, /<item\.icon className="orf-sidebar-icon h-4 w-4 shrink-0" \/>/);
  assert.doesNotMatch(sidebarSource, /PanelLeft(?:Open|Close) className="h-6 w-6"/);
  assert.doesNotMatch(appShellSource, /orf-topbar[^\n"]*border-b/);
  assert.doesNotMatch(stylesSource, /\.orf-topbar::(?:before|after)/);
});

test("system messages stay out of the primary sidebar navigation", () => {
  const navigationSource = readFileSync(path.resolve("src/config/navigation.ts"), "utf8");
  const sidebarSource = readFileSync(path.resolve("src/components/Sidebar.tsx"), "utf8");
  assert.match(navigationSource, /label: "消息"/, "Messages should remain reachable through global navigation data");
  assert.doesNotMatch(sidebarSource, /labels: \[[^\]]*"消息"/, "Messages must not become a primary sidebar item");
});

test("feedback creation page actions use team-level feedback capability", () => {
  for (const file of [
    path.resolve("src/components/AppShell.tsx"),
    path.resolve("src/pages/FeedbackInboxPage.tsx"),
  ]) {
    assert.match(readFileSync(file, "utf8"), /canCreateFeedbackFromVisibleState/, `${file} must use the team feedback capability helper`);
  }

  assert.match(
    readFileSync(path.resolve("src/pages/AIEvaluationPage.tsx"), "utf8"),
    /canCreateFeedbackForResult/,
    "AI evaluation failure samples must reuse the feedback capability helper",
  );
});

test("new feedback modal keeps feedback source internal", () => {
  const source = readFileSync(path.resolve("src/components/GlobalModals.tsx"), "utf8");
  assert.match(source, /const INTERNAL_FEEDBACK_SOURCE = "Team review" as const;/);
  assert.match(source, /source: INTERNAL_FEEDBACK_SOURCE/);
  assert.doesNotMatch(source, /<Field label="来源"/);
  assert.doesNotMatch(source, /关联指标/);
  assert.doesNotMatch(source, /linkedResultId/);
  assert.doesNotMatch(source, /"User report"/);
});

test("route table keeps feedback issue detail while obsolete metric detail routes stay removed", () => {
  const appSource = readFileSync(path.resolve("src/App.tsx"), "utf8");
  assert.doesNotMatch(appSource, /objectives\/:objectiveId"\s+element=/, "Objective detail route must stay removed");
  assert.doesNotMatch(appSource, /objectives\/:objectiveId\/results\/:resultId/, "Result detail route must stay removed");
  assert.match(appSource, /feedback\/:feedbackId/, "Feedback issue detail route must exist");
  assert.doesNotMatch(appSource, /path="objectives\/:objectiveId\/loot"/, "Old objective loot route must stay removed");
  assert.match(appSource, /tasks\/objectives\/:objectiveId\/loot/, "Loot detail route remains under the challenge task domain");
});

test("feedback issue detail composes the shared comment system", () => {
  const source = readFileSync(path.resolve("src/pages/FeedbackIssuePage.tsx"), "utf8");
  assert.match(source, /targetType:\s*"feedback"/);
  assert.match(source, /CommentComposer/);
  assert.match(source, /loadCommentMentionableUsers/);
  assert.doesNotMatch(source, /关联指标|linkedResultId|linkedObjectiveId/);
});

test("frontend visibility rules are only accessed through the shared helpers", () => {
  const files = sourceFiles(path.resolve("src")).filter(
    (file) => !file.endsWith(path.join("src", "config", "frontendVisibility.ts")) && !file.endsWith(path.join("src", "state", "OrfProvider.tsx")),
  );

  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/\badminOnlyPaths\b/, "must not define local admin-only path lists"],
    [/\bRequireAdmin\b/, "must not define local admin-only route wrappers"],
    [/\bisAdmin\s*&&/, "must not use isAdmin for frontend visibility"],
    [/!\s*isAdmin\b/, "must not use isAdmin for frontend visibility"],
    [/\bisAdmin\s*\?/, "must not use isAdmin for frontend visibility"],
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const [pattern, message] of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${file} ${message}; use src/config/frontendVisibility.ts`);
    }
  }
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...sourceFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}
