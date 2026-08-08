import type {
  OrfWebModuleCommandItem,
  OrfWebModuleContribution,
} from "@orf/module-protocol";
import type { AnyChatReferenceCardRegistration } from "../features/chat/chatReferenceCardProvider";
import type { OrfUser } from "../types/orf";
import { feedbackWebContribution } from "../feedback/feedbackWebContribution";

type RegisteredWebModuleUser = Pick<OrfUser, "role" | "status">;
type RegisteredWebModule = OrfWebModuleContribution<RegisteredWebModuleUser> & {
  readonly chatReferenceCards?: readonly AnyChatReferenceCardRegistration[];
};
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

export const registeredWebModuleChatReferenceCards = registeredWebModules.flatMap((module) =>
  module.chatReferenceCards ?? [],
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
