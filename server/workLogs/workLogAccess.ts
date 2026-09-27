import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { workLogEntries } from "../db/schema";
import { canReadWorkLog, workLogAudience, workLogVisibleSql, sqlText } from "../access/resourceAudience";

export async function resolveWorkLogAccess(teamId: string, entryId: string, viewerId: string) {
  const [entry] = await db.select({ authorUserId: workLogEntries.authorUserId })
    .from(workLogEntries).where(and(eq(workLogEntries.teamId, teamId), eq(workLogEntries.id, entryId))).limit(1);
  if (!entry || !canReadWorkLog(entry.authorUserId, viewerId)) return null;
  return { audience: workLogAudience(entry.authorUserId) };
}

export function workLogVisibilityFilter(viewerId: string) {
  return sql.raw(workLogVisibleSql('"work_log_entries"."author_user_id"', sqlText(viewerId)));
}

/** Missing logs cannot grant access to orphan comments or notifications. */
export function workLogTargetVisibleSql(entryIdSql: string, teamIdSql: string, viewerIdSql: string) {
  return `EXISTS (SELECT 1 FROM work_log_entries access_log
    WHERE access_log.id = ${entryIdSql} AND access_log.team_id = ${teamIdSql}
      AND ${workLogVisibleSql("access_log.author_user_id", viewerIdSql)})`;
}
