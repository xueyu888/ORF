import { closeDb } from "../server/db/client";
import {
  gitLabOrfChatReconcilerConfigured,
  readGitLabOrfChatConfig,
} from "../server/integrations/gitlab-orf-chat/config";
import { reconcileGitLabOrfChatProjects } from "../server/integrations/gitlab-orf-chat";

const config = readGitLabOrfChatConfig();

try {
  if (!gitLabOrfChatReconcilerConfigured(config)) {
    throw new Error("GitLab ORF chat reconciler is not fully configured");
  }

  const result = await reconcileGitLabOrfChatProjects(config);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await closeDb();
}
