import type { OrfUserDisplayProfile } from "../../src/types/orf";
import type { RuntimeScope } from "../repositories/runtimeScope";
import { getScopedUsers } from "../repositories/userRepository";

export type FeedbackAssigneeOption = Pick<OrfUserDisplayProfile, "avatarUrl" | "id" | "name">;

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
