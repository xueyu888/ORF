import type { UiOperation } from "./types";

export type ExplorerSafetyProfile = {
  targetPath: string;
  allowedPathPatterns: string[];
  blockedPathPatterns: string[];
  blockedOperationKinds: UiOperation[];
  blockedTargetTextPatterns: string[];
};

export const explorerSafetyProfiles = {
  authenticatedApp: {
    targetPath: "/tasks",
    allowedPathPatterns: [
      "/dashboard",
      "/bounties",
      "/tasks",
      "/objectives",
      "/feedback",
      "/strategy-map",
      "/ai-evaluation",
      "/reports",
      "/system",
      "/system/members",
      "/system/permissions",
      "/system/settings",
      "/settings",
    ],
    blockedPathPatterns: [
      "/payment",
      "/checkout",
      "/billing",
      "/delete",
    ],
    blockedOperationKinds: [],
    blockedTargetTextPatterns: [
      "退出登录",
      "logout",
      "log out",
      "sign out",
    ],
  },
  auth: {
    targetPath: "/auth",
    allowedPathPatterns: ["/auth"],
    blockedPathPatterns: [],
    blockedOperationKinds: [],
    blockedTargetTextPatterns: [],
  },
} satisfies Record<string, ExplorerSafetyProfile>;

export type ExplorerSafetyProfileName = keyof typeof explorerSafetyProfiles;

export const defaultExplorerSafetyProfileName = "authenticatedApp" satisfies ExplorerSafetyProfileName;

export function resolveExplorerSafetyProfile(name: string | undefined, targetPathOverride?: string) {
  const inferredName = name ?? (targetPathOverride === "/auth" ? "auth" : defaultExplorerSafetyProfileName);
  if (inferredName in explorerSafetyProfiles) {
    return {
      name: inferredName as ExplorerSafetyProfileName,
      profile: explorerSafetyProfiles[inferredName as ExplorerSafetyProfileName],
    };
  }

  return {
    name: defaultExplorerSafetyProfileName,
    profile: explorerSafetyProfiles[defaultExplorerSafetyProfileName],
  };
}
