import type { FastifyInstance } from "fastify";
import { registerGitHubMattermostSync } from "./github-mattermost-sync";

export function registerOptionalIntegrations(app: FastifyInstance) {
  registerGitHubMattermostSync(app);
}
