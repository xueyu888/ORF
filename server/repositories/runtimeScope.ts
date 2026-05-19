import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teamMembers, teams } from "../db/schema";

export type RuntimeScope = {
  id: string;
};

export function runtimeScope(id: string): RuntimeScope {
  return { id };
}

export function runtimeScopeStorageId(scope: RuntimeScope): string {
  return scope.id;
}

export async function getDefaultRuntimeScope(): Promise<RuntimeScope | null> {
  const [row] = await db.select({ id: teams.id }).from(teams).orderBy(asc(teams.id)).limit(1);
  return row ? runtimeScope(row.id) : null;
}

export async function getDefaultRuntimeScopeForUser(userId: string): Promise<RuntimeScope | null> {
  const [membership] = await db
    .select({ id: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .orderBy(asc(teamMembers.teamId))
    .limit(1);

  return membership ? runtimeScope(membership.id) : getDefaultRuntimeScope();
}
