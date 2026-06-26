import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getDefaultRuntimeScope, runtimeScopeStorageId } from "../../repositories/runtimeScope";
import {
  gitLabOrfChatReconcilerConfigured,
  gitLabOrfChatWebhookConfigured,
  readGitLabOrfChatConfig,
  type GitLabOrfChatConfig,
} from "./config";
import {
  listGitLabGroupProjects,
  reconcileGitLabOrfGroupHook,
  reconcileGitLabOrfProjectHook,
  type GitLabOrfChatHookReconcileResult,
} from "./api";
import { formatGitLabWebhookChatMessage, parseGitLabWebhookEvent } from "./model";
import {
  ensureGitLabOrfChatBotActor,
  listMatchingGitLabOrfChatSubscriptions,
  markGitLabOrfEventDelivered,
  markGitLabOrfEventFailed,
  reserveGitLabOrfEventDelivery,
  sendGitLabOrfChatMessage,
} from "./repository";

type DeliveredGitLabWebhookMessage = {
  channelId: string;
  messageId: string;
  subscriptionId: string;
};

type DuplicateGitLabWebhookMessage = {
  channelId: string;
  subscriptionId: string;
};

export type GitLabOrfChatWebhookDeliveryResult =
  | {
      status: "delivered";
      delivered: DeliveredGitLabWebhookMessage[];
      duplicates: DuplicateGitLabWebhookMessage[];
      eventKey: string;
      projectId: string;
    }
  | {
      status: "duplicate";
      duplicates: DuplicateGitLabWebhookMessage[];
      eventKey: string;
      projectId: string;
    }
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
  const subscriptions = await listMatchingGitLabOrfChatSubscriptions({ event, teamId });
  if (subscriptions.length === 0) {
    return { status: "ignored", reason: "no_matching_subscription" };
  }

  const actor = await ensureGitLabOrfChatBotActor({
    botEmail: input.config.GITLAB_ORF_CHAT_BOT_EMAIL,
    botName: input.config.GITLAB_ORF_CHAT_BOT_NAME,
    teamId,
  });
  const body = formatGitLabWebhookChatMessage(event);
  const delivered: DeliveredGitLabWebhookMessage[] = [];
  const duplicates: DuplicateGitLabWebhookMessage[] = [];

  for (const subscription of subscriptions) {
    const reserved = await reserveGitLabOrfEventDelivery({
      channelId: subscription.channelId,
      eventKey: event.eventKey,
      eventType: event.eventType,
      project: event.project,
      subscriptionId: subscription.id,
      teamId,
    });
    if (!reserved) {
      duplicates.push({ channelId: subscription.channelId, subscriptionId: subscription.id });
      continue;
    }

    try {
      const messageId = await sendGitLabOrfChatMessage({
        actor,
        body,
        channelId: subscription.channelId,
      });
      await markGitLabOrfEventDelivered({
        channelId: subscription.channelId,
        chatMessageId: messageId,
        eventKey: event.eventKey,
        teamId,
      });
      delivered.push({ channelId: subscription.channelId, messageId, subscriptionId: subscription.id });
    } catch (error) {
      await markGitLabOrfEventFailed({
        channelId: subscription.channelId,
        error: errorMessage(error),
        eventKey: event.eventKey,
        teamId,
      });
      throw error;
    }
  }

  if (delivered.length === 0) {
    return { status: "duplicate", duplicates, eventKey: event.eventKey, projectId: event.project.id };
  }
  return { status: "delivered", delivered, duplicates, eventKey: event.eventKey, projectId: event.project.id };
}

