import {
  apiJson,
  getBountyHallData,
  getChatBootstrap,
  getChatUsers,
  getDriveBootstrap,
  getMyWorkLogDay,
  getPersonalBackgrounds,
  getWorkLogActivity,
  getWorkLogObjectives,
  getWorkLogReport,
  searchDriveRequest,
  type BountyHallData,
  type ChatBootstrapResponse,
  type ChatUsersResponse,
  type DriveBootstrapResponse,
  type DriveSearchResponse,
  type PersonalBackgroundsData,
  type ReportsPageData,
  type WorkLogActivityResponse,
  type WorkLogDayResponse,
  type WorkLogObjectivesResponse,
  type WorkLogReportResponse,
  type VisualBackgroundScene,
} from "./apiClient";
import type { DriveContextType, WorkLogReportScope } from "../types/orf";
import { workLogActivityCollapsedLimit } from "../features/work-logs/workLogReadModelConfig";
import {
  invalidateReadModel,
  invalidateReadModelPrefix,
  loadReadModel,
  readModelSnapshot,
  setReadModelSnapshot,
  type ReadModelLoadOptions,
} from "./readModelCache";

const keys = {
  bounties: "bounties",
  chatBootstrap: "chat.bootstrap",
  chatUsers: "chat.users",
  driveBootstrap: "drive.bootstrap",
  driveContext: (contextType: DriveContextType, contextId: string, limit: number) => `drive.context:${contextType}:${contextId}:${limit}`,
  personalBackground: (scene: VisualBackgroundScene) => `visual-background.personal:${scene}`,
  workLogActivity: (limit: number) => `work-logs.activity:${limit}`,
  workLogDay: (date: string) => `work-logs.day:${date}`,
  workLogObjectives: "work-logs.objectives",
  workLogReport: (from: string, to: string, scope: WorkLogReportScope) => `work-logs.report:${from}:${to}:${scope}`,
  reports: "reports",
} as const;

export const bountyHallSnapshot = () => readModelSnapshot<BountyHallData>(keys.bounties);
export const loadBountyHall = (options?: ReadModelLoadOptions) =>
  loadReadModel(keys.bounties, getBountyHallData, { maxAgeMs: 30_000, ...options });

export const chatBootstrapSnapshot = () => readModelSnapshot<ChatBootstrapResponse>(keys.chatBootstrap);
export const loadChatBootstrap = (options?: ReadModelLoadOptions) =>
  loadReadModel(keys.chatBootstrap, getChatBootstrap, { maxAgeMs: 30_000, ...options });
export const chatUsersSnapshot = () => readModelSnapshot<ChatUsersResponse>(keys.chatUsers);
export const loadChatUsers = (options?: ReadModelLoadOptions) =>
  loadReadModel(keys.chatUsers, getChatUsers, { maxAgeMs: 15_000, ...options });

export const driveBootstrapSnapshot = () => readModelSnapshot<DriveBootstrapResponse>(keys.driveBootstrap);
export const loadDriveBootstrap = (options?: ReadModelLoadOptions) =>
  loadReadModel(keys.driveBootstrap, getDriveBootstrap, { maxAgeMs: 30_000, ...options });
export const invalidateDriveBootstrap = () => invalidateReadModel(keys.driveBootstrap);
export const driveContextResourcesSnapshot = (contextType: DriveContextType, contextId: string, limit: number) =>
  readModelSnapshot<DriveSearchResponse>(keys.driveContext(contextType, contextId, limit));
export const loadDriveContextResources = (contextType: DriveContextType, contextId: string, limit: number, options?: ReadModelLoadOptions) =>
  loadReadModel(
    keys.driveContext(contextType, contextId, limit),
    () => searchDriveRequest({ contextId, contextType, limit, status: "active", type: "all" }),
    { maxAgeMs: 30_000, ...options },
  );
export const invalidateDriveContextResources = (contextType: DriveContextType, contextId: string) =>
  invalidateReadModelPrefix(`drive.context:${contextType}:${contextId}:`);

export const personalBackgroundSnapshot = (scene: VisualBackgroundScene) =>
  readModelSnapshot<PersonalBackgroundsData>(keys.personalBackground(scene));
