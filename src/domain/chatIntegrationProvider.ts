export type ChatIntegrationProvider = "github" | "gitlab";

export type ChatIntegrationChannelDescriptor = {
  displayName: string;
  integrationProvider?: ChatIntegrationProvider | null;
  name?: string | null;
};

export type ChatIntegrationBindingValidation =
  | {
      status: "allowed";
      channelProvider: ChatIntegrationProvider | null;
      requestedProvider: ChatIntegrationProvider;
    }
  | {
      status: "providerConflict";
      channelProvider: ChatIntegrationProvider;
      requestedProvider: ChatIntegrationProvider;
    };

export function chatChannelIntegrationProvider(channel: ChatIntegrationChannelDescriptor): ChatIntegrationProvider | null {
  if ("integrationProvider" in channel) return channel.integrationProvider ?? null;

  const keys = new Set([integrationProviderKey(channel.name), integrationProviderKey(channel.displayName)]);
  if (keys.has("github")) return "github";
  if (keys.has("gitlab")) return "gitlab";
  return null;
}

export function validateChatIntegrationBinding(
  channel: ChatIntegrationChannelDescriptor,
  requestedProvider: ChatIntegrationProvider,
): ChatIntegrationBindingValidation {
  const channelProvider = chatChannelIntegrationProvider(channel);
  if (channelProvider && channelProvider !== requestedProvider) {
    return { status: "providerConflict", channelProvider, requestedProvider };
  }
  return { status: "allowed", channelProvider, requestedProvider };
}

export function chatChannelAllowsIntegrationProvider(
  channel: ChatIntegrationChannelDescriptor,
  requestedProvider: ChatIntegrationProvider,
) {
  return validateChatIntegrationBinding(channel, requestedProvider).status === "allowed";
}

function integrationProviderKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
}
