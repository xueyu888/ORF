import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PermissionKey } from "../../src/config/permissions";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { listGitLabGroupProjects } from "../integrations/gitlab-orf-chat/api";
import { readGitLabOrfChatConfig } from "../integrations/gitlab-orf-chat/config";
import {
  createGitLabOrfChatSubscription,
  deleteGitLabOrfChatSubscription,
  listVisibleGitLabOrfChatSubscriptions,
  updateGitLabOrfChatSubscription,
} from "../integrations/gitlab-orf-chat/repository";
import {
  gitLabOrfChatConfigStatus,
  type GitLabOrfChatSettingsData,
} from "../integrations/gitlab-orf-chat/settingsModel";
import { gitLabOrfChatEventTypes } from "../integrations/gitlab-orf-chat/model";
import type { ChatActor } from "../repositories/chatRepository";
import { getRolePermissionKeysForScope } from "../repositories/permissionRepository";

const channelParamsSchema = z.object({
  channelId: z.string().min(1),
});

const subscriptionParamsSchema = channelParamsSchema.extend({
  subscriptionId: z.string().min(1),
});

const eventTypeSchema = z.enum(gitLabOrfChatEventTypes);

const createSubscriptionBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    eventTypes: z.array(eventTypeSchema).min(1).optional(),
    projectId: z.string().trim().min(1).optional(),
    projectPath: z.string().trim().min(1).optional(),
    projectUrl: z.string().trim().default(""),
    scope: z.enum(["group", "project"]),
  })
  .superRefine((value, context) => {
    if (value.scope === "project" && (!value.projectId || !value.projectPath)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId and projectPath are required for project subscriptions",
        path: ["projectId"],
      });
    }
  });

const updateSubscriptionBodySchema = z.object({
  enabled: z.boolean().optional(),
  eventTypes: z.array(eventTypeSchema).min(1).optional(),
});

async function chatActorFromRequest(request: FastifyRequest, reply: FastifyReply): Promise<ChatActor | null> {
  const context = await requireUserScopeContext(request, reply);
  if (!context) {
    return null;
  }

  const permissions = context.user.role === "admin" ? [] : await getRolePermissionKeysForScope(context.scope, context.user.role);
  const has = (key: PermissionKey) => context.user.role === "admin" || permissions.includes(key);
  return {
    id: context.user.id,
    name: context.user.name,
    role: context.user.role,
    scope: context.scope,
    canRead: has("chat.read"),
    canWrite: has("chat.write"),
    canCreatePrivateChannel: has("chat.channel.create"),
    canCreatePublicChannel: has("chat.channel.manage"),
    canManageAnyChannel: has("chat.channel.manage"),
    canManageAnyMembers: has("chat.member.manage"),
  };
}

async function readChannelGitLabOrfChatSettingsData(input: {
  actor: ChatActor;
  channelId: string;
}): Promise<GitLabOrfChatSettingsData> {
  const config = readGitLabOrfChatConfig();
  const subscriptions = await listVisibleGitLabOrfChatSubscriptions(input);
  let gitlabProjectListError: string | null = null;
  let projects: Awaited<ReturnType<typeof listGitLabGroupProjects>> = [];

  if (config.GITLAB_URL && config.GITLAB_ORF_CHAT_ACCESS_TOKEN) {
    try {
      projects = await listGitLabGroupProjects(config);
    } catch (error) {
      gitlabProjectListError = errorMessage(error);
    }
  }

  return {
    channels: [],
    config: gitLabOrfChatConfigStatus(config),
    eventTypes: [...gitLabOrfChatEventTypes],
    gitlabProjectListError,
    projects,
    subscriptions,
  };
}

function routeErrorStatus(error: unknown) {
  if (typeof error === "object" && error !== null) {
    if ("statusCode" in error && typeof error.statusCode === "number") {
      return error.statusCode;
    }
    if ("code" in error && error.code === "23505") {
      return 409;
    }
  }
  return 500;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function registerGitLabOrfChatRoutes(app: FastifyInstance) {
  app.get("/api/chat/channels/:channelId/gitlab-subscriptions", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;

    try {
      const params = channelParamsSchema.parse(request.params);
      return {
        code: 0,
        message: "ok",
        data: await readChannelGitLabOrfChatSettingsData({ actor, channelId: params.channelId }),
      };
    } catch (error) {
      const status = routeErrorStatus(error);
      return reply.code(status).send({ code: status, message: errorMessage(error), data: null });
    }
  });

  app.post("/api/chat/channels/:channelId/gitlab-subscriptions", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;

    try {
      const params = channelParamsSchema.parse(request.params);
      const body = createSubscriptionBodySchema.parse(request.body);
      const config = readGitLabOrfChatConfig();
      await createGitLabOrfChatSubscription({
        actor,
        channelId: params.channelId,
        config,
        enabled: body.enabled,
        eventTypes: body.eventTypes,
        project: body.scope === "project"
          ? {
              id: body.projectId ?? "",
              path: body.projectPath ?? "",
              url: body.projectUrl,
            }
          : null,
        scope: body.scope,
      });
      return {
        code: 0,
        message: "ok",
        data: await readChannelGitLabOrfChatSettingsData({ actor, channelId: params.channelId }),
      };
    } catch (error) {
      const status = routeErrorStatus(error);
      return reply.code(status).send({ code: status, message: errorMessage(error), data: null });
    }
  });

  app.patch("/api/chat/channels/:channelId/gitlab-subscriptions/:subscriptionId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;

    try {
      const params = subscriptionParamsSchema.parse(request.params);
      const body = updateSubscriptionBodySchema.parse(request.body);
      await updateGitLabOrfChatSubscription({
        actor,
        channelId: params.channelId,
        enabled: body.enabled,
        eventTypes: body.eventTypes,
        subscriptionId: params.subscriptionId,
      });
      return {
        code: 0,
        message: "ok",
        data: await readChannelGitLabOrfChatSettingsData({ actor, channelId: params.channelId }),
      };
    } catch (error) {
      const status = routeErrorStatus(error);
      return reply.code(status).send({ code: status, message: errorMessage(error), data: null });
    }
  });

  app.delete("/api/chat/channels/:channelId/gitlab-subscriptions/:subscriptionId", async (request, reply) => {
    const actor = await chatActorFromRequest(request, reply);
    if (!actor) return reply;

    try {
      const params = subscriptionParamsSchema.parse(request.params);
      await deleteGitLabOrfChatSubscription({
        actor,
        channelId: params.channelId,
        subscriptionId: params.subscriptionId,
      });
      return {
        code: 0,
        message: "ok",
        data: await readChannelGitLabOrfChatSettingsData({ actor, channelId: params.channelId }),
      };
    } catch (error) {
      const status = routeErrorStatus(error);
      return reply.code(status).send({ code: status, message: errorMessage(error), data: null });
    }
  });
}
