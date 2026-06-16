import { expect, type Page } from "@playwright/test";
import type { OperatorRegistry } from "../../_framework/types";
import { clearBrowserState } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type { GlobalSearchCaseData, TestContext } from "./_support/global-search.context";
import {
  deleteSearchFixtures,
  prepareSearchFeedback,
  prepareSearchObjective,
  prepareSearchResult,
  prepareSearchTask,
  searchFixtureAbsent,
  searchFixtureExists,
  setDefaultLandingPathByEmail,
} from "./_support/global-search.helpers";

type SearchResultSnapshot = {
  label: string;
  typeLabel: string;
  visible: boolean;
};

export const globalSearchOperators = {
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
  "global_search.dialog": {
    visible: async ({ ctx }) => {
      await expect(globalSearchDialog(ctx.page)).toBeVisible();
    },
  },
  "global_search.input": {
    fill: async ({ ctx, params }) => {
      await globalSearchInput(ctx.page).fill(requiredString(params, "value"));
      const snapshotLabel = optionalString(params, "snapshotLabel");
      const snapshotTypeLabel = optionalString(params, "snapshotTypeLabel");
      if (snapshotLabel && snapshotTypeLabel) {
        const row = searchResultRow(ctx.page, snapshotLabel, snapshotTypeLabel);
        await expect(row).toBeVisible();
        return {
          label: snapshotLabel,
          typeLabel: snapshotTypeLabel,
          visible: await row.isVisible(),
        } satisfies SearchResultSnapshot;
      }
      return undefined;
    },
    clear: async ({ ctx }) => {
      await globalSearchInput(ctx.page).fill("");
    },
  },
  "global_search.results": {
    visible: async ({ ctx }) => {
      await expect(globalSearchResults(ctx.page).first()).toBeVisible();
    },
  },
  "global_search.result": {
    visible: async ({ ctx, params }) => {
      await expect(searchResultRow(ctx.page, requiredString(params, "label"), requiredString(params, "typeLabel"))).toBeVisible();
    },
  },
  "global_search.result_snapshot": {
    visible: async ({ params }) => {
      expect(searchResultSnapshot(params).visible).toBe(true);
    },
    type_label_visible: async ({ params }) => {
      const snapshot = searchResultSnapshot(params);
      expect(snapshot.typeLabel).toBe(requiredString(params, "typeLabel"));
    },
  },
  "global_search.result_type": {
    visible: async ({ ctx, params }) => {
      await expect(searchResultRow(ctx.page, requiredString(params, "label"), requiredString(params, "typeLabel")).getByText(requiredString(params, "typeLabel"), { exact: true })).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, GlobalSearchCaseData>;

function searchFixtureInput(data: GlobalSearchCaseData) {
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

function searchResultSnapshot(params: Record<string, unknown>): SearchResultSnapshot {
  const snapshot = params.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as Partial<SearchResultSnapshot>).label !== "string" ||
    typeof (snapshot as Partial<SearchResultSnapshot>).typeLabel !== "string" ||
    typeof (snapshot as Partial<SearchResultSnapshot>).visible !== "boolean"
  ) {
    throw new Error("参数 snapshot 必须包含 label、typeLabel 和 visible");
  }
  return snapshot as SearchResultSnapshot;
}

function optionalString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
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
