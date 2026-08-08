import { eq } from "drizzle-orm";
import {
  commitFeedbackImportBatch,
  preflightFeedbackImport,
  type FeedbackImportActor,
} from "@orf/feedback-module/server";
import { db } from "../db/client";
import { projects } from "../db/schema";
import { runtimeScopeStorageId, type RuntimeScope } from "../repositories/runtimeScope";
import { listFeedbackAssigneeOptions } from "./feedbackCommandAdapter";

export type FeedbackTransferActor = FeedbackImportActor;

type FeedbackImportReferenceMappings = Parameters<typeof preflightFeedbackImport>[1]["referenceMappings"];

export async function preflightFeedbackImportForScope(input: {
  actor: FeedbackTransferActor;
  body: Buffer;
  fileName: string;
  mimeType?: string;
  referenceMappings?: FeedbackImportReferenceMappings;
  scope: RuntimeScope;
}) {
  const teamId = runtimeScopeStorageId(input.scope);
  const [assigneeOptions, projectRows] = await Promise.all([
    listFeedbackAssigneeOptions(input.scope),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.teamId, teamId)),
  ]);
  const preflight = await preflightFeedbackImport(db, {
    actor: input.actor,
    body: input.body,
    fileName: input.fileName,
    knownAssigneeUserIds: new Set(assigneeOptions.map((item) => item.id)),
    knownProjectIds: new Set(projectRows.map((item) => item.id)),
    mimeType: input.mimeType,
    referenceMappings: input.referenceMappings,
  });

  return {
    preflight,
    referenceOptions: {
      assignees: assigneeOptions,
      projects: projectRows,
    },
  };
}

export async function commitFeedbackImportForScope(input: {
  actor: FeedbackTransferActor;
  batchId: string;
}) {
  return commitFeedbackImportBatch(db, input);
}
