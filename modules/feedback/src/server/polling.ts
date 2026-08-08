export const feedbackServerMinimumPollIntervalMs = 5_000;

export function feedbackServerPollIntervalMs(input: {
  readonly configuredPollIntervalMs?: number;
  readonly defaultPollIntervalMs: number;
}) {
  return Math.max(
    feedbackServerMinimumPollIntervalMs,
    input.configuredPollIntervalMs ?? input.defaultPollIntervalMs,
  );
}
