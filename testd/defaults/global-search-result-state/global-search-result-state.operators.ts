import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import {
  deleteSearchFixtures,
  prepareSearchFeedback,
  prepareSearchObjective,
  prepareSearchResult,
  prepareSearchTask,
  searchFixtureAbsent,
  searchFixtureExists,
  setDefaultLandingPathByEmail,
} from "../global-search/_support/global-search.helpers";
import type { GlobalSearchResultStateCaseData, TestContext } from "./_support/global-search-result-state.context";

type SearchStateSnapshot = {
  currentUrl?: string;
  inputValue?: string;
  resultCount?: number;
  visible?: boolean;
};

export const globalSearchResultStateOperators = {
  browser: {
    clear_state: async ({ ctx }) => {
      await ctx.context.clearCookies();
      await clearBrowserState(ctx.page);
      await installDesktopShellMock(ctx.page);
    },
  },
  "user.preferences": {
    set_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), requiredString(params, "path"));
    },
    reset_default_landing_path_by_email: async ({ params }) => {
      await setDefaultLandingPathByEmail(requiredString(params, "email"), null);
    },
  },
  "db.search_objective": {
    prepare: async ({ data }) => {
      await prepareSearchObjective(searchFixtureInput(data));
    },
    delete: async ({ params }) => {
      await deleteSearchFixtures(requiredString(params, "keyword"));
    },
    exists: async ({ params }) => {
      await expect.poll(() => searchFixtureExists("objective", requiredString(params, "keyword"))).toBe(true);
    },
    absent: async ({ params }) => {
      await expect.poll(() => searchFixtureAbsent("objective", requiredString(params, "keyword"))).toBe(true);
    },
  },
  "db.search_result": {
    prepare: async ({ data }) => {
      await prepareSearchResult(searchFixtureInput(data));
    },
    delete: async ({ params }) => {
      await deleteSearchFixtures(requiredString(params, "keyword"));
    },
    exists: async ({ params }) => {
      await expect.poll(() => searchFixtureExists("result", requiredString(params, "keyword"))).toBe(true);
    },
    absent: async ({ params }) => {
      await expect.poll(() => searchFixtureAbsent("result", requiredString(params, "keyword"))).toBe(true);
    },
  },
  "db.search_task": {
    prepare: async ({ data }) => {
      await prepareSearchTask(searchFixtureInput(data));
    },
    delete: async ({ params }) => {
      await deleteSearchFixtures(requiredString(params, "keyword"));
    },
    exists: async ({ params }) => {
      await expect.poll(() => searchFixtureExists("task", requiredString(params, "keyword"))).toBe(true);
    },
    absent: async ({ params }) => {
      await expect.poll(() => searchFixtureAbsent("task", requiredString(params, "keyword"))).toBe(true);
    },
  },
  "db.search_feedback": {
    prepare: async ({ data }) => {
      await prepareSearchFeedback(searchFixtureInput(data));
    },
    delete: async ({ params }) => {
      await deleteSearchFixtures(requiredString(params, "keyword"));
    },
    exists: async ({ params }) => {
      await expect.poll(() => searchFixtureExists("feedback", requiredString(params, "keyword"))).toBe(true);
    },
    absent: async ({ params }) => {
      await expect.poll(() => searchFixtureAbsent("feedback", requiredString(params, "keyword"))).toBe(true);
    },
  },
  "topbar.global_search": {
    visible: async ({ ctx }) => {
      await expect(globalSearchTrigger(ctx.page)).toBeVisible();
    },
    enabled: async ({ ctx }) => {
      await expect(globalSearchTrigger(ctx.page)).toBeEnabled();
    },
    click: async ({ ctx }) => {
      await globalSearchTrigger(ctx.page).click();
    },
  },
  "global_search.input": {
    fill: async ({ ctx, params }) => {
      await globalSearchInput(ctx.page).fill(requiredString(params, "value"));
      if (params.captureEmptyState === true) {
        await expect(globalSearchEmpty(ctx.page)).toBeVisible();
        return { visible: await globalSearchEmpty(ctx.page).isVisible() } satisfies SearchStateSnapshot;
      }
      return undefined;
    },
    clear: async ({ ctx }) => {
      await globalSearchInput(ctx.page).fill("");
      await expect(globalSearchInput(ctx.page)).toHaveValue("");
      await expect(globalSearchResults(ctx.page).first()).toBeVisible();
      return {
        inputValue: await globalSearchInput(ctx.page).inputValue(),
        resultCount: await globalSearchResults(ctx.page).count(),
      } satisfies SearchStateSnapshot;
    },
  },
  "global_search.result": {
    click: async ({ ctx, params }) => {
      await searchResultRow(ctx.page, requiredString(params, "label"), requiredString(params, "typeLabel")).click();
      await expect(ctx.page).toHaveURL(new RegExp(requiredString(params, "urlPattern")));
      return {
        currentUrl: ctx.page.url(),
      } satisfies SearchStateSnapshot;
    },
  },
  "global_search.close": {
    click: async ({ ctx }) => {
      await globalSearchCloseButton(ctx.page).click();
      await expect(globalSearchDialog(ctx.page)).toHaveCount(0);
      return { visible: false } satisfies SearchStateSnapshot;
    },
  },
  "page.challenge_detail_snapshot": {
    match: async ({ params }) => {
      const snapshot = searchStateSnapshot(params);
      expect(snapshot.currentUrl).toMatch(new RegExp(requiredString(params, "pattern")));
    },
  },
  "global_search.empty_snapshot": {
    visible: async ({ params }) => {
      expect(searchStateSnapshot(params).visible).toBe(true);
    },
  },
  "global_search.input_snapshot": {
    empty: async ({ params }) => {
      expect(searchStateSnapshot(params).inputValue).toBe("");
    },
  },
  "global_search.results_snapshot": {
    restored: async ({ params }) => {
      expect(searchStateSnapshot(params).resultCount ?? 0).toBeGreaterThan(0);
    },
  },
  "global_search.dialog_snapshot": {
    hidden: async ({ params }) => {
      expect(searchStateSnapshot(params).visible).toBe(false);
    },
  },
} satisfies OperatorRegistry<TestContext, GlobalSearchResultStateCaseData>;

