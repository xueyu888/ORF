import {
  Check,
  ExternalLink,
  Loader2,
  Send,
  ShieldAlert,
  Target,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { remainingTime } from "../features/challenge/model/challengeDates";
import {
  BountyBadge,
  BountyButton,
  BountyCardSurface,
  BountyDialog,
  BountyEmptyState,
  BountyIconButton,
  BountyInfoLine,
  BountyLinkButton,
  BountyMetricBox,
  BountyPanel,
  BountySelect,
  BountyTextInput,
} from "../features/bounty-hall/BountyHallSkin";
import { useOrf } from "../state/OrfProvider";
import type { BountySource, Objective, OrfState, Result, UncertaintyLevel } from "../types/orf";

type DifficultyFilter = "all" | UncertaintyLevel;
type SortKey = "deadline" | "points" | "difficulty" | "created";

type BountyItem = {
  uncertaintyPoints: number;
  deadline: string;
  definer: string;
  difficultyRank: number;
  hasCurrentApplication: boolean;
  isRecruitment: boolean;
  objective: Objective;
  result: Result;
  results: Result[];
  source: BountySource;
};

type ChallengeAction = "apply" | "accept";
type ChallengeConfirmTarget = {
  action: ChallengeAction;
  item: BountyItem;
};

const difficultyRanks: Record<UncertaintyLevel, number> = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};

const difficultyOptions: DifficultyFilter[] = ["all", "入门", "进阶", "破局", "渡劫", "飞升"];

