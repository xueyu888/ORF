import type { FastifyInstance } from "fastify";
import { registerGitHubMattermostSync } from "./github-mattermost-sync";
import { registerMattermostJiraReminder } from "./mattermost-jira-reminder";

export function registerOptionalIntegrations(app: FastifyInstance) {
  registerGitHubMattermostSync(app);
  registerMattermostJiraReminder(app);
}
