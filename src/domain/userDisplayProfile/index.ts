import type { OrfUser, OrfUserDisplayProfile } from "../../types/orf";

type UserDisplayProfileSource = Pick<OrfUserDisplayProfile, "avatarUrl" | "id" | "name">;

export function userDisplayProfileFromUser(user: UserDisplayProfileSource): OrfUserDisplayProfile | null {
  const id = user.id.trim();
  if (!id) return null;

  const name = user.name.trim() || id;
  return {
    avatarUrl: user.avatarUrl ?? null,
    id,
    name,
  };
}

export function userDisplayProfilesFromUsers(users: readonly Pick<OrfUser, "avatarUrl" | "id" | "name">[]): OrfUserDisplayProfile[] {
  return users.map(userDisplayProfileFromUser).filter((profile): profile is OrfUserDisplayProfile => Boolean(profile));
}

export function mergeUserDisplayProfiles(
  current: readonly OrfUserDisplayProfile[],
  updates: readonly UserDisplayProfileSource[],
): OrfUserDisplayProfile[] {
  const profiles = new Map<string, OrfUserDisplayProfile>();
  for (const profile of current) {
    const normalized = userDisplayProfileFromUser(profile);
    if (normalized) profiles.set(normalized.id, normalized);
  }
  for (const profile of updates) {
    const normalized = userDisplayProfileFromUser(profile);
    if (normalized) profiles.set(normalized.id, normalized);
  }
  return Array.from(profiles.values());
}

export function userDisplayProfileMap(input: {
  userProfiles?: readonly OrfUserDisplayProfile[];
  users?: readonly Pick<OrfUser, "avatarUrl" | "id" | "name">[];
}) {
  const profiles = new Map<string, OrfUserDisplayProfile>();
  for (const profile of input.userProfiles ?? []) {
    const normalized = userDisplayProfileFromUser(profile);
    if (normalized) profiles.set(normalized.id, normalized);
  }
  for (const user of input.users ?? []) {
    const normalized = userDisplayProfileFromUser(user);
    if (normalized) profiles.set(normalized.id, normalized);
  }
  return profiles;
}
