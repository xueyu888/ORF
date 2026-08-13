import type { ComponentType } from "react";

declare const orfUnitOfWorkTokenBrand: unique symbol;

export type OrfUnitOfWorkToken = {
  readonly [orfUnitOfWorkTokenBrand]: true;
};

export type OrfWebModuleCommandItem = {
  readonly label: string;
  readonly path: string;
  readonly searchText: string;
  readonly type: string;
};

export type OrfWebModuleCommandSearchContext<CurrentUser = unknown> = {
  readonly currentUser: CurrentUser | null;
};

export type OrfWebModuleCommandSearchOptions = {
  readonly limit?: number;
  readonly signal?: AbortSignal;
};

export type OrfWebModuleCommandSearch<CurrentUser = unknown> = {
  readonly minQueryLength?: number;
  readonly canSearch?: (context: OrfWebModuleCommandSearchContext<CurrentUser>) => boolean;
  search(query: string, options: OrfWebModuleCommandSearchOptions): Promise<readonly OrfWebModuleCommandItem[]>;
};

export type OrfWebModuleRouteDefinition = {
  readonly id: string;
  readonly path: string;
  readonly routePath: string;
  readonly title: string;
};

export type OrfWebModuleRoute = OrfWebModuleRouteDefinition & {
  readonly Page: ComponentType;
};

export type OrfWebModuleNavigation = {
  readonly label: string;
  readonly path: string;
};

export type OrfWebModuleContribution<CurrentUser = unknown> = {
  readonly actions?: Readonly<Record<string, string>>;
  readonly breadcrumb: (pathname: string) => string | null;
  readonly commands?: readonly OrfWebModuleCommandSearch<CurrentUser>[];
  readonly id: string;
  readonly navigation: OrfWebModuleNavigation;
  readonly preload?: () => Promise<unknown>;
  readonly routes: readonly OrfWebModuleRoute[];
};
