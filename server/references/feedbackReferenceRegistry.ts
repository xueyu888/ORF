import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type FeedbackReferenceProviderDatabase = Pick<NodePgDatabase<any>, "select">;

export interface FeedbackReferenceProvider {
  readonly protocolVersion: 1;
  findTeamId(database: FeedbackReferenceProviderDatabase, feedbackId: string): Promise<string | null>;
  hasProjectReference(
    database: FeedbackReferenceProviderDatabase,
    input: { readonly projectId: string; readonly storageScopeId: string },
  ): Promise<boolean>;
  hasUserReference(
    database: FeedbackReferenceProviderDatabase,
    input: { readonly storageScopeId: string; readonly userId: string },
  ): Promise<boolean>;
}

let feedbackReferenceProvider: FeedbackReferenceProvider | null = null;

export function registerFeedbackReferenceProvider(provider: FeedbackReferenceProvider) {
  if (provider.protocolVersion !== 1) {
    throw new Error("Unsupported feedback reference provider protocol.");
  }
  if (feedbackReferenceProvider) {
    throw new Error("Feedback reference provider already registered.");
  }
  feedbackReferenceProvider = provider;
}

export function requireFeedbackReferenceProvider() {
  if (!feedbackReferenceProvider) {
    throw new Error("Feedback reference provider is not registered.");
  }
  return feedbackReferenceProvider;
}
