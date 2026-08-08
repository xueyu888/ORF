import type { OrfUserDisplayProfile } from "../../src/types/orf";
import { runtimeScope, type RuntimeScope } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";

export type FeedbackAssigneeOption = Pick<OrfUserDisplayProfile, "avatarUrl" | "id" | "name">;
export type FeedbackActiveMember = Pick<OrfUserDisplayProfile, "id" | "name">;

export async function listFeedbackAssigneeOptions(scope: RuntimeScope): Promise<FeedbackAssigneeOption[]> {
  const scopedUsers = await getScopedUsers(scope);
  return scopedUsers
    .filter((user) => user.status === "active")
    .map((user) => ({
      avatarUrl: user.avatarUrl ?? null,
      id: user.id,
      name: user.name,
    }));
}

export async function resolveFeedbackActiveMemberById(
  teamId: string,
  userId: string | null | undefined,
): Promise<FeedbackActiveMember | null> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    return null;
  }

  const scopedUsers = await getScopedUsers(runtimeScope(teamId));
  const member = scopedUsers.find((user) => user.status === "active" && user.id === normalizedUserId);
  return member ? { id: member.id, name: member.name } : null;
}
