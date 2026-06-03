import type { FastifyInstance } from "fastify";
import { registerGitHubMattermostSync } from "./github-mattermost-sync";
import { registerGitLabMattermostWebhookReconciler } from "./gitlab-mattermost-webhook-reconciler";
import { registerMattermostArchive } from "./mattermost-archive";
import { registerMattermostJiraReminder } from "./mattermost-jira-reminder";

export function registerOptionalIntegrations(app: FastifyInstance) {
  registerGitLabMattermostWebhookReconciler(app);
  registerGitHubMattermostSync(app);
  registerMattermostArchive(app);
  registerMattermostJiraReminder(app);
}
