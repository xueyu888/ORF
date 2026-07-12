export const CHAT_PUSH_DELIVERY_CONCURRENCY = 8;
export const CHAT_PUSH_DELIVERY_LEASE_MS = 60_000;
export const CHAT_PUSH_DELIVERY_MAX_ATTEMPTS = 12;
export const chatPushDeliveryStatuses = [
  "pending",
  "processing",
  "retry_scheduled",
  "completed",
  "dead_letter",
] as const;
export type ChatPushDeliveryStatus = (typeof chatPushDeliveryStatuses)[number];

export const chatPushDeliveryOutcomes = [
  "legacy_processed",
  "push_accepted",
  "push_partially_accepted",
  "push_rejected",
  "no_push_device",
  "push_disabled",
  "not_applicable",
  "failed",
] as const;
export type ChatPushDeliveryOutcome = (typeof chatPushDeliveryOutcomes)[number];
export type ChatPushDeliveryCompletedOutcome = Exclude<ChatPushDeliveryOutcome, "failed">;

export type ChatPushDeliveryClaim = {
  attempts: number;
  channelId: string;
  id: string;
  messageId: string;
  recipientUserId: string;
  teamId: string;
};

export type ChatPushDeliveryResult = {
  failureCount: number;
  outcome: ChatPushDeliveryCompletedOutcome;
  successCount: number;
  targetCount: number;
};

export type ChatPushDeliveryFailureDecision = {
  completedAt: string | null;
  nextAttemptAt: string | null;
  outcome: "failed" | null;
  status: "dead_letter" | "retry_scheduled";
};

export class ChatPushDeliveryAttemptError extends Error {
  readonly result: Pick<ChatPushDeliveryResult, "failureCount" | "successCount" | "targetCount">;

  constructor(message: string, result: Pick<ChatPushDeliveryResult, "failureCount" | "successCount" | "targetCount">) {
    super(message);
    this.name = "ChatPushDeliveryAttemptError";
    this.result = {
      failureCount: Math.max(0, Math.floor(result.failureCount)),
      successCount: Math.max(0, Math.floor(result.successCount)),
      targetCount: Math.max(0, Math.floor(result.targetCount)),
    };
  }
}

export function chatPushDeliveryFailureCounts(error: unknown) {
  return error instanceof ChatPushDeliveryAttemptError
    ? error.result
    : { failureCount: 0, successCount: 0, targetCount: 0 };
}

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 30 * 60_000;

export function chatPushDeliveryRetryDelayMs(attempts: number) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
}

export function decideChatPushDeliveryFailure(
  claim: Pick<ChatPushDeliveryClaim, "attempts">,
  now = new Date(),
): ChatPushDeliveryFailureDecision {
  if (claim.attempts >= CHAT_PUSH_DELIVERY_MAX_ATTEMPTS) {
    return {
      completedAt: now.toISOString(),
      nextAttemptAt: null,
      outcome: "failed",
      status: "dead_letter",
    };
  }
  return {
    completedAt: null,
    nextAttemptAt: new Date(now.getTime() + chatPushDeliveryRetryDelayMs(claim.attempts)).toISOString(),
    outcome: null,
    status: "retry_scheduled",
  };
}

export function normalizeChatPushDeliveryResult(input: ChatPushDeliveryResult): ChatPushDeliveryResult {
  const count = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const targetCount = count(input.targetCount);
  const successCount = Math.min(targetCount, count(input.successCount));
  const failureCount = Math.min(targetCount - successCount, count(input.failureCount));
  const result = { ...input, failureCount, successCount, targetCount };
  const hasNoTargets = targetCount === 0 && successCount === 0 && failureCount === 0;
  const valid = (() => {
    switch (result.outcome) {
      case "legacy_processed":
      case "no_push_device":
      case "push_disabled":
      case "not_applicable":
        return hasNoTargets;
      case "push_accepted":
        return successCount > 0 && failureCount === 0;
      case "push_partially_accepted":
        return successCount > 0 && failureCount > 0;
      case "push_rejected":
        return targetCount > 0 && successCount === 0 && failureCount > 0;
    }
  })();
  if (!valid) {
    throw new Error(`Invalid ${result.outcome} chat push counters: ${successCount}/${failureCount}/${targetCount}.`);
  }
  return result;
}
