import type {
  OrfWebModuleCommandItem,
  OrfWebModuleContribution,
} from "@orf/module-protocol";
import type { OrfUser } from "../types/orf";
import { feedbackWebContribution } from "../feedback/feedbackWebContribution";

type RegisteredWebModuleUser = Pick<OrfUser, "role" | "status">;
type RegisteredWebModule = OrfWebModuleContribution<RegisteredWebModuleUser>;
export type RegisteredWebModuleCommandItem = OrfWebModuleCommandItem;

const feedbackWebModule = feedbackWebContribution satisfies RegisteredWebModule;

export const registeredWebModules = [
  feedbackWebModule,
] as const satisfies readonly RegisteredWebModule[];

export const registeredWebModuleRoutes = registeredWebModules.flatMap((module) => module.routes);

export const registeredWebModuleCommandSearches = registeredWebModules.flatMap((module) =>
  module.commands ?? [],
);

export const registeredWebModulePreloads = registeredWebModules.flatMap((module) =>
  module.preload ? [module.preload] : [],
);

export function webModuleBreadcrumb(pathname: string) {
  for (const module of registeredWebModules) {
    const label = module.breadcrumb(pathname);
    if (label) return label;
  }
  return null;
}

export function webModuleById(moduleId: string): RegisteredWebModule | null {
  return registeredWebModules.find((module) => module.id === moduleId) ?? null;
}

export function requiredWebModuleAction(moduleId: string, action: string) {
  const module = webModuleById(moduleId);
  const path = module?.actions?.[action]?.trim();
  if (!path) {
    throw new Error(`Web module ${moduleId} must define action ${action}`);
  }
  return path;
}
