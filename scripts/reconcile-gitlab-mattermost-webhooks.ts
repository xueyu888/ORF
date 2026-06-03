import "dotenv/config";
import {
  readGitLabMattermostWebhookReconcilerConfig,
  reconcileGitLabMattermostProjectWebhooks,
} from "../server/integrations/gitlab-mattermost-webhook-reconciler";

const result = await reconcileGitLabMattermostProjectWebhooks(readGitLabMattermostWebhookReconcilerConfig());

console.log(JSON.stringify(result, null, 2));

if (result.failed.length > 0 || result.duplicates.length > 0) {
  process.exitCode = 1;
}
