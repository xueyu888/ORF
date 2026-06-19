import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getDefaultRuntimeScope, runtimeScopeStorageId } from "../../repositories/runtimeScope";
import {
  gitLabOrfChatReconcilerConfigured,
  gitLabOrfChatWebhookConfigured,
  readGitLabOrfChatConfig,
  type GitLabOrfChatConfig,
} from "./config";
import { listGitLabGroupProjects, reconcileGitLabOrfProjectHook, type GitLabOrfChatHookReconcileResult } from "./api";
import { formatGitLabWebhookChatMessage, parseGitLabWebhookEvent } from "./model";
import {
  ensureGitLabOrfChatBotActor,
  ensureGitLabOrfProjectChannel,
  markGitLabOrfEventDelivered,
  markGitLabOrfEventFailed,
  reserveGitLabOrfEventDelivery,
  sendGitLabOrfChatMessage,
} from "./repository";

export type GitLabOrfChatWebhookDeliveryResult =
  | { status: "delivered"; channelId: string; eventKey: string; messageId: string; projectId: string }
  | { status: "duplicate"; channelId: string; eventKey: string; projectId: string }
  | { status: "ignored"; reason: string };

export async function deliverGitLabWebhookToOrfChat(input: {
  config: GitLabOrfChatConfig;
  headers?: Record<string, string | string[] | number | undefined>;
  payload: unknown;
}): Promise<GitLabOrfChatWebhookDeliveryResult> {
  const event = parseGitLabWebhookEvent({ headers: input.headers, payload: input.payload });
  if (!event) {
    return { status: "ignored", reason: "payload_without_project" };
  }

  const scope = await getDefaultRuntimeScope();
  if (!scope) {
    throw new Error("GitLab ORF chat integration requires at least one ORF team");
  }

  const teamId = runtimeScopeStorageId(scope);
  const actor = await ensureGitLabOrfChatBotActor({
    botEmail: input.config.GITLAB_ORF_CHAT_BOT_EMAIL,
    botName: input.config.GITLAB_ORF_CHAT_BOT_NAME,
    teamId,
  });
  const channel = await ensureGitLabOrfProjectChannel({
    actor,
    channelType: input.config.GITLAB_ORF_CHAT_CHANNEL_TYPE,
    project: event.project,
    teamId,
  });
  const reserved = await reserveGitLabOrfEventDelivery({
    channelId: channel.channelId,
    eventKey: event.eventKey,
    eventType: event.eventType,
    projectId: event.project.id,
    teamId,
  });
  if (!reserved) {
    return { status: "duplicate", channelId: channel.channelId, eventKey: event.eventKey, projectId: event.project.id };
  }

  try {
    const messageId = await sendGitLabOrfChatMessage({
      actor,
      body: formatGitLabWebhookChatMessage(event),
      channelId: channel.channelId,
    });
    await markGitLabOrfEventDelivered({ chatMessageId: messageId, eventKey: event.eventKey, teamId });
    return { status: "delivered", channelId: channel.channelId, eventKey: event.eventKey, messageId, projectId: event.project.id };
  } catch (error) {
    await markGitLabOrfEventFailed({
      error: errorMessage(error),
      eventKey: event.eventKey,
      teamId,
    });
    throw error;
  }
}

