import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { breadcrumb } from "../src/components/appShellBreadcrumb";
import { canShowFrontend, canShowFrontendPath, frontendVisibilityByPath, frontendVisibilityTable } from "../src/config/frontendVisibility";
import { quickPages } from "../src/config/navigation";
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

test("visual settings are only visible to administrators", () => {
  assert.equal(canShowFrontend(adminUser, "nav.settings"), true);
  assert.equal(canShowFrontend(memberUser, "nav.settings"), false);
  assert.equal(canShowFrontendPath(adminUser, "/settings"), true);
  assert.equal(canShowFrontendPath(memberUser, "/settings"), false);
});

test("authenticated command pages do not include the auth route", () => {
  assert.equal(
    quickPages.some((item) => item.path === "/auth"),
    false,
    "The logged-in command menu must not expose the login/register route",
  );
});

test("app shell breadcrumb labels objective loot deep links", () => {
  assert.equal(breadcrumb("/objectives/objective-1/loot"), "目标战利品");
  assert.equal(breadcrumb("/objectives/objective-1/loot/"), "目标战利品");
  assert.doesNotMatch(
    readFileSync(path.resolve("src/components/AppShell.tsx"), "utf8"),
    /\/tasks\/bounties/,
    "AppShell must not keep obsolete bounty-task loot routes in topbar labels",
  );
});

test("feedback creation page actions use visible objective participation", () => {
  for (const file of [
    path.resolve("src/components/AppShell.tsx"),
    path.resolve("src/pages/FeedbackInboxPage.tsx"),
    path.resolve("src/pages/ObjectiveDetailPage.tsx"),
  ]) {
    assert.match(readFileSync(file, "utf8"), /canCreateFeedback(FromVisibleState|ForObjective)/, `${file} must hide feedback creation without objective participation`);
  }

  assert.match(
    readFileSync(path.resolve("src/pages/ResultDetailPage.tsx"), "utf8"),
    /canCreateFeedbackForResult/,
    "Result detail must hide feedback creation without objective participation",
  );
  assert.match(
    readFileSync(path.resolve("src/pages/AIEvaluationPage.tsx"), "utf8"),
    /canCreateFeedbackForResult/,
    "AI evaluation failure samples must hide feedback creation without objective participation",
  );
});

test("detail pages do not keep inert placeholder action buttons", () => {
  assert.doesNotMatch(
    readFileSync(path.resolve("src/pages/ObjectiveDetailPage.tsx"), "utf8"),
    /MoreHorizontal/,
    "Objective detail must not render a placeholder more-actions button without behavior",
  );
  assert.doesNotMatch(
    readFileSync(path.resolve("src/pages/FeedbackDetailPage.tsx"), "utf8"),
    /补充回归样本/,
    "Feedback detail must not render recommendation buttons that do not trigger a product action",
  );
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
