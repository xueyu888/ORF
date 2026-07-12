export const CHAT_MESSAGE_DELIVERY_BATCH_SIZE = 100;
export const CHAT_MESSAGE_DELIVERY_CONCURRENCY = 8;

export const chatMessageDeliveryTransports = ["realtime", "push"] as const;
export type ChatMessageDeliveryTransport = (typeof chatMessageDeliveryTransports)[number];

export const chatMessageDeliveryStatuses = [
  "pending",
  "processing",
  "retry_scheduled",
  "completed",
  "dead_letter",
] as const;
export type ChatMessageDeliveryStatus = (typeof chatMessageDeliveryStatuses)[number];

export const chatMessageDeliveryOutcomes = [
  "legacy_processed",
  "sent_to_connection",
  "no_online_subscriber",
  "push_accepted",
  "push_partially_accepted",
  "push_rejected",
  "no_push_device",
  "push_disabled",
  "not_applicable",
  "failed",
] as const;
export type ChatMessageDeliveryOutcome = (typeof chatMessageDeliveryOutcomes)[number];
export type ChatMessageDeliveryCompletedOutcome = Exclude<ChatMessageDeliveryOutcome, "failed">;

export type ChatMessageDeliveryClaim = {
  attempts: number;
  channelId: string;
  id: string;
  messageId: string;
  recipientUserId: string;
  teamId: string;
  transport: ChatMessageDeliveryTransport;
};

export type ChatMessageDeliveryResult = {
  failureCount: number;
  outcome: ChatMessageDeliveryCompletedOutcome;
  successCount: number;
  targetCount: number;
};

export type ChatMessageDeliveryFailureDecision = {
  completedAt: string | null;
  nextAttemptAt: string | null;
  outcome: "failed" | null;
  status: "dead_letter" | "retry_scheduled";
};

export class ChatMessageDeliveryAttemptError extends Error {
  readonly result: Pick<ChatMessageDeliveryResult, "failureCount" | "successCount" | "targetCount">;

  constructor(message: string, result: Pick<ChatMessageDeliveryResult, "failureCount" | "successCount" | "targetCount">) {
    super(message);
    this.name = "ChatMessageDeliveryAttemptError";
    this.result = {
      failureCount: Math.max(0, Math.floor(result.failureCount)),
      successCount: Math.max(0, Math.floor(result.successCount)),
      targetCount: Math.max(0, Math.floor(result.targetCount)),
    };
  }
}

export function chatMessageDeliveryFailureCounts(error: unknown) {
  return error instanceof ChatMessageDeliveryAttemptError
    ? error.result
    : { failureCount: 0, successCount: 0, targetCount: 0 };
}

const policyByTransport: Record<ChatMessageDeliveryTransport, { leaseMs: number; maxAttempts: number }> = {
  realtime: { leaseMs: 30_000, maxAttempts: 8 },
  push: { leaseMs: 5 * 60_000, maxAttempts: 12 },
};
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 30 * 60_000;

export function chatMessageDeliveryLeaseMs(transport: ChatMessageDeliveryTransport) {
  return policyByTransport[transport].leaseMs;
}

export function chatMessageDeliveryMaxAttempts(transport: ChatMessageDeliveryTransport) {
  return policyByTransport[transport].maxAttempts;
}

export function chatMessageDeliveryRetryDelayMs(attempts: number) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
}

export function decideChatMessageDeliveryFailure(
  claim: Pick<ChatMessageDeliveryClaim, "attempts" | "transport">,
  now = new Date(),
): ChatMessageDeliveryFailureDecision {
  if (claim.attempts >= chatMessageDeliveryMaxAttempts(claim.transport)) {
    return {
      completedAt: now.toISOString(),
      nextAttemptAt: null,
      outcome: "failed",
      status: "dead_letter",
    };
  }
  return {
    completedAt: null,
    nextAttemptAt: new Date(now.getTime() + chatMessageDeliveryRetryDelayMs(claim.attempts)).toISOString(),
    outcome: null,
    status: "retry_scheduled",
  };
}

export function normalizeChatMessageDeliveryResult(input: ChatMessageDeliveryResult): ChatMessageDeliveryResult {
  const count = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const targetCount = count(input.targetCount);
  const successCount = Math.min(targetCount, count(input.successCount));
  const failureCount = Math.min(targetCount - successCount, count(input.failureCount));
  const result = { ...input, failureCount, successCount, targetCount };
  const hasNoTargets = targetCount === 0 && successCount === 0 && failureCount === 0;
  const valid = (() => {
    switch (result.outcome) {
      case "legacy_processed":
      case "no_online_subscriber":
      case "no_push_device":
      case "push_disabled":
      case "not_applicable":
        return hasNoTargets;
      case "sent_to_connection":
        return successCount > 0;
      case "push_accepted":
        return successCount > 0 && failureCount === 0;
      case "push_partially_accepted":
        return successCount > 0 && failureCount > 0;
      case "push_rejected":
        return targetCount > 0 && successCount === 0 && failureCount > 0;
    }
  })();
  if (!valid) {
    throw new Error(`Invalid ${result.outcome} chat delivery counters: ${successCount}/${failureCount}/${targetCount}.`);
  }
  return result;
}
