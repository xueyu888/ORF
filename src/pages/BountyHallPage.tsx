import {
  CalendarCheck,
  Check,
  ClipboardList,
  Loader2,
  Send,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { remainingTime } from "../features/challenge/model/challengeDates";
import { canApplyForObjectiveChallenge } from "../domain/orfLifecycle";
import {
  BountyBadge,
  BountyButton,
  BountyCardSurface,
  BountyDialog,
  BountyEmptyState,
  BountySelect,
  BountyTextInput,
} from "../features/bounty-hall/BountyHallSkin";
import { bountyCycleLabel } from "../features/bounty-hall/model/bountyHallSummary";
import { useOrf } from "../state/OrfProvider";
import { getBountyHallData, type BountyHallData, type BountyHallItem } from "../state/apiClient";
import type { UncertaintyLevel } from "../types/orf";

type DifficultyFilter = "all" | UncertaintyLevel;
type SortKey = "deadline" | "points" | "difficulty" | "created";

type BountyItem = BountyHallItem;

type ChallengeAction = "apply" | "accept";
type ChallengeConfirmTarget = {
  action: ChallengeAction;
  item: BountyItem;
};

const difficultyOptions: DifficultyFilter[] = ["all", "入门", "进阶", "破局", "渡劫", "飞升"];
const difficultyLabelsByRank: Record<number, UncertaintyLevel> = {
  1: "入门",
  2: "进阶",
  3: "破局",
  4: "渡劫",
  5: "飞升",
};

export function BountyHallPage() {
  const {
    acceptBountyChallenge,
    applyForBounty,
  } = useOrf();
  const navigate = useNavigate();
  const [bountyData, setBountyData] = useState<BountyHallData | null>(null);
  const [loadingBounties, setLoadingBounties] = useState(true);
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [confirmTarget, setConfirmTarget] = useState<ChallengeConfirmTarget | null>(null);
  const [processingBountyId, setProcessingBountyId] = useState<string | null>(null);
  const now = useMinuteNow();

  const loadBountyData = useCallback(async () => {
    setLoadingBounties(true);
    try {
      setBountyData(await getBountyHallData());
    } catch {
      setBountyData(null);
    } finally {
      setLoadingBounties(false);
    }
  }, []);

  useEffect(() => {
    void loadBountyData();
  }, [loadBountyData]);

  const recruitmentItems = useMemo(
    () => [...(bountyData?.recruitmentItems ?? [])].sort(compareByUrgency),
    [bountyData],
  );

  const availableBounties = bountyData?.availableItems ?? [];
  const objectiveOptions = bountyData?.objectiveOptions ?? [];
  const hallItems = useMemo(() => {
    const seen = new Set<string>();
    return [...recruitmentItems, ...availableBounties].filter((item) => {
      if (seen.has(item.objective.id)) return false;
      seen.add(item.objective.id);
      return item.isRecruitment || canApplyForObjectiveChallenge(item.objective);
    });
  }, [availableBounties, recruitmentItems]);
  const pageObjectives = useMemo(() => {
    const objectives = hallItems.map((item) => item.objective);
    return objectives.length > 0 ? objectives : objectiveOptions;
  }, [hallItems, objectiveOptions]);

  const filteredHallItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = hallItems.filter((item) => {
      const queryMatch = !normalizedQuery || searchableBountyText(item).includes(normalizedQuery);
      const difficultyMatch = difficultyFilter === "all" || item.results.some((result) => result.uncertaintyLevel === difficultyFilter);
      return queryMatch && difficultyMatch;
    });

    return [...filtered].sort((left, right) => compareHallItems(left, right, sortKey));
  }, [difficultyFilter, hallItems, query, sortKey]);

  const hasFilters = query.trim() || difficultyFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setDifficultyFilter("all");
  };

  const applyChallenge = async (item: BountyItem) => {
    if (!canApplyForObjectiveChallenge(item.objective)) {
      await loadBountyData();
      setConfirmTarget(null);
      return;
    }

    setProcessingBountyId(item.objective.id);
    const ok = await applyForBounty(item.objective.id);
    setProcessingBountyId(null);
    if (ok) {
      await loadBountyData();
      setConfirmTarget(null);
    }
  };

  const acceptChallenge = async (item: BountyItem) => {
    setProcessingBountyId(item.objective.id);
    const ok = await acceptBountyChallenge(item.objective.id);
    setProcessingBountyId(null);
    if (ok) {
      await loadBountyData();
      setConfirmTarget(null);
      navigate("/tasks");
    }
  };

  return (
    <div className="bounty-hall-page grid gap-5">
      <BountyOverview
        availableCount={availableBounties.length}
        cycle={bountyCycleLabel(pageObjectives)}
        recruitmentCount={recruitmentItems.length}
      />

      <section className="grid gap-4" aria-label="悬赏目标列表">
        <div className="bounty-toolbar-panel">
          <Toolbar
            difficultyFilter={difficultyFilter}
            query={query}
            sortKey={sortKey}
            onDifficultyChange={setDifficultyFilter}
            onQueryChange={setQuery}
            onSortChange={setSortKey}
          />
        </div>

        <div className="bounty-list-summary">
          <div className="bounty-list-count">
            悬赏目标 <span>{filteredHallItems.length}</span> 条
          </div>
          {hasFilters && (
            <button className="bounty-clear-button" onClick={clearFilters}>
              清空筛选
            </button>
          )}
        </div>

        {filteredHallItems.length > 0 ? (
          <BountyObjectiveList
            items={filteredHallItems}
            now={now}
            processingBountyId={processingBountyId}
            onAction={(item) => setConfirmTarget({ action: item.isRecruitment ? "accept" : "apply", item })}
          />
        ) : (
          <BountyEmptyState
            title={loadingBounties ? "正在加载悬赏大厅" : hasFilters ? "没有符合条件的悬赏目标" : "当前没有可申请或待接受的悬赏目标"}
            description={loadingBounties ? "正在读取悬赏大厅专用接口。" : hasFilters ? "调整搜索或筛选条件后再查看。" : "新的未分配悬赏发布后会出现在这里；征召目标会自动置顶。"}
          />
        )}
      </section>

      {confirmTarget && (
        <ChallengeConfirmModal
          item={confirmTarget}
          processing={processingBountyId === confirmTarget.item.objective.id}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => void (confirmTarget.action === "accept" ? acceptChallenge(confirmTarget.item) : applyChallenge(confirmTarget.item))}
        />
      )}
    </div>
  );
}

