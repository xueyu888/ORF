import type { ChallengeTarget } from "./types";

export type ChallengeUrlTargetType = "objective" | "bounty" | "action" | "subAction";

export interface ChallengeUrlTarget {
  id: string;
  type: ChallengeUrlTargetType;
}

const challengeUrlTargetTypes = new Set<ChallengeUrlTargetType>(["objective", "bounty", "action", "subAction"]);

export function challengeLinkForTarget(target: ChallengeTarget) {
  return `${window.location.origin}${window.location.pathname}#${challengeTargetHash(challengeUrlTargetForTarget(target))}`;
}

export function challengePathForTarget(target: ChallengeUrlTarget, path = "/tasks") {
  return `${path}#${challengeTargetHash(target)}`;
}

export function challengeTargetHash(target: ChallengeUrlTarget) {
  return `${target.type}:${encodeURIComponent(target.id)}`;
}

export function parseChallengeTargetHash(hash: string): ChallengeUrlTarget | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const separatorIndex = fragment.indexOf(":");
  if (separatorIndex <= 0) return null;

  const type = fragment.slice(0, separatorIndex);
  if (!isChallengeUrlTargetType(type)) return null;

  const rawId = fragment.slice(separatorIndex + 1);
  if (!rawId) return null;

  return {
    id: decodeHashId(rawId),
    type,
  };
}

function challengeUrlTargetForTarget(target: ChallengeTarget): ChallengeUrlTarget {
  return {
    id: target.id,
    type: target.type,
  };
}

function isChallengeUrlTargetType(value: string): value is ChallengeUrlTargetType {
  return challengeUrlTargetTypes.has(value as ChallengeUrlTargetType);
}

function decodeHashId(rawId: string) {
  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
}