function searchFixtureInput(data: GlobalSearchResultStateCaseData) {
  return {
    email: data.email,
    keyword: data.fixtureKeyword,
    objectiveId: data.objective.id,
    objectiveTitle: data.objective.title,
    resultId: data.result.id,
    resultTitle: data.result.title,
    taskId: data.task.id,
    taskTitle: data.task.title,
    feedbackId: data.feedback.id,
    feedbackPhenomenon: data.feedback.phenomenon,
  };
}

function globalSearchTrigger(page: Page) {
  return page.getByRole("button", { name: "搜索页面、目标、指标、任务、反馈" });
}

function globalSearchDialog(page: Page) {
  return page.locator(".orf-draggable-floating").filter({ has: globalSearchInput(page) });
}

function globalSearchInput(page: Page) {
  return page.getByPlaceholder("搜索页面、目标、指标、任务、反馈");
}

function globalSearchResults(page: Page) {
  return globalSearchDialog(page).locator("button");
}

function searchResultRow(page: Page, label: string, typeLabel: string) {
  return globalSearchResults(page).filter({ hasText: label }).filter({ hasText: typeLabel }).first();
}

function globalSearchEmpty(page: Page) {
  return globalSearchDialog(page).getByText("没有匹配的页面、目标、指标、任务或反馈。", { exact: true });
}

function globalSearchCloseButton(page: Page) {
  return globalSearchDialog(page).locator(".orf-drag-handle button").last();
}

function searchStateSnapshot(params: Record<string, unknown>): SearchStateSnapshot {
  const snapshot = params.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("参数 snapshot 必须是全局搜索状态快照");
  }
  return snapshot as SearchStateSnapshot;
}

async function installDesktopShellMock(page: Page) {
  await page.addInitScript(() => {
    const maximizedState = {
      isFocused: true,
      isFullScreen: false,
      isMaximized: true,
      isMinimized: false,
      isVisible: true,
    };
    window.orfDesktopShell = {
      closeWindow: async () => ({ data: maximizedState, status: "success" }),
      getWindowState: async () => ({ data: maximizedState, status: "success" }),
      minimizeWindow: async () => ({ data: { ...maximizedState, isMinimized: true }, status: "success" }),
      onWindowStateChange: () => () => undefined,
      setWorkbenchZoomLevel: async ({ level }) => ({ data: { level }, status: "success" }),
      toggleMaximizeWindow: async () => ({ data: maximizedState, status: "success" }),
    };
  });
}