function BountyOverview({
  availableCount,
  cycle,
  recruitmentCount,
}: {
  availableCount: number;
  cycle: string;
  recruitmentCount: number;
}) {
  return (
    <section className="bounty-overview-band" aria-label="悬赏大厅概览">
      <div className="bounty-cycle-pill">
        <CalendarCheck className="h-5 w-5" />
        <span>当前周期 · {cycle}</span>
      </div>
      <div className="bounty-stat-grid">
        <BountyStatCard icon={ClipboardList} label="可申请" tone="blue" value={availableCount} />
        <BountyStatCard icon={ShieldAlert} label="征召" tone="gold" value={recruitmentCount} />
      </div>
    </section>
  );
}

function BountyStatCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: "blue" | "gold" | "cyan" | "orange";
  value: number | string;
}) {
  return (
    <div className={`bounty-stat-card bounty-stat-card-${tone}`}>
      <div className="bounty-stat-icon">
        <Icon aria-hidden="true" />
      </div>
      <div className="bounty-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Toolbar({
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
          <option value="created">发布时间</option>
        </BountySelect>
      </div>
    </div>
  );
}

function BountyObjectiveList({
  items,
  now,
  processingBountyId,
  onAction,
}: {
  items: BountyItem[];
  now: Date;
  processingBountyId: string | null;
  onAction: (item: BountyItem) => void;
}) {
  return (
    <div className="bounty-list-table" role="table" aria-label="悬赏目标">
      <div className="bounty-list-head" role="row">
        <span>奖励</span>
        <span>悬赏目标</span>
        <span>指标</span>
        <span>剩余时间</span>
        <span>操作</span>
      </div>
      {items.map((item) => (
        <BountyListRow
          key={item.objective.id}
          item={item}
          now={now}
          processing={processingBountyId === item.objective.id}
          onAction={() => onAction(item)}
        />
      ))}
    </div>
  );
}

function BountyListRow({
  item,
  now,
  processing,
  onAction,
}: {
  item: BountyItem;
  now: Date;
  processing: boolean;
  onAction: () => void;
}) {
  const actionLabel = item.isRecruitment ? "接受挑战" : item.hasCurrentApplication ? "已申请" : "申请挑战";
  const canApply = item.isRecruitment || canApplyForObjectiveChallenge(item.objective);
  const actionDisabled = processing || !canApply || (!item.isRecruitment && item.hasCurrentApplication);

  return (
    <article
      className={`bounty-list-row${item.isRecruitment ? " bounty-list-row-priority" : ""}`}
      tabIndex={0}
      aria-label={`${item.objective.title}，移入或聚焦后显示完整信息`}
    >
      <div className="bounty-row-reward" data-label="奖励">
        {item.isRecruitment && (
          <Chip tone="warning">
            <ShieldAlert className="h-3.5 w-3.5" />
            征召令
          </Chip>
        )}
        <Chip tone={item.isRecruitment ? "accent" : "neutral"}>{highestDifficultyLabel(item)}</Chip>
        <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
      </div>
      <div className="bounty-row-main" data-label="悬赏目标">
        <div className="bounty-row-title">
          <h3>{item.objective.title}</h3>
          <div className="bounty-row-revealed">
            <p>{item.objective.description}</p>
            {item.source === "memberProposed" && item.definer && <span className="bounty-row-definer">提出人：{item.definer}</span>}
          </div>
        </div>
      </div>
      <div className="bounty-row-results" data-label="指标">
        <ResultPreview item={item} />
      </div>
      <div className="bounty-row-time" data-label="剩余时间">
        {item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}
      </div>
      <div className="bounty-row-actions" data-label="操作" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <BountyButton variant={!item.isRecruitment && item.hasCurrentApplication ? "secondary" : "primary"} onClick={onAction} disabled={actionDisabled}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : item.isRecruitment ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {actionLabel}
        </BountyButton>
      </div>
    </article>
  );
}

