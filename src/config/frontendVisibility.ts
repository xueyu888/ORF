import type { OrfUser, UserRole } from "../types/orf";
import frontendVisibilityConfig from "./frontendVisibility.config.json";

type VisibilityAudience = "all" | readonly UserRole[];

export type FrontendVisibilityKey = keyof typeof frontendVisibilityConfig;

type FrontendVisibilityRule = {
  label: string;
  audience: VisibilityAudience;
};

const userRoles = new Set<UserRole>(["admin", "member"]);

export const frontendVisibilityTable = validateFrontendVisibilityConfig(
  frontendVisibilityConfig as Record<FrontendVisibilityKey, FrontendVisibilityRule>,
);

export const frontendVisibilityByPath: Record<string, FrontendVisibilityKey> = {
  "/bounties": "nav.bounties",
  "/tasks": "nav.tasks",
  "/feedback": "nav.feedback",
  "/reports": "nav.reports",
  "/settings": "page.personalSettings",
  "/system": "page.systemManagement",
  "/system/members": "page.systemMembers",
  "/system/permissions": "page.systemPermissions",
  "/system/settings": "page.systemSettings",
  "/system/mattermost-archive": "page.systemMattermostArchive",
  "/members": "page.systemMembers",
  "/permissions": "page.systemPermissions",
  "/settings/system": "page.systemSettings",
  "/objectives": "command.objectives",
};

export function canShowFrontend(user: OrfUser | null, key: FrontendVisibilityKey) {
  const rule = frontendVisibilityTable[key];
  if (!rule) {
    throw new Error(`Unknown frontend visibility key: ${key}`);
  }

  const audience = rule.audience;
  if (audience === "all") return true;
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
