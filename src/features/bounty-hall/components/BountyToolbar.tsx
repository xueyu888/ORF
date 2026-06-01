import { BountySelect, BountyTextInput } from "../BountyHallSkin";
import { difficultyOptions } from "../model/bountyHallItems";
import type { DifficultyFilter, SortKey } from "../model/bountyHallTypes";

export function BountyToolbar({
  difficultyFilter,
  query,
  sortKey,
  onDifficultyChange,
  onQueryChange,
  onSortChange,
}: {
  difficultyFilter: DifficultyFilter;
  query: string;
  sortKey: SortKey;
  onDifficultyChange: (value: DifficultyFilter) => void;
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
        <BountySelect label="难度" value={difficultyFilter} onChange={(value) => onDifficultyChange(value as DifficultyFilter)}>
          {difficultyOptions.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "全部难度" : item}
            </option>
          ))}
        </BountySelect>
        <BountySelect label="排序" value={sortKey} onChange={(value) => onSortChange(value as SortKey)}>
          <option value="deadline">截止时间</option>
          <option value="points">不确定性分</option>
          <option value="difficulty">难度</option>
          <option value="published">发布时间</option>
        </BountySelect>
      </div>
    </div>
  );
}
