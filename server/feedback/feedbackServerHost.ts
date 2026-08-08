import type { FastifyInstance } from "fastify";
import {
  startFeedbackDailyDigestScheduler,
  startFeedbackNotificationDispatchWorker,
  type FeedbackServerHost,
} from "@orf/feedback-module/server";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teamMembers, users } from "../db/schema";
import { env } from "../env";
import { publishNotificationEvent } from "../notifications/publisher";
import { registerFeedbackCommentTargetAdapter } from "./feedbackCommentTargetAdapter";
import { registerFeedbackDriveContextProvider } from "./feedbackDriveContextProvider";
import { registerFeedbackHttpRoutes } from "./feedbackHttpRoutes";
import { feedbackNotificationPort } from "./feedbackNotificationPort";
import { registerFeedbackNotificationPresentationProvider } from "./feedbackNotificationPresentationProvider";
import { registerOrfFeedbackReferenceProvider } from "./feedbackReferenceProvider";

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
  return {
    protocolVersion: 1,
    registerHttpRoutes() {
      registerOrfFeedbackReferenceProvider();
      registerFeedbackDriveContextProvider();
      registerFeedbackNotificationPresentationProvider();
      registerFeedbackCommentTargetAdapter();
      registerFeedbackHttpRoutes(app);
    },
    startDailyDigestScheduler() {
      if (!startBackgroundJobs) {
        return () => undefined;
      }
      return startFeedbackDailyDigestScheduler({
        config: {
          enabled: env.ORF_FEEDBACK_DAILY_DIGEST_ENABLED,
          hour: env.ORF_FEEDBACK_DAILY_DIGEST_HOUR,
          minute: env.ORF_FEEDBACK_DAILY_DIGEST_MINUTE,
          pollIntervalMs: env.ORF_FEEDBACK_DAILY_DIGEST_POLL_INTERVAL_MS,
          timeZone: env.ORF_FEEDBACK_DAILY_DIGEST_TIME_ZONE,
        },
        database: db,
        listActiveRecipients: listActiveFeedbackDigestRecipients,
        log: app.log,
        publishNotification: publishNotificationEvent,
      });
    },
    startNotificationDispatchWorker() {
      if (!startBackgroundJobs) {
        return () => undefined;
      }
      return startFeedbackNotificationDispatchWorker({
        database: db,
        log: app.log,
        publishNotification: feedbackNotificationPort,
      });
    },
  };
}
