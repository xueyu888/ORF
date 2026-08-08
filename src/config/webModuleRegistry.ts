import type { ComponentType } from "react";
import type { OrfUser } from "../types/orf";
import { feedbackWebModuleCommandSearch } from "../feedback/feedbackCommandSearch";
import { feedbackWebContribution } from "../feedback/feedbackWebContribution";

export type RegisteredWebModuleCommandItem = {
  readonly label: string;
  readonly path: string;
  readonly searchText: string;
  readonly type: string;
};

export type RegisteredWebModuleCommandSearchContext = {
  readonly currentUser: Pick<OrfUser, "role" | "status"> | null;
};

export type RegisteredWebModuleCommandSearchOptions = {
  readonly limit?: number;
  readonly signal?: AbortSignal;
};

export type RegisteredWebModuleCommandSearch = {
  readonly minQueryLength?: number;
  readonly canSearch?: (context: RegisteredWebModuleCommandSearchContext) => boolean;
  search(query: string, options: RegisteredWebModuleCommandSearchOptions): Promise<readonly RegisteredWebModuleCommandItem[]>;
};

export type RegisteredWebModuleRoute = {
  readonly id: string;
  readonly Page: ComponentType;
  readonly path: string;
  readonly routePath: string;
  readonly title: string;
};

export type RegisteredWebModule = {
  readonly actions?: Record<string, string>;
  readonly breadcrumb: (pathname: string) => string | null;
  readonly commandSearch?: RegisteredWebModuleCommandSearch;
  readonly id: string;
  readonly navigation: {
    readonly label: string;
    readonly path: string;
  };
  readonly routes: readonly RegisteredWebModuleRoute[];
};

const feedbackWebModule = {
  actions: feedbackWebContribution.actions,
  breadcrumb: feedbackWebContribution.breadcrumb,
  commandSearch: feedbackWebModuleCommandSearch,
  id: feedbackWebContribution.id,
  navigation: feedbackWebContribution.navigation,
  routes: [
    { ...feedbackWebContribution.routes.inbox, Page: feedbackWebContribution.pages.Inbox },
    { ...feedbackWebContribution.routes.create, Page: feedbackWebContribution.pages.Create },
    { ...feedbackWebContribution.routes.labels, Page: feedbackWebContribution.pages.Labels },
    { ...feedbackWebContribution.routes.detail, Page: feedbackWebContribution.pages.Detail },
  ],
} satisfies RegisteredWebModule;

export const registeredWebModules = [
  feedbackWebModule,
] as const satisfies readonly RegisteredWebModule[];

export const registeredWebModuleRoutes = registeredWebModules.flatMap((module) => module.routes);

export const registeredWebModuleCommandSearches = registeredWebModules.flatMap((module) =>
  module.commandSearch ? [module.commandSearch] : [],
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
