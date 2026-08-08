import { createFeedbackReferenceProvider } from "@orf/feedback-module/server";
import { registerFeedbackReferenceProvider } from "../references/feedbackReferenceRegistry";

export function registerOrfFeedbackReferenceProvider() {
  registerFeedbackReferenceProvider(createFeedbackReferenceProvider());
}
