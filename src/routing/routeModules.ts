import { lazy, type ComponentType } from "react";

type PageModule<TExport extends string, TComponent extends ComponentType> = Record<TExport, TComponent>;

function createRouteModule<TExport extends string, TComponent extends ComponentType>(
  loader: () => Promise<PageModule<TExport, TComponent>>,
  exportName: TExport,
) {
  let request: Promise<PageModule<TExport, TComponent>> | null = null;
  const preload = () => {
    request ??= loader();
    return request;
  };
  return {
    Component: lazy(async () => ({ default: (await preload())[exportName] })),
    preload,
  };
}

const auth = createRouteModule(() => import("../pages/AuthPage"), "AuthPage");
const bounties = createRouteModule(() => import("../pages/BountyHallPage"), "BountyHallPage");
const tasks = createRouteModule(() => import("../pages/TasksPage"), "ChallengePlanPage");
const chat = createRouteModule(() => import("../pages/ChatPage"), "ChatPage");
const drive = createRouteModule(() => import("../pages/DrivePage"), "DrivePage");
const feedbackInbox = createRouteModule(() => import("../pages/FeedbackInboxPage"), "FeedbackInboxPage");
const feedbackCreate = createRouteModule(() => import("../pages/FeedbackCreatePage"), "FeedbackCreatePage");
const feedbackIssue = createRouteModule(() => import("../pages/FeedbackIssuePage"), "FeedbackIssuePage");
const feedbackLabels = createRouteModule(() => import("../pages/FeedbackLabelsPage"), "FeedbackLabelsPage");
const feedbackMilestones = createRouteModule(() => import("../pages/FeedbackMilestonesPage"), "FeedbackMilestonesPage");
const loot = createRouteModule(() => import("../pages/LootSubmitPage"), "LootSubmitPage");
const members = createRouteModule(() => import("../pages/MembersPage"), "MembersPage");
const permissions = createRouteModule(() => import("../pages/PermissionsPage"), "PermissionsPage");
const personalSettings = createRouteModule(() => import("../pages/PersonalSettingsPage"), "PersonalSettingsPage");
const reports = createRouteModule(() => import("../pages/ReportsPage"), "ReportsPage");
const system = createRouteModule(() => import("../pages/SystemManagementPage"), "SystemManagementPage");
const systemSettings = createRouteModule(() => import("../pages/SettingsPage"), "SystemSettingsPage");
const workLogs = createRouteModule(() => import("../pages/WorkLogsPage"), "WorkLogsPage");

export const AuthPage = auth.Component;
export const BountyHallPage = bounties.Component;
export const ChallengePlanPage = tasks.Component;
export const ChatPage = chat.Component;
export const DrivePage = drive.Component;
export const FeedbackInboxPage = feedbackInbox.Component;
export const FeedbackCreatePage = feedbackCreate.Component;
export const FeedbackIssuePage = feedbackIssue.Component;
export const FeedbackLabelsPage = feedbackLabels.Component;
export const FeedbackMilestonesPage = feedbackMilestones.Component;
export const LootSubmitPage = loot.Component;
export const MembersPage = members.Component;
export const PermissionsPage = permissions.Component;
export const PersonalSettingsPage = personalSettings.Component;
export const ReportsPage = reports.Component;
export const SystemManagementPage = system.Component;
export const SystemSettingsPage = systemSettings.Component;
export const WorkLogsPage = workLogs.Component;

function routeModulePreloads(pathname: string) {
  if (pathname.startsWith("/tasks/objectives/") && pathname.endsWith("/loot")) return [loot.preload];
  if (pathname.startsWith("/bounties")) return [bounties.preload];
  if (pathname.startsWith("/tasks")) return [tasks.preload];
  if (pathname.startsWith("/work-logs")) return [workLogs.preload];
  if (pathname.startsWith("/chat")) return [chat.preload];
  if (pathname.startsWith("/resources") || pathname.startsWith("/drive")) return [drive.preload];
  if (pathname === "/feedback/new") return [feedbackCreate.preload];
  if (pathname === "/feedback/labels") return [feedbackLabels.preload];
  if (pathname === "/feedback/milestones") return [feedbackMilestones.preload];
  if (pathname.startsWith("/feedback/")) return [feedbackIssue.preload];
  if (pathname.startsWith("/feedback")) return [feedbackInbox.preload];
  if (pathname.startsWith("/reports")) return [reports.preload];
  if (pathname.startsWith("/settings")) return [personalSettings.preload];
  if (pathname.startsWith("/system/members")) return [system.preload, members.preload];
  if (pathname.startsWith("/system/permissions")) return [system.preload, permissions.preload];
  if (pathname.startsWith("/system/settings")) return [system.preload, systemSettings.preload];
  if (pathname === "/system" || pathname === "/system/") {
    return [system.preload, members.preload, permissions.preload, systemSettings.preload];
  }
  if (pathname.startsWith("/system")) return [system.preload];
  if (pathname.startsWith("/auth")) return [auth.preload];
  return [bounties.preload];
}

export function preloadRouteModules(pathname: string) {
  return Promise.allSettled(routeModulePreloads(pathname).map((preload) => preload()));
}

export function preloadProductionRouteModules() {
  return Promise.allSettled([
    bounties.preload(),
    tasks.preload(),
    workLogs.preload(),
    chat.preload(),
    drive.preload(),
    feedbackInbox.preload(),
    feedbackCreate.preload(),
    feedbackIssue.preload(),
    feedbackLabels.preload(),
    feedbackMilestones.preload(),
    loot.preload(),
    personalSettings.preload(),
    reports.preload(),
    system.preload(),
    members.preload(),
    permissions.preload(),
    systemSettings.preload(),
  ]);
}
