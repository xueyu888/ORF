import type { ContributionAllocation } from "../../types/orf";
import type { ContributionMemberTarget } from "../orfObjectiveParticipants";

export const CONTRIBUTION_RATIO_TOTAL = 1;
export const CONTRIBUTION_RATIO_TOLERANCE = 0.0001;

export type ContributionAllocationValidation =
  | { status: "ok"; allocations: ContributionAllocation[] }
  | {
      status: "invalid";
      reason: "memberCoverage" | "ratioRange" | "ratioTotal";
    };

export function validateContributionAllocationInput(
  allocations: ContributionAllocation[],
  targets: ContributionMemberTarget[],
): ContributionAllocationValidation {
  const members = uniqueContributionMemberTargets(targets);
  const targetByUserId = new Map(members.map((member) => [member.memberUserId, member]));
  const ratioByUserId = new Map<string, number>();

  for (const allocation of allocations) {
    const memberUserId = allocation.memberUserId?.trim();
    const ratio = Number(allocation.ratio);
    if (!memberUserId || !targetByUserId.has(memberUserId) || ratioByUserId.has(memberUserId)) {
      return { status: "invalid", reason: "memberCoverage" };
    }
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > CONTRIBUTION_RATIO_TOTAL) {
      return { status: "invalid", reason: "ratioRange" };
    }
    ratioByUserId.set(memberUserId, ratio);
  }

  if (ratioByUserId.size !== targetByUserId.size) {
    return { status: "invalid", reason: "memberCoverage" };
  }

  const normalized = members.map((member) => ({
    member: member.member,
    memberUserId: member.memberUserId,
    ratio: ratioByUserId.get(member.memberUserId) ?? 0,
  }));
  const total = normalized.reduce((sum, item) => sum + item.ratio, 0);
  if (Math.abs(total - CONTRIBUTION_RATIO_TOTAL) > CONTRIBUTION_RATIO_TOLERANCE) {
    return { status: "invalid", reason: "ratioTotal" };
  }

  return { status: "ok", allocations: normalized };
}

function uniqueContributionMemberTargets(values: ContributionMemberTarget[]) {
  const targets: ContributionMemberTarget[] = [];
  const seenUserIds = new Set<string>();
  for (const value of values) {
    const member = value.member.trim();
    const memberUserId = value.memberUserId?.trim();
    if (!member || !memberUserId || seenUserIds.has(memberUserId)) continue;
    seenUserIds.add(memberUserId);
    targets.push({ member, memberUserId });
  }
  return targets;
}
