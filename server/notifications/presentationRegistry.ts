import type { NotificationKind } from "../../src/types/orf";
import type {
  NotificationAction,
  NotificationPolicyDescriptor,
  NotificationPresentationActionInput,
  NotificationPresentationProvider,
} from "./contracts";

const providersByNamespace = new Map<string, NotificationPresentationProvider>();
const providersByKind = new Map<NotificationKind, NotificationPresentationProvider>();

function normalizeNamespace(namespace: string) {
  return namespace.trim();
}

export function registerNotificationPresentationProvider(provider: NotificationPresentationProvider) {
  const namespace = normalizeNamespace(provider.namespace);
  if (!namespace) {
    throw new Error("Notification presentation provider namespace is required.");
  }
  if (providersByNamespace.has(namespace)) {
    throw new Error(`Notification presentation provider already registered for ${namespace}.`);
  }
  if (provider.kinds.length === 0) {
    throw new Error(`Notification presentation provider ${namespace} must register at least one kind.`);
  }

  const kinds = new Set<NotificationKind>();
  for (const kind of provider.kinds) {
    if (providersByKind.has(kind)) {
      throw new Error(`Notification presentation provider already registered for kind ${kind}.`);
    }
    kinds.add(kind);
  }

  providersByNamespace.set(namespace, provider);
  for (const kind of kinds) {
    providersByKind.set(kind, provider);
  }
}

export function notificationPresentationPolicy(kind: NotificationKind): NotificationPolicyDescriptor | null {
  return providersByKind.get(kind)?.policy(kind) ?? null;
}

export function notificationPresentationActionFor(input: NotificationPresentationActionInput): NotificationAction | undefined {
  return providersByKind.get(input.kind)?.action(input);
}
