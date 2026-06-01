import { hallTabs } from "../model/bountyHallItems";
import type { HallTab } from "../model/bountyHallTypes";

export function BountyHallTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: HallTab;
  counts: Record<HallTab, number>;
  onChange: (value: HallTab) => void;
}) {
  return (
    <div className="bounty-hall-tabs" role="tablist" aria-label="悬赏目标分组">
      {hallTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className="bounty-hall-tab"
          data-active={activeTab === tab.key ? "true" : undefined}
          onClick={() => onChange(tab.key)}
        >
          <span>{tab.label}</span>
          <strong>{counts[tab.key]}</strong>
        </button>
      ))}
    </div>
  );
}
