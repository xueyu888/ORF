import type { FastifyInstance } from "fastify";
import {
  type FeedbackServerHost,
} from "@orf/feedback-module/server";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teamMembers, users } from "../db/schema";
import { env } from "../env";
import { publishNotificationEvent } from "../notifications/publisher";
import { registerCommentTargetAdapter, type CommentTargetAdapter } from "../comments/commentTargetAdapters";
import { registerDriveContextProvider } from "../drive/driveContextProviderRegistry";
import { registerNotificationPresentationProvider } from "../notifications/presentationRegistry";
import { registerFeedbackReferenceProvider } from "../references/feedbackReferenceRegistry";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import { createOrfFeedbackPorts } from "./feedbackHostPorts";

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
  const ports = createOrfFeedbackPorts({
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
    log: app.log,
    startBackgroundJobs,
  });
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
        registration.register(app);
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
        registerCommentTargetAdapter(commentTargetAdapterForOrf(registration.adapter));
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
    ports,
  };
}

function commentTargetAdapterForOrf(adapter: Parameters<FeedbackServerHost["commentTargets"]["registerTarget"]>[0]["adapter"]): CommentTargetAdapter {
  return {
    invalidationModel: adapter.invalidationModel,
    protocolVersion: adapter.protocolVersion,
    type: adapter.type,
    resolve: adapter.resolve,
    href: adapter.href,
    canComment(actor, target) {
      return adapter.canComment({
        id: actor.id,
        name: actor.name,
        role: actor.role,
        scope: actor.scope ? { storageScopeId: runtimeScopeStorageId(actor.scope) } : null,
      }, {
        storageScopeId: target.storageScopeId,
        targetId: target.targetId,
        targetType: "feedback",
        title: target.title,
      });
    },
    canRead(actor, target) {
      return adapter.canRead({
        id: actor.id,
        name: actor.name,
        role: actor.role,
        scope: actor.scope ? { storageScopeId: runtimeScopeStorageId(actor.scope) } : null,
      }, {
        storageScopeId: target.storageScopeId,
        targetId: target.targetId,
        targetType: "feedback",
        title: target.title,
      });
    },
    lockForComment(database, target) {
      return adapter.lockForComment(database, {
        storageScopeId: target.storageScopeId,
        targetId: target.targetId,
        targetType: "feedback",
        title: target.title,
      });
    },
    onMessageCommitted(event, database) {
      if (!adapter.onMessageCommitted) return Promise.resolve();
      return adapter.onMessageCommitted({
        actor: {
          id: event.actor.id,
          name: event.actor.name,
          role: event.actor.role,
          scope: event.actor.scope ? { storageScopeId: runtimeScopeStorageId(event.actor.scope) } : null,
        },
        attachments: event.attachments,
        body: event.body,
        commentMessageId: event.commentMessageId,
        commentThreadId: event.commentThreadId,
        createdAt: event.createdAt,
        mentionedUserIds: event.mentionedUserIds,
        replyRecipientUserId: event.replyRecipientUserId,
        replyToMessageId: event.replyToMessageId,
        target: {
          storageScopeId: event.target.storageScopeId,
          targetId: event.target.targetId,
          targetType: "feedback",
          title: event.target.title,
        },
      }, database);
    },
    afterMessageCommitted(event, result) {
      if (!adapter.afterMessageCommitted) return Promise.resolve();
      return adapter.afterMessageCommitted({
        actor: {
          id: event.actor.id,
          name: event.actor.name,
          role: event.actor.role,
          scope: event.actor.scope ? { storageScopeId: runtimeScopeStorageId(event.actor.scope) } : null,
        },
        attachments: event.attachments,
        body: event.body,
        commentMessageId: event.commentMessageId,
        commentThreadId: event.commentThreadId,
        createdAt: event.createdAt,
        mentionedUserIds: event.mentionedUserIds,
        replyRecipientUserId: event.replyRecipientUserId,
        replyToMessageId: event.replyToMessageId,
        target: {
          storageScopeId: event.target.storageScopeId,
          targetId: event.target.targetId,
          targetType: "feedback",
          title: event.target.title,
        },
      }, result);
    },
  };
}
