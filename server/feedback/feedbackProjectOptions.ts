import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { projects } from "../db/schema";

export type FeedbackProjectOption = {
  id: string;
  name: string;
};

export async function listFeedbackProjectOptions(teamId: string): Promise<FeedbackProjectOption[]> {
  return db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.teamId, teamId));
}

export async function resolveFeedbackProjectById(
  teamId: string,
  projectId: string | null | undefined,
): Promise<FeedbackProjectOption | null> {
  const normalizedProjectId = projectId?.trim();
  if (!normalizedProjectId) return null;
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, normalizedProjectId), eq(projects.teamId, teamId)))
    .limit(1);
  return project ?? null;
}
