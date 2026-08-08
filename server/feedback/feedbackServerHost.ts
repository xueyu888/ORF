import type { FastifyInstance } from "fastify";
import {
  type FeedbackServerHost,
} from "@orf/feedback-module/server";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teamMembers, users } from "../db/schema";
import { env } from "../env";
import { publishNotificationEvent } from "../notifications/publisher";
import { registerFeedbackCommentTargetAdapter } from "./feedbackCommentTargetAdapter";
import { registerFeedbackHttpRoutes } from "./feedbackHttpRoutes";
import { feedbackNotificationPort } from "./feedbackNotificationPort";
import { registerDriveContextProvider } from "../drive/driveContextProviderRegistry";
import { registerNotificationPresentationProvider } from "../notifications/presentationRegistry";
import { registerFeedbackReferenceProvider } from "../references/feedbackReferenceRegistry";

async function listActiveFeedbackDigestRecipients() {
  return db
    .select({
      name: users.name,
      teamId: teamMembers.teamId,
      userId: users.id,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(users.status, "active"))
    .orderBy(asc(teamMembers.teamId), asc(users.name), asc(users.id));
}

export function createOrfFeedbackServerHost(
  app: FastifyInstance,
  options: { readonly startBackgroundJobs?: boolean } = {},
): FeedbackServerHost {
  const startBackgroundJobs = options.startBackgroundJobs ?? true;
  const registeredHttpRoutes = new Set<string>();
  const registeredRuntimeTasks = new Set<string>();
  return {
    protocolVersion: 1,
    http: {
      registerRoutes(registration) {
        if (registration.moduleId !== "feedback") {
          throw new Error(`Unsupported feedback HTTP route module ${registration.moduleId}.`);
        }
        if (registeredHttpRoutes.has(registration.mountPath)) {
          throw new Error(`Feedback HTTP routes already registered at ${registration.mountPath}.`);
        }
        registeredHttpRoutes.add(registration.mountPath);
        registration.register();
      },
    },
    lifecycle: {
      registerTask(registration) {
        const key = `${registration.moduleId}:${registration.taskId}`;
        if (registeredRuntimeTasks.has(key)) {
          throw new Error(`Feedback runtime task already registered: ${registration.taskId}.`);
        }
        registeredRuntimeTasks.add(key);
        return registration.start();
      },
    },
    commentTargets: {
      registerTarget(registration) {
        if (registration.moduleId !== "feedback" || registration.type !== "feedback") {
          throw new Error(`Unsupported feedback comment target registration ${registration.type}.`);
        }
        registration.register();
      },
    },
    references: {
      registerProvider(provider) {
        registerFeedbackReferenceProvider(provider);
      },
    },
    driveContexts: {
      registerProvider(provider) {
        registerDriveContextProvider(provider);
      },
    },
    notificationKinds: {
      registerProvider(provider) {
        registerNotificationPresentationProvider(provider);
      },
    },
    ports: {
      backgroundJobs: {
        enabled: startBackgroundJobs,
      },
      commentTarget: {
        register: registerFeedbackCommentTargetAdapter,
      },
      database: db,
      dailyDigest: {
        config: {
          enabled: env.ORF_FEEDBACK_DAILY_DIGEST_ENABLED,
          hour: env.ORF_FEEDBACK_DAILY_DIGEST_HOUR,
          minute: env.ORF_FEEDBACK_DAILY_DIGEST_MINUTE,
          pollIntervalMs: env.ORF_FEEDBACK_DAILY_DIGEST_POLL_INTERVAL_MS,
          timeZone: env.ORF_FEEDBACK_DAILY_DIGEST_TIME_ZONE,
        },
        listActiveRecipients: listActiveFeedbackDigestRecipients,
        publishNotification: publishNotificationEvent,
      },
      httpRoutes: {
        register: () => registerFeedbackHttpRoutes(app),
      },
      log: app.log,
      notificationDispatch: {
        publishNotification: feedbackNotificationPort,
      },
    },
  };
}
