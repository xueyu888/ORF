import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireApiUser, requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { listGitLabGroupProjects } from "../integrations/gitlab-orf-chat/api";
import {
  gitLabOrfChatReconcilerConfigured,
  readGitLabOrfChatConfig,
} from "../integrations/gitlab-orf-chat/config";
import { reconcileGitLabOrfChatHooks } from "../integrations/gitlab-orf-chat";
import {
  listGitLabOrfChatChannelOptions,
  listGitLabOrfChatSubscriptions,
} from "../integrations/gitlab-orf-chat/repository";
import {
  gitLabOrfChatConfigStatus,
  type GitLabOrfChatSettingsData,
} from "../integrations/gitlab-orf-chat/settingsModel";
import { gitLabOrfChatEventTypes } from "../integrations/gitlab-orf-chat/model";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import { chatSettingsError, chatSettingsPatchSchema, readChatSettings, saveChatSettings } from "../settings/chatSettings";
import { feedbackSettingsError, feedbackSettingsPatchSchema, readFeedbackSettings, saveFeedbackSettings } from "../settings/feedbackSettings";
import {
  backgroundSceneConfigSchema,
  backgroundScenePathSchema,
  backgroundSceneSchema,
  backgroundScopePathSchema,
  getVisualBackgroundFile,
  listVisualBackgrounds,
  saveUploadedVisualBackground,
  saveVisualBackgroundConfig,
  setDefaultVisualBackground,
  visualBackgroundError,
} from "../settings/visualBackgrounds";
import {
  deletePersonalBackground,
  getPersonalBackgroundFile,
  listPersonalBackgrounds,
  personalSettingsError,
  readUserPreferences,
  saveUploadedPersonalBackground,
  saveUserPreferences,
  userPreferencesPatchSchema,
} from "../settings/personalSettings";

const visualBackgroundQuerySchema = z.object({
  scene: backgroundSceneSchema,
});
const visualBackgroundConfigBodySchema = z.object({
  scene: backgroundSceneSchema,
  config: backgroundSceneConfigSchema,
});
const visualBackgroundParamsSchema = z.object({
  id: z.string().min(1),
});
const visualBackgroundStaticParamsSchema = z.object({
  scene: backgroundScenePathSchema,
  scope: backgroundScopePathSchema,
  fileName: z.string().min(1),
});

function publishSettingsInvalidation(input: { actorUserId?: string | null; scope: { id: string }; targetId: string }) {
  publishRealtimeReadModelInvalidation(runtimeScopeStorageId(input.scope), {
    actorUserId: input.actorUserId,
    models: ["settings"],
    reason: "setting.changed",
    target: { id: input.targetId, type: "setting" },
  });
}

async function readGitLabOrfChatSettingsData(teamId: string): Promise<GitLabOrfChatSettingsData> {
  const config = readGitLabOrfChatConfig();
  const [channels, subscriptions] = await Promise.all([
    listGitLabOrfChatChannelOptions(teamId),
    listGitLabOrfChatSubscriptions({ teamId }),
  ]);
  let gitlabProjectListError: string | null = null;
  let gitlabProjects: Awaited<ReturnType<typeof listGitLabGroupProjects>> = [];

  if (config.GITLAB_URL && config.GITLAB_ORF_CHAT_ACCESS_TOKEN) {
    try {
      gitlabProjects = await listGitLabGroupProjects(config);
    } catch (error) {
      gitlabProjectListError = errorMessage(error);
    }
  }

  return {
    channels,
    config: gitLabOrfChatConfigStatus(config),
    eventTypes: [...gitLabOrfChatEventTypes],
    gitlabProjectListError,
    projects: gitlabProjects.sort((left, right) =>
      left.path.localeCompare(right.path, "zh-Hans-CN", { sensitivity: "base" }) || left.id.localeCompare(right.id),
    ),
    subscriptions,
  };
}