export function BountyHallPage() {
  const {
    acceptBountyChallenge,
    applyForBounty,
    currentUser,
    openModal,
    state,
  } = useOrf();
  const navigate = useNavigate();
  const currentMember = currentUser?.name ?? state.users.find((user) => user.id === state.currentUserId)?.name ?? "User";
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [preview, setPreview] = useState<BountyItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ChallengeConfirmTarget | null>(null);
  const [processingBountyId, setProcessingBountyId] = useState<string | null>(null);
  const now = useMinuteNow();

  const allBounties = useMemo(
    () =>
      state.objectives.flatMap((objective) => {
        const results = state.results.filter((result) => result.objectiveId === objective.id);
        const result = results[0];
        if (!result) return [];
        if (objective.challengers.includes(currentMember) || objective.lootSubmittedAt || objective.acceptedResult || objective.objectiveSettlementPoints != null) return [];

        const challengeApplications = objective.challengeApplications ?? [];
        const pendingApplications = challengeApplications.filter((application) => application.status === "pending");
        const source = result.source ?? "managerDefined";
        const definer = result.definer ?? "";
        return [
          {
            uncertaintyPoints: results.reduce((sum, item) => sum + item.uncertaintyScore, 0),
            deadline: objective.finalDueAt,
            definer,
            difficultyRank: Math.max(...results.map(difficultyRank)),
            hasCurrentApplication: pendingApplications.some((application) => application.applicant === currentMember),
            isRecruitment: objective.assignedChallengers.includes(currentMember),
            objective,
            result,
            results,
            source,
          },
        ];
      }),
    [currentMember, state.objectives, state.results],
  );

  const recruitmentItems = useMemo(
    () => allBounties.filter((item) => item.isRecruitment).sort(compareByUrgency),
    [allBounties],
  );

  const availableBounties = useMemo(
    () =>
      allBounties.filter(
        (item) => !item.isRecruitment && !item.hasCurrentApplication,
      ),
    [allBounties],
  );

  const objectiveOptions = useMemo(() => {
    const ids = new Set(availableBounties.map((item) => item.objective.id));
    return state.objectives.filter((objective) => ids.has(objective.id));
  }, [availableBounties, state.objectives]);

  const filteredBounties = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = availableBounties.filter((item) => {
      const queryMatch =
        !normalizedQuery ||
        `${item.objective.title} ${item.results.map((result) => result.title).join(" ")}`.toLowerCase().includes(normalizedQuery);
      const difficultyMatch = difficultyFilter === "all" || item.results.some((result) => result.uncertaintyLevel === difficultyFilter);
      const objectiveMatch = objectiveFilter === "all" || item.objective.id === objectiveFilter;
      return queryMatch && difficultyMatch && objectiveMatch;
    });

    return [...filtered].sort((left, right) => compareBounties(left, right, sortKey));
  }, [availableBounties, difficultyFilter, objectiveFilter, query, sortKey]);

  const contribution = useMemo(() => contributionSummary(state, currentMember), [currentMember, state]);
  const hasFilters = query.trim() || difficultyFilter !== "all" || objectiveFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setDifficultyFilter("all");
    setObjectiveFilter("all");
  };

  const applyChallenge = async (item: BountyItem) => {
    setProcessingBountyId(item.objective.id);
    const ok = await applyForBounty(item.objective.id);
    setProcessingBountyId(null);
    if (ok) {
      setConfirmTarget(null);
      setPreview((current) => (current?.objective.id === item.objective.id ? null : current));
    }
  };

  const acceptChallenge = async (item: BountyItem) => {
    setProcessingBountyId(item.objective.id);
    const ok = await acceptBountyChallenge(item.objective.id);
    setProcessingBountyId(null);
    if (ok) {
      setConfirmTarget(null);
      setPreview((current) => (current?.objective.id === item.objective.id ? null : current));
      navigate("/tasks");
    }
  };

  return (
    <div className="bounty-hall-page grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="bounty-page-eyebrow">当前周期 · {currentCycle(state.objectives)}</div>
          <h1 className="bounty-page-title">悬赏大厅</h1>
        </div>
        <div className="bounty-header-actions">
          <CompactContribution points={contribution.points} />
          <BountyButton variant="secondary" onClick={() => navigate("/tasks")}>
            <Trophy className="h-4 w-4" />
            我的挑战
          </BountyButton>
          <BountyButton variant="secondary" onClick={() => openModal({ type: "newResult", source: "memberProposed" })}>
            <Send className="h-4 w-4" />
            提出候选悬赏指标
          </BountyButton>
        </div>
      </header>

      {recruitmentItems.length > 0 && (
        <section className="grid gap-3" aria-labelledby="recruitment-title">
          <div className="bounty-section-heading">
            <ShieldAlert className="h-5 w-5" />
            <h2 id="recruitment-title">征召令</h2>
          </div>
          <div className="grid gap-3">
            {recruitmentItems.map((item) => (
              <RecruitmentCard
                key={item.objective.id}
                item={item}
                now={now}
                processing={processingBountyId === item.objective.id}
                onAccept={() => setConfirmTarget({ action: "accept", item })}
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4" aria-label="可申请挑战悬赏指标">
        <BountyPanel>
          <Toolbar
            difficultyFilter={difficultyFilter}
            hasFilters={Boolean(hasFilters)}
            objectiveFilter={objectiveFilter}
            objectiveOptions={objectiveOptions}
            query={query}
            sortKey={sortKey}
            onClear={clearFilters}
            onDifficultyChange={setDifficultyFilter}
            onObjectiveChange={setObjectiveFilter}
            onQueryChange={setQuery}
            onSortChange={setSortKey}
          />
        </BountyPanel>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="bounty-list-count">
            当前可申请 <span>{filteredBounties.length}</span> 条
          </div>
          {hasFilters && (
            <button className="bounty-clear-button" onClick={clearFilters}>
              清空筛选
            </button>
          )}
        </div>

        {filteredBounties.length > 0 ? (
          <div className="bounty-card-grid">
            {filteredBounties.map((item) => (
              <BountyCard
                key={item.objective.id}
                item={item}
                now={now}
                processing={processingBountyId === item.objective.id}
                onApply={() => setConfirmTarget({ action: "apply", item })}
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        ) : (
          <BountyEmptyState
            title={hasFilters ? "没有符合条件的可申请悬赏指标" : "当前没有可申请挑战的悬赏指标"}
            description={hasFilters ? "调整搜索或筛选条件后再查看。" : "新的未分配悬赏发布后会出现在这里；已提交的申请等待指挥官确认。"}
          />
        )}
      </section>

      {preview && (
        <LightBountyPreview
          item={preview}
          now={now}
          processing={processingBountyId === preview.objective.id}
          action={preview.isRecruitment ? "accept" : "apply"}
          onAction={() => setConfirmTarget({ action: preview.isRecruitment ? "accept" : "apply", item: preview })}
          onClose={() => setPreview(null)}
        />
      )}

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

function CompactContribution({ points }: { points: number }) {
  return (
    <BountyLinkButton className="bounty-contribution-compact" to="/reports">
      <Trophy className="h-4 w-4" />
      <span>我的积分</span>
      <strong>{formatPoints(points)}</strong>
      <ExternalLink className="h-4 w-4" />
    </BountyLinkButton>
  );
}

function Toolbar({
  difficultyFilter,
  hasFilters,
  objectiveFilter,
  objectiveOptions,
  query,
  sortKey,
  onClear,
  onDifficultyChange,
  onObjectiveChange,
  onQueryChange,
  onSortChange,
}: {
  difficultyFilter: DifficultyFilter;
  hasFilters: boolean;
  objectiveFilter: string;
  objectiveOptions: Objective[];
  query: string;
  sortKey: SortKey;
  onClear: () => void;
  onDifficultyChange: (value: DifficultyFilter) => void;
  onObjectiveChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
}) {
  return (
    <div className="bounty-toolbar">
      <BountyTextInput
        ariaLabel="搜索悬赏指标"
        value={query}
        onValueChange={onQueryChange}
        placeholder="搜索悬赏指标标题或目标..."
      />

      <div className="bounty-toolbar-controls">
        <BountySelect label="难度" value={difficultyFilter} onChange={(value) => onDifficultyChange(value as DifficultyFilter)}>
          {difficultyOptions.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "全部难度" : item}
            </option>
          ))}
        </BountySelect>
        <BountySelect label="目标" value={objectiveFilter} onChange={onObjectiveChange}>
          <option value="all">全部目标</option>
          {objectiveOptions.map((objective) => (
            <option key={objective.id} value={objective.id}>
              {objective.title}
            </option>
          ))}
        </BountySelect>
        <BountySelect label="排序" value={sortKey} onChange={(value) => onSortChange(value as SortKey)}>
          <option value="deadline">截止时间</option>
          <option value="points">不确定性分</option>
          <option value="difficulty">难度</option>
          <option value="created">发布时间</option>
        </BountySelect>
        {hasFilters && <BountyIconButton icon={X} label="清空筛选" onClick={onClear} />}
      </div>
    </div>
  );
}

function RecruitmentCard({
  item,
  now,
  processing,
  onAccept,
  onPreview,
}: {
  item: BountyItem;
  now: Date;
  processing: boolean;
  onAccept: () => void;
  onPreview: () => void;
}) {
  return (
    <BountyCardSurface priority>
      <button className="bounty-card-click" onClick={onPreview}>
        <div>
          <div className="bounty-card-meta-row">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{difficultyLabel(item.result)}</Chip>
              <Chip>{item.uncertaintyPoints} 分</Chip>
            </div>
            <span>{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</span>
          </div>
          <h3 className="bounty-card-target-title mt-3 line-clamp-3">{item.result.title}</h3>
          <p className="bounty-card-objective mt-2 line-clamp-1 text-sm">归属目标：{item.objective.title}</p>
          <ResultStack item={item} />
        </div>
      </button>
      <div className="bounty-card-footer">
        <BountyButton variant="secondary" onClick={onPreview}>
          查看口径
        </BountyButton>
        <BountyButton onClick={onAccept} disabled={processing}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          接受挑战
        </BountyButton>
      </div>
    </BountyCardSurface>
  );
}

function BountyCard({
  item,
  now,
  processing,
  onApply,
  onPreview,
}: {
  item: BountyItem;
  now: Date;
  processing: boolean;
  onApply: () => void;
  onPreview: () => void;
}) {
  return (
    <BountyCardSurface>
      <button className="bounty-card-click" onClick={onPreview}>
        <div>
          <div className="bounty-card-meta-row">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              <Chip>{difficultyLabel(item.result)}</Chip>
              <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
            </div>
            <span>{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</span>
          </div>

          <h3 className="bounty-card-target-title mt-3 line-clamp-3">{item.result.title}</h3>
          <p className="bounty-card-objective mt-2 line-clamp-1 text-sm">归属目标：{item.objective.title}</p>
          <ResultStack item={item} />
          {item.source === "memberProposed" && item.definer && <small className="mt-2 block truncate font-semibold">提出人：{item.definer}</small>}
        </div>
      </button>

      <div className="bounty-card-footer">
        <BountyButton variant="secondary" onClick={onPreview}>
          查看口径
        </BountyButton>
        <BountyButton onClick={onApply} disabled={processing}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          申请挑战
        </BountyButton>
      </div>
    </BountyCardSurface>
  );
}

function ResultStack({ item }: { item: BountyItem }) {
  if (item.results.length <= 1) return null;

  const extraResults = item.results.slice(1, 4);
  const remainingCount = item.results.length - 1 - extraResults.length;

  return (
    <div className="bounty-result-stack" aria-label="同一目标下的其他悬赏指标">
      {extraResults.map((result) => (
        <div key={result.id} className="bounty-result-stack-item">
          {result.title}
        </div>
      ))}
      {remainingCount > 0 && <div className="bounty-result-stack-more">另有 {remainingCount} 个悬赏指标</div>}
    </div>
  );
}

function LightBountyPreview({
  action,
  item,
  now,
  processing,
  onAction,
  onClose,
}: {
  action: ChallengeAction;
  item: BountyItem;
  now: Date;
  processing: boolean;
  onAction: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const actionLabel = action === "accept" ? "接受挑战" : "申请挑战";

  return (
    <BountyDialog
      onClose={onClose}
      subtitle={resultSummary(item)}
      title={item.objective.title}
      footer={
        <BountyButton onClick={onAction} disabled={processing}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : action === "accept" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {actionLabel}
        </BountyButton>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        <Chip>{difficultyLabel(item.result)}</Chip>
        <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
      </div>

      <section className="grid gap-3">
        <SectionTitle icon={Target}>悬赏口径</SectionTitle>
        <InfoRow label="衡量要求" value={item.result.metricRequirement ?? item.result.description} />
        <InfoRow label="完成标准" value={item.result.completionStandard ?? "未填写"} />
        {item.definer && <InfoRow label="提出人" value={item.definer} />}
      </section>

      <section className="grid gap-3">
        <SectionTitle icon={Trophy}>挑战判断</SectionTitle>
        <div className="bounty-metric-grid">
          <BountyMetricBox label="难度" value={difficultyLabel(item.result)} />
          <BountyMetricBox label="不确定性分" value={`${item.uncertaintyPoints}`} />
          <BountyMetricBox label="剩余时间" value={item.deadline ? remainingTime(item.deadline, now) : "未设置"} />
        </div>
      </section>
    </BountyDialog>
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
      ? "接受挑战后会成为当前挑战者；执行行动项、提交战利品和验收结算都在挑战页处理。"
      : "申请挑战只表达负责意愿，不会直接成为挑战者；指挥官确认后，你再接受挑战并进入确认期。";

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
          <p className="mt-2 truncate text-sm">{resultSummary(item.item)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>{difficultyLabel(item.item.result)}</Chip>
            <Chip tone="gold">{item.item.uncertaintyPoints} 分</Chip>
          </div>
        </div>
      </BountyCardSurface>
      <p className="text-sm leading-6">{description}</p>
    </BountyDialog>
  );
}

function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-[#526376]">
      <Icon className="h-4 w-4 text-[#2e8fa6]" />
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <BountyInfoLine>
      <span>{label}</span>
      <div>{value}</div>
    </BountyInfoLine>
  );
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "gold" | "warning" }) {
  return <BountyBadge tone={tone}>{children}</BountyBadge>;
}

function compareBounties(left: BountyItem, right: BountyItem, sortKey: SortKey) {
  if (sortKey === "points") return right.uncertaintyPoints - left.uncertaintyPoints || compareByUrgency(left, right);
  if (sortKey === "difficulty") return right.difficultyRank - left.difficultyRank || compareByUrgency(left, right);
  if (sortKey === "created") return right.objective.updatedAt.localeCompare(left.objective.updatedAt) || left.result.title.localeCompare(right.result.title);
  return compareByUrgency(left, right);
}

function compareByUrgency(left: BountyItem, right: BountyItem) {
  const leftDeadline = left.deadline || "9999-12-31";
  const rightDeadline = right.deadline || "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || right.uncertaintyPoints - left.uncertaintyPoints || left.result.title.localeCompare(right.result.title);
}

function contributionSummary(state: OrfState, currentMember: string) {
  let points = 0;

  for (const objective of state.objectives) {
    if (!objective.challengers.includes(currentMember)) continue;
    if (objective.objectiveSettlementPoints != null) {
      points += objective.objectiveSettlementPoints;
    }
  }

  return { points };
}

function difficultyRank(result: Result) {
  return result.uncertaintyLevel ? difficultyRanks[result.uncertaintyLevel] : difficultyRanks["进阶"];
}

function difficultyLabel(result: Result) {
  return result.uncertaintyLevel ?? "进阶";
}

function resultSummary(item: BountyItem) {
  if (item.results.length <= 1) return item.result.title;
  return `${item.results.length} 个悬赏指标 · ${item.result.title}`;
}

function currentCycle(objectives: Objective[]) {
  return objectives[0]?.cycle ?? "全部周期";
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
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
