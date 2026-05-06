import "dotenv/config";
import { codexActivityStyleIds, formatCodexActivityMessage, postCodexActivity, readCodexActivityConfig } from "./index";

interface CliInput {
  summary?: string;
  details: string[];
  actor?: string;
  style?: string;
  dryRun: boolean;
}

function usage() {
  return [
    "Usage:",
    '  npm run codex:report -- --summary "把 GitHub 推送同步到 ORF 频道" [--detail "..."] [--dry-run]',
    "",
    "Options:",
    "  --summary <text>  Required activity summary.",
    "  --detail <text>   Optional detail line. Can be repeated.",
    "  --actor <name>    Override CODEX_ACTIVITY_ACTOR.",
    `  --style <name>    Optional fixed style. Use rotate or one of: ${codexActivityStyleIds.join(", ")}.`,
    "  --dry-run         Print the message without sending it.",
  ].join("\n");
}

function readValue(argv: string[], index: number, name: string) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function parseArgs(argv: string[]): CliInput {
  const input: CliInput = { details: [], dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--summary") {
      input.summary = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--detail") {
      input.details.push(readValue(argv, index, arg));
      index += 1;
    } else if (arg === "--actor") {
      input.actor = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--style") {
      input.style = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--dry-run") {
      input.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!input.summary) {
    throw new Error("Missing required --summary");
  }

  return input;
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const envConfig = readCodexActivityConfig();
  const config = { ...envConfig, CODEX_ACTIVITY_STYLE: input.style ?? envConfig.CODEX_ACTIVITY_STYLE };
  const activity = { summary: input.summary!, details: input.details, actor: input.actor };

  if (input.dryRun) {
    console.log(formatCodexActivityMessage(activity, { ...config, CODEX_ACTIVITY_STYLE: input.style ?? config.CODEX_ACTIVITY_STYLE }));
    return;
  }

  const result = await postCodexActivity(activity, config);
  console.log(JSON.stringify({ ok: true, postId: result.postId, channelId: result.channelId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
