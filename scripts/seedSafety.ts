const DEFAULT_DEMO_TEAM_ID = "team-demo-ai-app";
const DEFAULT_DEMO_TEAM_NAME = "AI 应用团队（演示）";
const REMOTE_DEMO_SEED_FLAG = "ORF_ALLOW_REMOTE_DEMO_SEED";
const BUSINESS_TEAM_SEED_FLAG = "ORF_ALLOW_BUSINESS_TEAM_SEED";

type SeedEnv = Record<string, string | undefined>;

function cleanSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function databaseHost(connectionString: string) {
  return new URL(connectionString).hostname;
}

export function seedTeamId(env: SeedEnv = process.env) {
  return (env.ORF_DEMO_TEAM_ID ?? DEFAULT_DEMO_TEAM_ID).trim();
}

export function seedTeamName(env: SeedEnv = process.env) {
  return (env.ORF_DEMO_TEAM_NAME ?? DEFAULT_DEMO_TEAM_NAME).trim();
}

export function seedNamespace(teamId: string) {
  return cleanSlug(teamId) || "team-demo";
}

export function namespacedSeedId(teamId: string, id: string) {
  return `${seedNamespace(teamId)}-${id}`;
}

export function seedUserIdForName(teamId: string, name: string) {
  return `${seedNamespace(teamId)}-user-${cleanSlug(name) || "member"}`;
}

export function seedBootstrapAdmin(teamId: string) {
  return {
    id: `${seedNamespace(teamId)}-user-xueyu`,
    name: "xueyu",
    email: "xueyu@qq.com",
    status: "active" as const,
    createdAt: "2026-04-01",
    lastOnlineAt: "2026-05-05T09:42:00.000Z",
  };
}

export function isLocalDatabaseUrl(connectionString: string) {
  const host = databaseHost(connectionString);
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

export function assertDemoSeedSafety(input: {
  connectionString: string | undefined;
  env?: SeedEnv;
  scriptName: string;
  targetTeamId: string;
}) {
  const env = input.env ?? process.env;

  if (!input.connectionString) {
    throw new Error(`${input.scriptName} requires DATABASE_URL or REMOTE_DATABASE_URL.`);
  }

  if (!input.targetTeamId.startsWith("team-demo-") && env[BUSINESS_TEAM_SEED_FLAG] !== "1") {
    throw new Error(
      `${input.scriptName} refuses to seed non-demo team "${input.targetTeamId}". ` +
        `Use ORF_DEMO_TEAM_ID=team-demo-... or set ${BUSINESS_TEAM_SEED_FLAG}=1 intentionally.`,
    );
  }

  if (!isLocalDatabaseUrl(input.connectionString) && env[REMOTE_DEMO_SEED_FLAG] !== "1") {
    throw new Error(
      `${input.scriptName} refuses to write seed data to a non-local database. ` +
        `Set ${REMOTE_DEMO_SEED_FLAG}=1 only when you intend to write isolated demo data to "${input.targetTeamId}".`,
    );
  }
}
