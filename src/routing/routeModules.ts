import { lazy, type ComponentType } from "react";
import { registeredWebModulePreloads } from "../config/webModuleRegistry";

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
export const LootSubmitPage = loot.Component;
export const MembersPage = members.Component;
export const PermissionsPage = permissions.Component;
export const PersonalSettingsPage = personalSettings.Component;
export const ReportsPage = reports.Component;
export const SystemManagementPage = system.Component;
export const SystemSettingsPage = systemSettings.Component;
export const WorkLogsPage = workLogs.Component;

export function preloadProductionRouteModules() {
  return Promise.allSettled([
    bounties.preload(),
    tasks.preload(),
    workLogs.preload(),
    chat.preload(),
    drive.preload(),
    loot.preload(),
    personalSettings.preload(),
    reports.preload(),
    system.preload(),
    members.preload(),
    permissions.preload(),
    systemSettings.preload(),
    ...registeredWebModulePreloads.map((preload) => preload()),
  ]);
}