function ResultPreview({ item }: { item: BountyItem }) {
  return (
    <>
      <span className="bounty-result-summary">{resultCountLabel(item)}</span>
      <div className="bounty-result-preview" aria-label="指标预览">
        {item.results.length > 0 ? (
          item.results.map((result) => (
            <div key={result.id} className="bounty-result-preview-item">
              {result.metricRequirement ?? result.title}
            </div>
          ))
        ) : (
          <div className="bounty-result-preview-item">待定义指标</div>
        )}
      </div>
    </>
  );
}

function ChallengeConfirmModal({
  item,
  processing,
  onCancel,
  onConfirm,
}: {
  item: ChallengeConfirmTarget;
  processing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscape(onCancel);
  const actionLabel = item.action === "accept" ? "接受挑战" : "申请挑战";
  const title = item.action === "accept" ? "接受后会进入你的挑战页" : "提交后等待指挥官确认";
  const description =
    item.action === "accept"
      ? "接受挑战后会成为当前挑战者；目标进入重估，重估完成后由指挥官冻结。"
      : "申请挑战只表达负责意愿，不会直接成为挑战者；指挥官确认后，目标进入重估。";

  return (
    <BountyDialog
      onClose={onCancel}
      title={title}
      subtitle={actionLabel}
      variant="confirm"
      footer={
        <>
          <BountyButton variant="secondary" onClick={onCancel} disabled={processing}>
            取消
          </BountyButton>
          <BountyButton onClick={onConfirm} disabled={processing}>
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : item.action === "accept" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {actionLabel}
          </BountyButton>
        </>
      }
    >
      <BountyCardSurface>
        <div className="p-4">
          <h3 className="line-clamp-2">{item.item.objective.title}</h3>
          <p className="mt-2 truncate text-sm">{resultCountLabel(item.item)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>{highestDifficultyLabel(item.item)}</Chip>
            <Chip tone="gold">{item.item.uncertaintyPoints} 分</Chip>
          </div>
        </div>
      </BountyCardSurface>
      <p className="text-sm leading-6">{description}</p>
    </BountyDialog>
  );
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "gold" | "warning" }) {
  return <BountyBadge tone={tone}>{children}</BountyBadge>;
}

function compareHallItems(left: BountyItem, right: BountyItem, sortKey: SortKey) {
  if (left.isRecruitment !== right.isRecruitment) return left.isRecruitment ? -1 : 1;
  return compareBounties(left, right, sortKey);
}

function searchableBountyText(item: BountyItem) {
  return [
    item.objective.title,
    item.objective.description,
    item.objective.successDefinition,
    item.definer,
    ...item.results.flatMap((result) => [result.title, result.description, result.metricRequirement]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareBounties(left: BountyItem, right: BountyItem, sortKey: SortKey) {
  if (sortKey === "points") return right.uncertaintyPoints - left.uncertaintyPoints || compareByUrgency(left, right);
  if (sortKey === "difficulty") return right.difficultyRank - left.difficultyRank || compareByUrgency(left, right);
  if (sortKey === "created") return right.objective.updatedAt.localeCompare(left.objective.updatedAt) || bountySortTitle(left).localeCompare(bountySortTitle(right));
  return compareByUrgency(left, right);
}

function compareByUrgency(left: BountyItem, right: BountyItem) {
  const leftDeadline = left.deadline || "9999-12-31";
  const rightDeadline = right.deadline || "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || right.uncertaintyPoints - left.uncertaintyPoints || bountySortTitle(left).localeCompare(bountySortTitle(right));
}

function difficultyLabel(result: BountyItem["result"]) {
  return result?.uncertaintyLevel ?? "待校准";
}

function highestDifficultyLabel(item: BountyItem) {
  return difficultyLabelsByRank[item.difficultyRank] ?? difficultyLabel(item.result);
}

function resultCountLabel(item: BountyItem) {
  return item.results.length > 0 ? `${item.results.length} 个指标` : "待定义指标";
}

function bountySortTitle(item: BountyItem) {
  return item.result?.title ?? item.objective.title;
}

function useMinuteNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}
