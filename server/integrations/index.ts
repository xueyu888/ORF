import type { FastifyInstance } from "fastify";
import { registerGitHubOrfChatSync } from "./github-orf-chat";
import { registerGitLabOrfChatIntegration } from "./gitlab-orf-chat";

export function registerOptionalIntegrations(app: FastifyInstance) {
  registerGitLabOrfChatIntegration(app);
  registerGitHubOrfChatSync(app);
}
