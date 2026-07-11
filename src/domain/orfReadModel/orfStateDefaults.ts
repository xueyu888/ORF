import type { OrfRules } from "../../types/orf";

export const defaultOrfReadModelRules = Object.freeze({
  requireResultForTask: false,
  requireEvidenceForFeedback: true,
  weeklyFeedbackCadence: true,
  autoCreateReviewSummary: false,
}) satisfies Readonly<OrfRules>;

export function createDefaultOrfReadModelRules(): OrfRules {
  return { ...defaultOrfReadModelRules };
}