export const loadPersonalBackground = (scene: VisualBackgroundScene, options?: ReadModelLoadOptions) =>
  loadReadModel(keys.personalBackground(scene), () => getPersonalBackgrounds(scene), { maxAgeMs: 5 * 60_000, ...options });

export const workLogObjectivesSnapshot = () => readModelSnapshot<WorkLogObjectivesResponse>(keys.workLogObjectives);
export const loadWorkLogObjectives = (options?: ReadModelLoadOptions) =>
  loadReadModel(keys.workLogObjectives, () => getWorkLogObjectives(), { maxAgeMs: 2 * 60_000, ...options });
export const invalidateWorkLogObjectives = () => invalidateReadModel(keys.workLogObjectives);

export const workLogDaySnapshot = (date: string) => readModelSnapshot<WorkLogDayResponse>(keys.workLogDay(date));
export const loadWorkLogDay = (date: string, options?: ReadModelLoadOptions) =>
  loadReadModel(keys.workLogDay(date), () => getMyWorkLogDay(date), { maxAgeMs: 20_000, ...options });
export const setWorkLogDaySnapshot = (date: string, value: WorkLogDayResponse) => setReadModelSnapshot(keys.workLogDay(date), value);

export const workLogActivitySnapshot = (limit: number) => readModelSnapshot<WorkLogActivityResponse>(keys.workLogActivity(limit));
export const loadWorkLogActivity = (limit: number, options?: ReadModelLoadOptions) =>
  loadReadModel(keys.workLogActivity(limit), () => getWorkLogActivity({ limit }), { maxAgeMs: 30_000, ...options });
export const invalidateWorkLogActivity = () => invalidateReadModelPrefix("work-logs.activity:");

export const workLogReportSnapshot = (from: string, to: string, scope: WorkLogReportScope) =>
  readModelSnapshot<WorkLogReportResponse>(keys.workLogReport(from, to, scope));
export const loadWorkLogReport = (from: string, to: string, scope: WorkLogReportScope, options?: ReadModelLoadOptions) =>
  loadReadModel(keys.workLogReport(from, to, scope), () => getWorkLogReport({ from, to, scope }), { maxAgeMs: 30_000, ...options });
export const invalidateWorkLogReports = () => invalidateReadModelPrefix("work-logs.report:");

export const reportsPageSnapshot = () => readModelSnapshot<ReportsPageData>(keys.reports);
export const loadReportsPage = (options?: ReadModelLoadOptions) =>
  loadReadModel(keys.reports, () => apiJson<ReportsPageData>("/api/reports-page"), { maxAgeMs: 30_000, ...options });

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function preloadReadModelsForPath(pathname: string) {
  if (pathname.startsWith("/bounties")) return Promise.allSettled([loadBountyHall()]);
  if (pathname.startsWith("/chat")) return Promise.allSettled([loadChatBootstrap(), loadChatUsers()]);
  if (pathname.startsWith("/resources") || pathname.startsWith("/drive")) return Promise.allSettled([loadDriveBootstrap()]);
  if (pathname.startsWith("/work-logs")) {
    return Promise.allSettled([
      loadWorkLogObjectives(),
      loadWorkLogDay(localToday()),
      loadWorkLogActivity(workLogActivityCollapsedLimit + 1),
    ]);
  }
  if (pathname.startsWith("/reports")) return Promise.allSettled([loadReportsPage()]);
  return Promise.resolve([]);
}

export async function preloadProductionReadModels() {
  const batches: Array<Array<() => Promise<unknown>>> = [
    [loadBountyHall, loadChatBootstrap],
    [loadChatUsers, loadDriveBootstrap],
    [
      loadWorkLogObjectives,
      () => loadWorkLogDay(localToday()),
      () => loadWorkLogActivity(workLogActivityCollapsedLimit + 1),
    ],
    [loadReportsPage],
  ];
  const results: PromiseSettledResult<unknown>[] = [];
  for (const batch of batches) {
    results.push(...await Promise.allSettled(batch.map((load) => load())));
  }
  return results;
}
