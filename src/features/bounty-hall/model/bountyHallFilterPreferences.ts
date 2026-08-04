import type { FilterPreferenceRecord } from "../../../domain/settings/filterPreferences";
import { filterPreferenceStringValue } from "../../../domain/settings/filterPreferences";
import { defaultHallTab, hallTabs } from "./bountyHallItems";
import type { HallTab, SortKey } from "./bountyHallTypes";

export const bountyHallFilterPreferenceKey = "bounty.hall";
export const defaultBountyHallSortKey = "deadline" satisfies SortKey;

export type BountyHallFilterPreference = {
  sortKey: SortKey;
  tab: HallTab;
};

const hallTabValues = new Set<HallTab>(hallTabs.map((tab) => tab.key));
const sortKeyValues = new Set<SortKey>([defaultBountyHallSortKey, "points", "published"]);

export function defaultBountyHallFilterPreference(): BountyHallFilterPreference {
  return {
    sortKey: defaultBountyHallSortKey,
    tab: defaultHallTab,
  };
}

export function bountyHallFilterPreferenceFromRecord(
  record: FilterPreferenceRecord | null | undefined,
): BountyHallFilterPreference {
  return {
    sortKey: normalizeBountyHallSortKey(filterPreferenceStringValue(record, "sort")),
    tab: normalizeBountyHallTab(filterPreferenceStringValue(record, "tab")),
  };
}

export function bountyHallFilterPreferenceToRecord(preference: BountyHallFilterPreference): FilterPreferenceRecord | null {
  const values: FilterPreferenceRecord["values"] = {};
  const tab = normalizeBountyHallTab(preference.tab);
  const sortKey = normalizeBountyHallSortKey(preference.sortKey);

  if (tab !== defaultHallTab) values.tab = tab;
  if (sortKey !== defaultBountyHallSortKey) values.sort = sortKey;

  return Object.keys(values).length > 0 ? { values, version: 1 } : null;
}

function normalizeBountyHallTab(value: string | null): HallTab {
  return value && hallTabValues.has(value as HallTab) ? value as HallTab : defaultHallTab;
}

function normalizeBountyHallSortKey(value: string | null): SortKey {
  return value && sortKeyValues.has(value as SortKey) ? value as SortKey : defaultBountyHallSortKey;
}
