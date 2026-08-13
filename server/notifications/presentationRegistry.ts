import type { NotificationKind } from "../../src/types/orf";
import type {
  NotificationAction,
  NotificationPolicyDescriptor,
  NotificationPresentation,
  NotificationPresentationActionInput,
  NotificationPresentationProvider,
  NotificationPresentationRecipient,
} from "./contracts";

type RegisteredNotificationPresentationProvider = Omit<NotificationPresentationProvider<unknown>, "present"> & {
  presentParsed(payload: unknown, recipient: NotificationPresentationRecipient): NotificationPresentation;
};

const providersByNamespace = new Map<string, RegisteredNotificationPresentationProvider>();
const providersByKind = new Map<NotificationKind, RegisteredNotificationPresentationProvider>();

function normalizeNamespace(namespace: string) {
  return namespace.trim();
}

export function registerNotificationPresentationProvider<TPayload>(provider: NotificationPresentationProvider<TPayload>) {
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

  const registeredProvider: RegisteredNotificationPresentationProvider = {
    action: provider.action,
    kinds: provider.kinds,
    namespace,
    payloadSchema: provider.payloadSchema,
    policy: provider.policy,
    presentParsed(payload, recipient) {
      return provider.present(payload as TPayload, recipient);
    },
  };
  providersByNamespace.set(namespace, registeredProvider);
  for (const kind of kinds) {
    providersByKind.set(kind, registeredProvider);
  }
}

export function notificationPresentationPolicy(kind: NotificationKind): NotificationPolicyDescriptor | null {
  return providersByKind.get(kind)?.policy(kind) ?? null;
}

export function notificationPresentationActionFor(input: NotificationPresentationActionInput): NotificationAction | undefined {
  return providersByKind.get(input.kind)?.action(input);
}

export function notificationPresentationFor(input: {
  readonly namespace: string;
  readonly payload: unknown;
  readonly recipient: NotificationPresentationRecipient;
}): NotificationPresentation {
  const namespace = normalizeNamespace(input.namespace);
  const provider = providersByNamespace.get(namespace);
  if (!provider) throw new Error(`Notification presentation provider is not registered for ${namespace}.`);
  const parsed = provider.payloadSchema.safeParse(input.payload);
  if (!parsed.success) throw new Error(`Invalid ${namespace} notification presentation payload.`);
  return provider.presentParsed(parsed.data, input.recipient);
}
