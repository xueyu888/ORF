import type { OrfUser, UserRole } from "../types/orf";
import frontendVisibilityConfig from "./frontendVisibility.config.json";
import { registeredWebModules } from "./webModuleRegistry";

type SpecialVisibilityAudience = "systemManagementViewer";
type VisibilityAudience = "all" | SpecialVisibilityAudience | readonly UserRole[];

export type FrontendVisibilityKey = keyof typeof frontendVisibilityConfig;

type FrontendVisibilityRule = {
  label: string;
  audience: VisibilityAudience;
};

const userRoles = new Set<UserRole>(["admin", "member"]);
const specialAudiences = new Set<SpecialVisibilityAudience>(["systemManagementViewer"]);

export const frontendVisibilityTable = validateFrontendVisibilityConfig(
  frontendVisibilityConfig as Record<FrontendVisibilityKey, FrontendVisibilityRule>,
);

function webModuleVisibilityByPath() {
  return Object.fromEntries(registeredWebModules.map((module) => {
    const key = `nav.${module.id}` as FrontendVisibilityKey;
    if (!(key in frontendVisibilityTable)) {
      throw new Error(`Web module ${module.id} must define frontend visibility key ${key}`);
    }
    return [module.navigation.path, key];
  }));
}

export const frontendVisibilityByPath: Record<string, FrontendVisibilityKey> = {
  "/bounties": "nav.bounties",
  "/tasks": "nav.tasks",
  "/work-logs": "nav.workLogs",
  "/drive": "nav.drive",
  "/resources": "nav.drive",
  "/chat": "nav.chat",
  ...webModuleVisibilityByPath(),
  "/reports": "nav.reports",
  "/settings": "page.personalSettings",
  "/system": "page.systemManagement",
  "/system/members": "page.systemMembers",
  "/system/permissions": "page.systemPermissions",
  "/system/settings": "page.systemSettings",
  "/members": "page.systemMembers",
  "/permissions": "page.systemPermissions",
  "/settings/system": "page.systemSettings",
};

export function canShowFrontend(user: OrfUser | null, key: FrontendVisibilityKey) {
  const rule = frontendVisibilityTable[key];
  if (!rule) {
    throw new Error(`Unknown frontend visibility key: ${key}`);
  }

  const audience = rule.audience;
  if (audience === "all") return true;
  if (audience === "systemManagementViewer") return Boolean(user && user.role === "admin");
  return Boolean(user && audience.includes(user.role));
}

export function canShowFrontendPath(user: OrfUser | null, path: string) {
  const key = frontendVisibilityByPath[path];
  return key ? canShowFrontend(user, key) : true;
}

function validateFrontendVisibilityConfig(config: Record<FrontendVisibilityKey, FrontendVisibilityRule>) {
  for (const [key, rule] of Object.entries(config)) {
    if (!rule.label.trim()) {
      throw new Error(`Frontend visibility rule ${key} must have a label`);
    }

    if (rule.audience === "all") continue;
    if (typeof rule.audience === "string") {
      if (!specialAudiences.has(rule.audience)) {
        throw new Error(`Frontend visibility rule ${key} has unknown audience: ${rule.audience}`);
      }
      continue;
    }

    if (!Array.isArray(rule.audience) || rule.audience.length === 0) {
      throw new Error(`Frontend visibility rule ${key} must target all or at least one role`);
    }

    for (const role of rule.audience) {
      if (!userRoles.has(role)) {
        throw new Error(`Frontend visibility rule ${key} has unknown role: ${role}`);
      }
    }
  }

  return config;
}
