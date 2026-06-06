import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminContext, requireApiUser, requireUserScopeContext } from "../auth/accessPolicy";
import { publishRealtimeReadModelInvalidation } from "../realtime/realtimeEventBus";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import {
  appShellBackgroundSlotSchema,
  backgroundSceneConfigSchema,
  backgroundScenePathSchema,
  backgroundSceneSchema,
  backgroundScopePathSchema,
  getVisualBackgroundFile,
  listAppShellBackgrounds,
  listVisualBackgrounds,
  saveAppShellBackgroundConfig,
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
const appShellBackgroundQuerySchema = z.object({
  slot: appShellBackgroundSlotSchema,
});
const visualBackgroundConfigBodySchema = z.object({
  scene: backgroundSceneSchema,
  config: backgroundSceneConfigSchema,
});
const appShellBackgroundConfigBodySchema = z.object({
  slot: appShellBackgroundSlotSchema,
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
const personalBackgroundStaticParamsSchema = z.object({
  scene: backgroundScenePathSchema,
  ownerKey: z.string().min(1),
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

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/backgrounds/:scene/personal/:ownerKey/:fileName", async (request, reply) => {
    try {
      const params = personalBackgroundStaticParamsSchema.parse(request.params);
      const user = await requireApiUser(request, reply);
      if (!user) {
        return reply;
      }

      const file = await getPersonalBackgroundFile(user.id, params.scene, "personal", params.fileName, params.ownerKey);
      reply.header("Content-Type", file.mimeType);
      return reply.send(file.stream);
    } catch (error) {
      const mapped = visualBackgroundError(error);
      return reply.code(mapped.status).send({ error: mapped.message });
    }
  });

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

      if (params.scene !== "login_background") {
        const user = await requireApiUser(request, reply);
        if (!user) {
          return reply;
        }
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
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    try {
      return {
        code: 0,
        message: "ok",
        data: await listPersonalBackgrounds(user.id),
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
      let file: { fileName: string; mimeType: string; buffer: Buffer } | null = null;

      for await (const part of request.parts()) {
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

      const data = await saveUploadedPersonalBackground({ userId: context.user.id, ...file });
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

  app.get("/api/settings/visual/backgrounds", async (request, reply) => {
    try {
      const query = visualBackgroundQuerySchema.parse(request.query);
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

  app.get("/api/settings/visual/app-shell-backgrounds", async (request, reply) => {
    const user = await requireApiUser(request, reply);
    if (!user) {
      return reply;
    }

    try {
      const query = appShellBackgroundQuerySchema.parse(request.query);
      return {
        code: 0,
        message: "ok",
        data: await listAppShellBackgrounds(query.slot),
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

      for await (const part of request.parts()) {
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

  app.put("/api/settings/visual/app-shell-background-config", async (request, reply) => {
    const context = await requireAdminContext(request, reply);
    if (!context) {
      return reply;
    }

    try {
      const body = appShellBackgroundConfigBodySchema.parse(request.body);
      const data = await saveAppShellBackgroundConfig(body.slot, body.config);
      publishSettingsInvalidation({ actorUserId: context.user.id, scope: context.scope, targetId: `visual:app-shell:${body.slot}` });
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
