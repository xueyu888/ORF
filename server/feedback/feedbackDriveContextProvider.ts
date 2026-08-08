import {
  getFeedbackReferences,
  searchFeedbackReferences,
} from "@orf/feedback-module/server";
import { db } from "../db/client";
import { registerDriveContextProvider } from "../drive/driveContextProviderRegistry";

export function registerFeedbackDriveContextProvider() {
  registerDriveContextProvider({
    protocolVersion: 1,
    type: "feedback",
    getReferences(input) {
      return getFeedbackReferences(db, {
        feedbackIds: input.contextIds,
        teamId: input.storageScopeId,
      });
    },
    searchReferences(input) {
      return searchFeedbackReferences(db, {
        limit: input.limit,
        query: input.query,
        teamId: input.storageScopeId,
      });
    },
  });
}