function settingsErrorStatus(error: unknown) {
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

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/backgrounds/:scene/:scope/:fileName", async (request, reply) => {
    try {
      const params = visualBackgroundStaticParamsSchema.parse(request.params);
      if (params.scope === "personal") {
        const user = await requireApiUser(request, reply);
        if (!user) {
          return reply;
        }

        const file = await getPersonalBackgroundFile(user.id, params.scene, params.scope, params.fileName);
        reply.header("Content-Type", file.mimeType);
        return reply.send(file.stream);
      }

      const file = await getVisualBackgroundFile(params.scene, params.scope, params.fileName);
      reply.header("Content-Type", file.mimeType);
      return reply.send(file.stream);
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

  app.get("/api/settings/personal/preferences", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    try {
      return {
        code: 0,
        message: "ok",
        data: await readUserPreferences(user.id),
      };
    } catch (error) {
      const mapped = personalSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.put("/api/settings/personal/preferences", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const body = userPreferencesPatchSchema.parse(request.body);
      const data = await saveUserPreferences(context.user.id, body);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: `personal:${context.user.id}` });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = personalSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.get("/api/settings/personal/backgrounds", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    try {
      const query = visualBackgroundQuerySchema.partial().parse(request.query);
      return {
        code: 0,
        message: "ok",
        data: await listPersonalBackgrounds(user.id, query.scene ?? "sidebar_background"),
      };
    } catch (error) {
      const mapped = personalSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.post("/api/settings/personal/backgrounds", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      let scene: z.infer<typeof backgroundSceneSchema> = "sidebar_background";
      let file: { fileName: string; mimeType: string; buffer: Buffer } | null = null;

      for await (const part of request.parts({ limits: { fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES, files: 1 } })) {
        if (part.type === "field" && part.fieldname === "scene") {
          scene = backgroundSceneSchema.parse(part.value);
        }
        if (part.type === "file" && part.fieldname === "file") {
          file = {
            fileName: part.filename,
            mimeType: part.mimetype,
            buffer: await part.toBuffer(),
          };
        }
      }

      if (!file) {
        return reply.code(400).send({ code: 40002, message: "file is required", data: null });
      }

      const data = await saveUploadedPersonalBackground({ userId: context.user.id, scene, ...file });
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: `personal:${context.user.id}` });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = personalSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.delete("/api/settings/personal/backgrounds/:id", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const params = visualBackgroundParamsSchema.parse(request.params);
      const data = await deletePersonalBackground(context.user.id, params.id);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: `personal:${context.user.id}` });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = personalSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.get("/api/settings/chat", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      return {
        code: 0,
        message: "ok",
        data: await readChatSettings(),
      };
    } catch (error) {
      const mapped = chatSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.put("/api/settings/chat", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const body = chatSettingsPatchSchema.parse(request.body);
      const data = await saveChatSettings(body);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: "chat" });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = chatSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.get("/api/settings/feedback", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      return {
        code: 0,
        message: "ok",
        data: await readFeedbackSettings(),
      };
    } catch (error) {
      const mapped = feedbackSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.put("/api/settings/feedback", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const body = feedbackSettingsPatchSchema.parse(request.body);
      const data = await saveFeedbackSettings(body);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: "feedback" });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = feedbackSettingsError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.get("/api/settings/gitlab-orf-chat", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      return {
        code: 0,
        message: "ok",
        data: await readGitLabOrfChatSettingsData(runtimeScopeStorageId(context.scope)),
      };
    } catch (error) {
      const status = settingsErrorStatus(error);
      return reply.code(status).send({ code: status, message: errorMessage(error), data: null });
    }
  });

  app.post("/api/settings/gitlab-orf-chat/reconcile", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const config = readGitLabOrfChatConfig();
      if (!gitLabOrfChatReconcilerConfigured(config)) {
        return reply.code(400).send({ code: 400, message: "GitLab ORF chat reconciler is not fully configured", data: null });
      }

      const result = await reconcileGitLabOrfChatHooks(config);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: "gitlab-orf-chat" });
      return {
        code: 0,
        message: "ok",
        data: {
          result,
          settings: await readGitLabOrfChatSettingsData(runtimeScopeStorageId(context.scope)),
        },
      };
    } catch (error) {
      const status = settingsErrorStatus(error);
      return reply.code(status).send({ code: status, message: errorMessage(error), data: null });
    }
  });

  app.get("/api/settings/visual/backgrounds", async (request, reply) => {
    try {
      const query = visualBackgroundQuerySchema.parse(request.query);
      if (query.scene !== "login_background") {
        const user = await requireApiUser(request, reply);
        if (!user) {
          return reply;
        }
      }
      return {
        code: 0,
        message: "ok",
        data: await listVisualBackgrounds(query.scene),
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.post("/api/settings/visual/backgrounds", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      let scene: z.infer<typeof backgroundSceneSchema> | null = null;
      let file: { fileName: string; mimeType: string; buffer: Buffer } | null = null;

      for await (const part of request.parts({ limits: { fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES, files: 1 } })) {
        if (part.type === "field" && part.fieldname === "scene") {
          scene = backgroundSceneSchema.parse(part.value);
        }
        if (part.type === "file" && part.fieldname === "file") {
          file = {
            fileName: part.filename,
            mimeType: part.mimetype,
            buffer: await part.toBuffer(),
          };
        }
      }

      if (!scene) {
        return reply.code(400).send({ code: 40001, message: "invalid scene", data: null });
      }
      if (!file) {
        return reply.code(400).send({ code: 40002, message: "file is required", data: null });
      }

      const data = await saveUploadedVisualBackground({ scene, ...file });
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: `visual:${scene}` });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.put("/api/settings/visual/backgrounds/:id/default", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const params = visualBackgroundParamsSchema.parse(request.params);
      const data = await setDefaultVisualBackground(params.id);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: `visual:${params.id}` });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });

  app.put("/api/settings/visual/background-config", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const body = visualBackgroundConfigBodySchema.parse(request.body);
      const data = await saveVisualBackgroundConfig(body.scene, body.config);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: `visual:${body.scene}` });
      return {
        code: 0,
        message: "ok",
        data,
      };
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message, data: null });
    }
  });
}