export async function reconcileGitLabOrfChatProjects(
  config: GitLabOrfChatConfig,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<GitLabOrfChatHookReconcileResult> {
  const scope = await getDefaultRuntimeScope();
  if (!scope) {
    throw new Error("GitLab ORF chat integration requires at least one ORF team");
  }

  const teamId = runtimeScopeStorageId(scope);
  const actor = await ensureGitLabOrfChatBotActor({
    botEmail: config.GITLAB_ORF_CHAT_BOT_EMAIL,
    botName: config.GITLAB_ORF_CHAT_BOT_NAME,
    teamId,
  });
  const result: GitLabOrfChatHookReconcileResult = {
    created: [],
    duplicates: [],
    failed: [],
    projects: 0,
    unchanged: [],
    updated: [],
  };

  const projects = await listGitLabGroupProjects(config, options);
  result.projects = projects.length;

  for (const project of projects) {
    try {
      await ensureGitLabOrfProjectChannel({
        actor,
        channelType: config.GITLAB_ORF_CHAT_CHANNEL_TYPE,
        project,
        teamId,
      });
      const hook = await reconcileGitLabOrfProjectHook({ config, fetchImpl: options.fetchImpl, project });
      result[hook.action].push(project.path);
      if (hook.duplicateCount > 0) {
        result.duplicates.push(`${project.path}: ${hook.duplicateCount + 1}`);
      }
    } catch (error) {
      result.failed.push(`${project.path}: ${errorMessage(error)}`);
    }
  }

  return result;
}

export function registerGitLabOrfChatIntegration(app: FastifyInstance) {
  const config = readGitLabOrfChatConfig();

  if (!config.GITLAB_ORF_CHAT_ENABLED) {
    app.log.info({ enabled: false }, "GitLab ORF chat integration disabled");
    return;
  }

  if (gitLabOrfChatWebhookConfigured(config)) {
    app.post(
      "/webhooks/gitlab/orf-chat",
      { bodyLimit: config.GITLAB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES },
      async (request, reply) => {
        if (!verifyGitLabWebhookSecret(request.headers, config.GITLAB_ORF_CHAT_WEBHOOK_SECRET ?? "")) {
          return reply.code(401).send({ error: "Invalid GitLab webhook secret" });
        }

        const result = await deliverGitLabWebhookToOrfChat({
          config,
          headers: request.headers,
          payload: request.body,
        });
        if (result.status === "delivered") {
          return { ok: true, result };
        }
        return reply.code(202).send({ ok: true, result });
      },
    );
  } else {
    app.log.warn({ enabled: true }, "GitLab ORF chat webhook is enabled but GITLAB_ORF_CHAT_WEBHOOK_SECRET is missing");
  }

  if (!gitLabOrfChatReconcilerConfigured(config)) {
    app.log.warn(
      {
        accessTokenConfigured: Boolean(config.GITLAB_ORF_CHAT_ACCESS_TOKEN),
        gitlabUrlConfigured: Boolean(config.GITLAB_URL),
        groupPath: config.GITLAB_ORF_CHAT_GROUP,
        webhookSecretConfigured: Boolean(config.GITLAB_ORF_CHAT_WEBHOOK_SECRET),
        webhookUrlConfigured: Boolean(config.GITLAB_ORF_CHAT_WEBHOOK_URL),
      },
      "GitLab ORF chat project reconciler is not fully configured",
    );
    return;
  }

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await reconcileGitLabOrfChatProjects(config);
      const logPayload = {
        created: result.created.length,
        duplicates: result.duplicates.length,
        failed: result.failed.length,
        projects: result.projects,
        unchanged: result.unchanged.length,
        updated: result.updated.length,
      };
      if (result.failed.length > 0 || result.duplicates.length > 0) {
        app.log.warn({ ...logPayload, duplicates: result.duplicates, failed: result.failed }, "GitLab ORF chat reconciliation completed with warnings");
      } else {
        app.log.info(logPayload, "GitLab ORF chat reconciliation completed");
      }
    } catch (error) {
      app.log.error(error, "GitLab ORF chat reconciliation failed");
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, config.GITLAB_ORF_CHAT_RECONCILE_INTERVAL_SECONDS * 1000);
  app.addHook("onClose", async () => {
    clearInterval(interval);
  });
}

function verifyGitLabWebhookSecret(headers: Record<string, string | string[] | number | undefined>, secret: string) {
  const provided = header(headers, "x-gitlab-token");
  return Boolean(secret && provided && safeEqual(provided, secret));
}

function header(headers: Record<string, string | string[] | number | undefined>, name: string) {
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== normalized) continue;
    if (Array.isArray(value)) return value[0]?.trim() ?? "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
