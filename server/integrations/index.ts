import type { FastifyInstance } from "fastify";
import { registerGitHubMattermostSync } from "./github-mattermost-sync";
import { registerGitLabMattermostWebhookReconciler } from "./gitlab-mattermost-webhook-reconciler";
import { registerMattermostJiraReminder } from "./mattermost-jira-reminder";

export function registerOptionalIntegrations(app: FastifyInstance) {
  registerGitLabMattermostWebhookReconciler(app);
  registerGitHubMattermostSync(app);
  registerMattermostJiraReminder(app);
}
