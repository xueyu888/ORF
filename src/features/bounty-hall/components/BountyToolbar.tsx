import { BountySelect, BountyTextInput } from "../BountyHallSkin";
import type { SortKey } from "../model/bountyHallTypes";

export function BountyToolbar({
  query,
  sortKey,
  onQueryChange,
  onSortChange,
}: {
  query: string;
  sortKey: SortKey;
  onQueryChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
}) {
  return (
    <div className="bounty-toolbar">
      <BountyTextInput
        ariaLabel="搜索悬赏目标"
        value={query}
        onValueChange={onQueryChange}
        placeholder="搜索悬赏目标或指标..."
      />

      <div className="bounty-toolbar-controls">
        <BountySelect label="排序" value={sortKey} onChange={(value) => onSortChange(value as SortKey)}>
          <option value="deadline">截止时间</option>
          <option value="points">目标分数</option>
          <option value="published">发布时间</option>
        </BountySelect>
      </div>
    </div>
  );
}
