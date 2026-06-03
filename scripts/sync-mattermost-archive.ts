import "dotenv/config";
import { closeDb } from "../server/db/client";
import {
  DrizzleMattermostArchiveRepository,
  mattermostArchiveConfigured,
  readMattermostArchiveConfig,
  runMattermostArchiveSync,
} from "../server/integrations/mattermost-archive";
import { MattermostClient } from "../server/integrations/mattermost";
import { objectStorage } from "../server/storage/objectStorage";

const config = readMattermostArchiveConfig({
  ...process.env,
  MATTERMOST_ARCHIVE_ENABLED: process.env.MATTERMOST_ARCHIVE_ENABLED ?? "true",
});

if (!mattermostArchiveConfigured(config)) {
  throw new Error("Mattermost archive sync is not fully configured");
}

try {
  const result = await runMattermostArchiveSync({
    client: new MattermostClient(config),
    repository: new DrizzleMattermostArchiveRepository(),
    config,
    storage: config.copyImages ? objectStorage : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeDb();
}
