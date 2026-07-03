import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerAuthRoutes, requireAuthenticatedApi } from "./auth/routes";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "./db/errors";
import { assertRuntimeDatabaseSchema, databaseSchemaMismatchPayload, isDatabaseSchemaMismatchError } from "./db/schemaGuard";
import { env } from "./env";
import { startClientUpdatePushScheduler } from "./clientUpdates/clientUpdatePushScheduler";
import { registerOptionalIntegrations } from "./integrations";
import { startNotificationDeliveryScheduler } from "./notifications/notificationDeliveryScheduler";
import { registerSettingsRoutes } from "./routes/settingsRoutes";
import { registerNotificationRoutes } from "./routes/notificationRoutes";
import { registerSystemConversationRoutes } from "./routes/systemConversationRoutes";
import { registerOrfReadRoutes } from "./routes/orfReadRoutes";
import { registerCommentRoutes } from "./routes/commentRoutes";
import { registerChatRoutes } from "./routes/chatRoutes";
import { registerGitLabOrfChatRoutes } from "./routes/gitLabOrfChatRoutes";
import { registerDriveRoutes } from "./routes/driveRoutes";
import { registerUserRoutes } from "./routes/userRoutes";
import { registerUserAvatarRoutes } from "./users/avatar/avatarRoutes";
import { registerPermissionRoutes } from "./routes/permissionRoutes";
import { registerCurrentUserAccessRoutes } from "./routes/currentUserAccessRoutes";
import { registerRealtimeRoutes } from "./routes/realtimeRoutes";
import { registerFeedbackRoutes } from "./routes/feedbackRoutes";
import { registerOrfResultRoutes } from "./routes/orfResultRoutes";
import { registerOrfTaskRoutes } from "./routes/orfTaskRoutes";
import { registerOrfObjectiveRoutes } from "./routes/orfObjectiveRoutes";
import { registerClientUpdateRoutes } from "./routes/clientUpdateRoutes";
import { registerPushRoutes } from "./routes/pushRoutes";
import { registerWorkLogRoutes } from "./routes/workLogRoutes";
import { registerLocalSettlementRoutes } from "./routes/localSettlementRoutes";
import { startReestimateAutoFreezeScheduler } from "./orf/reestimateAutoFreezeScheduler";
import { startWorkLogReminderScheduler } from "./workLogs/workLogReminderScheduler";
function corsOrigin() {
  if (env.CORS_ORIGIN === "*") {
    return true;
  }

  return env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export async function buildServer(options: { logger?: boolean; registerOptionalIntegrations?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin: corsOrigin(),
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: env.ORF_INFRA_UPLOAD_MAX_BYTES,
      files: 1,
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Bad Request", issues: error.issues });
    }

    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: error instanceof Error ? error.message : "Bad Request" });
    }

    if (statusCode === 503) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "Service Unavailable" });
    }

    if (isDatabaseUnavailableError(error)) {
      app.log.error(error);
      return reply.code(503).send(databaseUnavailablePayload());
    }

    if (isDatabaseSchemaMismatchError(error)) {
      app.log.error(error);
      return reply.code(503).send(databaseSchemaMismatchPayload(error));
    }

    app.log.error(error);
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  await assertRuntimeDatabaseSchema();

  app.addHook("preHandler", requireAuthenticatedApi);

  app.get("/health", async () => ({
    ok: true,
    service: "orf-api",
  }));

  if (options.registerOptionalIntegrations ?? true) {
    registerOptionalIntegrations(app);
  }
  registerAuthRoutes(app);

  registerRealtimeRoutes(app);
  registerClientUpdateRoutes(app);
  registerPushRoutes(app);
  registerNotificationRoutes(app);
  registerSystemConversationRoutes(app);
  registerCurrentUserAccessRoutes(app);
  registerOrfReadRoutes(app);
  registerSettingsRoutes(app);
  registerCommentRoutes(app);
  registerChatRoutes(app);
  registerDriveRoutes(app);
  registerGitLabOrfChatRoutes(app);
  registerFeedbackRoutes(app);
  registerLocalSettlementRoutes(app);
  registerOrfObjectiveRoutes(app);
  registerOrfResultRoutes(app);
  registerOrfTaskRoutes(app);
  registerWorkLogRoutes(app);
  registerUserAvatarRoutes(app);
  registerUserRoutes(app);
  registerPermissionRoutes(app);

  const stopClientUpdatePushScheduler = startClientUpdatePushScheduler(app.log);
  const stopNotificationDeliveryScheduler = startNotificationDeliveryScheduler(app.log);
  const stopReestimateAutoFreezeScheduler = startReestimateAutoFreezeScheduler(app.log);
  const stopWorkLogReminderScheduler = startWorkLogReminderScheduler(app.log);
  app.addHook("onClose", async () => {
    stopClientUpdatePushScheduler();
    stopNotificationDeliveryScheduler();
    stopReestimateAutoFreezeScheduler();
    stopWorkLogReminderScheduler();
  });

  return app;
}
