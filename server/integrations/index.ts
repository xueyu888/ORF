import type { FastifyInstance } from "fastify";
import { registerGitHubOrfChatSync } from "./github-orf-chat";
import { registerGitLabOrfChatIntegration } from "./gitlab-orf-chat";
import { registerTestdResults } from "./testd-results";

export function registerOptionalIntegrations(app: FastifyInstance) {
  registerGitLabOrfChatIntegration(app);
  registerGitHubOrfChatSync(app);
  registerTestdResults(app);
}
