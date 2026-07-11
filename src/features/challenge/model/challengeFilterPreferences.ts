import type { FilterPreferenceRecord } from "../../../domain/settings/filterPreferences";
import { filterPreferenceStringListValue, filterPreferenceStringValue } from "../../../domain/settings/filterPreferences";
import {
  normalizeChallengeStatusFilterSelection,
  type ChallengeCycleFilter,
  type ChallengeMemberFilter,
  type ChallengeProjectFilter,
  type ChallengeStatusFilterSelection,
} from "./challengeFilters";
import type { ChallengeScope } from "./types";

export const challengePlanFilterPreferenceKey = "challenge.plan";

export type ChallengePlanFilterPreference = {
  cycle: ChallengeCycleFilter;
  member: ChallengeMemberFilter;
  project: ChallengeProjectFilter;
  scope: ChallengeScope;
  status: ChallengeStatusFilterSelection;
};

export function defaultChallengePlanFilterPreference(scope: ChallengeScope): ChallengePlanFilterPreference {
  return {
    cycle: "all",
    member: "all",
    project: "all",
    scope,
    status: [],
  };
}

export function challengePlanFilterPreferenceFromRecord(
  record: FilterPreferenceRecord | null | undefined,
  input: { defaultScope: ChallengeScope },
): ChallengePlanFilterPreference {
  const fallback = defaultChallengePlanFilterPreference(input.defaultScope);
  const scope = filterPreferenceStringValue(record, "scope");
  return {
    cycle: filterValueOrAll(filterPreferenceStringValue(record, "cycle")),
    member: filterValueOrAll(filterPreferenceStringValue(record, "member")),
    project: filterValueOrAll(filterPreferenceStringValue(record, "project")),
    scope: scope === "all" || scope === "mine" ? scope : fallback.scope,
    status: normalizeChallengeStatusFilterSelection(filterPreferenceStringListValue(record, "status")),
  };
}

export function challengePlanFilterPreferenceToRecord(preference: ChallengePlanFilterPreference): FilterPreferenceRecord {
  const values: FilterPreferenceRecord["values"] = {
    scope: preference.scope,
  };

  if (preference.cycle !== "all") values.cycle = preference.cycle;
  if (preference.member !== "all") values.member = preference.member;
  if (preference.project !== "all") values.project = preference.project;
  if (preference.status.length > 0) values.status = [...preference.status];

  return { values, version: 1 };
}

function filterValueOrAll(value: string | null): string {
  return value?.trim() || "all";
}