export async function reconcileGitLabOrfChatHooks(
  config: GitLabOrfChatConfig,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<GitLabOrfChatHookReconcileResult> {
  const result: GitLabOrfChatHookReconcileResult = {
    created: [],
    duplicates: [],
    failed: [],
    group: null,
    mode: config.GITLAB_ORF_CHAT_HOOK_MODE,
    projects: 0,
    unchanged: [],
    updated: [],
  };

  if (config.GITLAB_ORF_CHAT_HOOK_MODE === "group" || config.GITLAB_ORF_CHAT_HOOK_MODE === "both") {
    try {
      const hook = await reconcileGitLabOrfGroupHook({ config, fetchImpl: options.fetchImpl });
      result.group = {
        action: hook.action,
        duplicateCount: hook.duplicateCount,
        target: config.GITLAB_ORF_CHAT_GROUP,
      };
      result[hook.action].push(`group:${config.GITLAB_ORF_CHAT_GROUP}`);
      if (hook.duplicateCount > 0) {
        result.duplicates.push(`group:${config.GITLAB_ORF_CHAT_GROUP}: ${hook.duplicateCount + 1}`);
      }
    } catch (error) {
      result.failed.push(`group:${config.GITLAB_ORF_CHAT_GROUP}: ${errorMessage(error)}`);
    }
  }

  if (config.GITLAB_ORF_CHAT_HOOK_MODE === "project" || config.GITLAB_ORF_CHAT_HOOK_MODE === "both") {
    const projects = await listGitLabGroupProjects(config, options);
    result.projects = projects.length;
    for (const project of projects) {
      try {
        const hook = await reconcileGitLabOrfProjectHook({ config, fetchImpl: options.fetchImpl, project });
        result[hook.action].push(project.path);
        if (hook.duplicateCount > 0) {
          result.duplicates.push(`${project.path}: ${hook.duplicateCount + 1}`);
        }
      } catch (error) {
        result.failed.push(`${project.path}: ${errorMessage(error)}`);
      }
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

  registerOptionalWebhook(app, config);

  if (!gitLabOrfChatReconcilerConfigured(config)) {
    app.log.warn(
      {
        accessTokenConfigured: Boolean(config.GITLAB_ORF_CHAT_ACCESS_TOKEN),
        gitlabUrlConfigured: Boolean(config.GITLAB_URL),
        groupPath: config.GITLAB_ORF_CHAT_GROUP,
        hookMode: config.GITLAB_ORF_CHAT_HOOK_MODE,
        signingTokenConfigured: Boolean(config.GITLAB_ORF_CHAT_SIGNING_TOKEN),
        webhookSecretConfigured: Boolean(config.GITLAB_ORF_CHAT_WEBHOOK_SECRET),
        webhookUrlConfigured: Boolean(config.GITLAB_ORF_CHAT_WEBHOOK_URL),
      },
      "GitLab ORF chat hook reconciler is not fully configured",
    );
    return;
  }

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await reconcileGitLabOrfChatHooks(config);
      const logPayload = {
        created: result.created.length,
        duplicates: result.duplicates.length,
        failed: result.failed.length,
        group: result.group,
        mode: result.mode,
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

function registerOptionalWebhook(app: FastifyInstance, config: GitLabOrfChatConfig) {
  if (!gitLabOrfChatWebhookConfigured(config)) {
    app.log.warn(
      { enabled: true },
      "GitLab ORF chat webhook is enabled but neither GITLAB_ORF_CHAT_WEBHOOK_SECRET nor GITLAB_ORF_CHAT_SIGNING_TOKEN is configured",
    );
    return;
  }

  const webhookPath = "/webhooks/gitlab/orf-chat";
  app.addHook("preParsing", async (request, _reply, payload) => {
    const pathname = new URL(request.url, "http://orf.local").pathname;
    if (pathname !== webhookPath) {
      return payload;
    }

    const contentLength = Number(header(request.headers, "content-length"));
    if (Number.isFinite(contentLength) && contentLength > config.GITLAB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES) {
      throw webhookPayloadTooLargeError();
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of payload) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > config.GITLAB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES) {
        throw webhookPayloadTooLargeError();
      }
      chunks.push(buffer);
    }

    const rawBody = Buffer.concat(chunks);
    (request.raw as typeof request.raw & { rawBody?: Buffer }).rawBody = rawBody;
    return Readable.from(rawBody);
  });

  app.post(webhookPath, { bodyLimit: config.GITLAB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES }, async (request, reply) => {
    if (!requireGitLabWebhookAuthentication(config, request, reply)) {
      return reply;
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
  });
}

function requireGitLabWebhookAuthentication(config: GitLabOrfChatConfig, request: FastifyRequest, reply: FastifyReply) {
  const rawBody = (request.raw as typeof request.raw & { rawBody?: Buffer }).rawBody;
  if (config.GITLAB_ORF_CHAT_SIGNING_TOKEN) {
    if (!rawBody) {
      reply.code(400).send({ error: "Missing raw request body" });
      return false;
    }
    const signature = header(request.headers, "webhook-signature");
    const webhookId = header(request.headers, "webhook-id");
    const timestamp = header(request.headers, "webhook-timestamp");
    if (signature && webhookId && timestamp && verifyGitLabStandardSignature({ rawBody, signature, timestamp, token: config.GITLAB_ORF_CHAT_SIGNING_TOKEN, webhookId })) {
      return true;
    }
  }

  if (config.GITLAB_ORF_CHAT_WEBHOOK_SECRET && verifyGitLabWebhookSecret(request.headers, config.GITLAB_ORF_CHAT_WEBHOOK_SECRET)) {
    return true;
  }

  reply.code(401).send({ error: "Invalid GitLab webhook authentication" });
  return false;
}

function verifyGitLabStandardSignature(input: {
  rawBody: Buffer;
  signature: string;
  timestamp: string;
  token: string;
  webhookId: string;
}) {
  const key = gitLabStandardSigningKey(input.token);
  const message = `${input.webhookId}.${input.timestamp}.${input.rawBody.toString("utf8")}`;
  const expected = `v1,${createHmac("sha256", key).update(message).digest("base64")}`;
  return input.signature.split(/\s+/).some((signature) => safeEqual(signature, expected));
}

function gitLabStandardSigningKey(token: string) {
  if (token.startsWith("whsec_")) {
    return Buffer.from(token.slice("whsec_".length), "base64");
  }
  return Buffer.from(token);
}

function verifyGitLabWebhookSecret(headers: Record<string, string | string[] | number | undefined>, secret: string) {
  const provided = header(headers, "x-gitlab-token");
  return Boolean(secret && provided && safeEqual(provided, secret));
}

function webhookPayloadTooLargeError() {
  const error = new Error("GitLab webhook payload is too large") as Error & { statusCode: number };
  error.statusCode = 413;
  return error;
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
