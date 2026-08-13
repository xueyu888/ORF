import { and, eq } from "drizzle-orm";
import type {
  CommentTargetAccess,
  CommentTargetActor,
  CommentTargetAdapter,
  CommentTargetSnapshot,
} from "../comments/commentTargetAdapters";
import type { OrfUnitOfWorkToken } from "@orf/module-protocol";
import { registerCommentTargetAdapter } from "../comments/commentTargetAdapters";
import { db } from "../db/client";
import { resolveUnitOfWork } from "../db/unitOfWork";
import { workLogEntries } from "../db/schema";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";

let registered = false;

function actorScopeId(actor: CommentTargetActor) {
  return actor.scope ? runtimeScopeStorageId(actor.scope) : "";
}

function canUseWorkLogCommentTarget(actor: CommentTargetActor, target: CommentTargetSnapshot): CommentTargetAccess {
  const storageScopeId = actorScopeId(actor);
  if (!storageScopeId || storageScopeId !== target.storageScopeId) {
    return "notFound";
  }
  return actor.role === "admin" || actor.role === "member" ? "allowed" : "forbidden";
}

function workLogCommentTitle(row: {
  authorNameSnapshot: string;
  categoryIdSnapshot?: string | null;
  categoryNameSnapshot?: string | null;
  objectiveIdSnapshot?: string | null;
  objectiveTitleSnapshot?: string | null;
  workDate: string;
}) {
  const targetLabel =
    row.objectiveTitleSnapshot ??
    row.objectiveIdSnapshot ??
    row.categoryNameSnapshot ??
    row.categoryIdSnapshot ??
    "未归类";
  return `${row.authorNameSnapshot} · ${row.workDate} · ${targetLabel}`;
}

async function resolveWorkLogCommentTarget(targetId: string): Promise<CommentTargetSnapshot | null> {
  const [entry] = await db
    .select({
      id: workLogEntries.id,
      teamId: workLogEntries.teamId,
      authorNameSnapshot: workLogEntries.authorNameSnapshot,
      workDate: workLogEntries.workDate,
      objectiveIdSnapshot: workLogEntries.objectiveIdSnapshot,
      objectiveTitleSnapshot: workLogEntries.objectiveTitleSnapshot,
      categoryIdSnapshot: workLogEntries.categoryIdSnapshot,
      categoryNameSnapshot: workLogEntries.categoryNameSnapshot,
    })
    .from(workLogEntries)
    .where(eq(workLogEntries.id, targetId))
    .limit(1);

  return entry
    ? {
        storageScopeId: entry.teamId,
        targetId: entry.id,
        targetType: "workLog",
        title: workLogCommentTitle(entry),
      }
    : null;
}

async function lockWorkLogCommentTarget(unitOfWork: OrfUnitOfWorkToken, target: CommentTargetSnapshot) {
  const database = resolveUnitOfWork(unitOfWork);
  const [entry] = await database
    .select({ id: workLogEntries.id })
    .from(workLogEntries)
    .where(and(eq(workLogEntries.teamId, target.storageScopeId), eq(workLogEntries.id, target.targetId)))
    .limit(1)
    .for("update");
  return Boolean(entry);
}

const workLogCommentTargetAdapter: CommentTargetAdapter = {
  invalidationModel: "taskManagement",
  protocolVersion: 1,
  type: "workLog",
  canComment: async (actor, target) => canUseWorkLogCommentTarget(actor, target),
  canRead: async (actor, target) => canUseWorkLogCommentTarget(actor, target),
  href(targetId, commentId) {
    const query = new URLSearchParams({ entry: targetId, view: "today" });
    if (commentId?.trim()) {
      query.set("comment", commentId.trim());
    }
    return `/work-logs?${query.toString()}`;
  },
  lockForComment: lockWorkLogCommentTarget,
  resolve: resolveWorkLogCommentTarget,
};

export function registerWorkLogCommentTargetAdapter() {
  if (registered) return;
  registerCommentTargetAdapter(workLogCommentTargetAdapter);
  registered = true;
}
