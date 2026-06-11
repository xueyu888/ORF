import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireUserScopeContext } from "../../auth/accessPolicy";
import { env } from "../../env";
import { publishRealtimeReadModelInvalidation } from "../../realtime/realtimeEventBus";
import { runtimeScopeStorageId } from "../../repositories/runtimeScope";
import {
  deleteCurrentUserAvatar,
  getUserAvatarFile,
  uploadCurrentUserAvatar,
  type UserAvatarMutationOutcome,
} from "./avatarRepository";

const avatarParamsSchema = z.object({ userId: z.string().min(1) });

async function readAvatarUpload(request: FastifyRequest) {
  let file: { body: Buffer; mimeType: string } | null = null;

  for await (const part of request.parts({ limits: { fileSize: env.OBJECT_STORAGE_UPLOAD_MAX_BYTES, files: 1 } })) {
    if (part.type === "file" && part.fieldname === "file") {
      file = {
        body: await part.toBuffer(),
        mimeType: part.mimetype,
      };
    }
  }

  return file;
}

function publishAvatarInvalidation(input: { actorUserId: string; scopeId: string }) {
  publishRealtimeReadModelInvalidation(input.scopeId, {
    actorUserId: input.actorUserId,
    models: ["users", "taskManagement", "bountyHall"],
    reason: "user.changed",
    target: { id: input.actorUserId, type: "user" },
  });
}

function sendAvatarMutationOutcome(reply: FastifyReply, outcome: UserAvatarMutationOutcome) {
  if (outcome.status === "notFound") {
    return reply.code(404).send({ error: "User not found" });
  }

  if (outcome.status === "invalid") {
    return reply.code(400).send({ error: "Image file is required" });
  }

  if (outcome.status === "tooLarge") {
    return reply.code(413).send({ error: "Image is too large" });
  }

  if (outcome.status === "unsupported") {
    return reply.code(415).send({ error: "Unsupported image type" });
  }

  return { user: outcome.user };
}

export function registerUserAvatarRoutes(app: FastifyInstance) {
  app.get("/api/users/:userId/avatar", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const params = avatarParamsSchema.parse(request.params);
    const outcome = await getUserAvatarFile(context.scope, params.userId);
    if (outcome.status === "notFound") {
      return reply.code(404).send({ error: "Avatar not found" });
    }

    reply.header("Cache-Control", "private, max-age=300");
    reply.header("Content-Type", outcome.contentType);
    if (outcome.contentLength !== undefined) {
      reply.header("Content-Length", outcome.contentLength);
    }
    return reply.send(outcome.body);
  });

  app.post("/api/users/me/avatar", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const file = await readAvatarUpload(request);
    if (!file) {
      return reply.code(400).send({ error: "Image file is required" });
    }

    const outcome = await uploadCurrentUserAvatar(context.scope, context.user.id, file);
    if (outcome.status === "ok") {
      publishAvatarInvalidation({ actorUserId: context.user.id, scopeId: runtimeScopeStorageId(context.scope) });
    }
    return sendAvatarMutationOutcome(reply, outcome);
  });

  app.delete("/api/users/me/avatar", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const outcome = await deleteCurrentUserAvatar(context.scope, context.user.id);
    if (outcome.status === "ok") {
      publishAvatarInvalidation({ actorUserId: context.user.id, scopeId: runtimeScopeStorageId(context.scope) });
    }
    return sendAvatarMutationOutcome(reply, outcome);
  });
}
