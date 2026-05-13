import { clsx } from "clsx";
import {
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Search,
  Send,
  ShieldAlert,
  Star,
  Target,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { remainingTime } from "../features/challenge/model/challengeDates";
import { submittedLootIdsFromComments } from "../features/challenge/model/challengeComments";
import { bountyStatus } from "../features/challenge/model/challengeStatus";
import { useOrf } from "../state/OrfProvider";
import type { BountySource, Objective, OrfState, Result, UncertaintyLevel } from "../types/orf";
import { Button, EmptyState, IconButton } from "../components/ui";

type DifficultyFilter = "all" | UncertaintyLevel;
type SortKey = "deadline" | "points" | "difficulty" | "created";

type BountyItem = {
  uncertaintyPoints: number;
  deadline: string;
  definer: string;
  difficultyRank: number;
  hasCurrentApplication: boolean;
  isRecruitment: boolean;
  isCurrentDefinerLockedOut: boolean;
  isPriorityChallenge: boolean;
  isPriorityReserved: boolean;
  objective: Objective;
  priorityExpiresAt: string;
  result: Result;
  source: BountySource;
};

type ChallengeAction = "apply" | "accept";
type ChallengeConfirmTarget = {
  action: ChallengeAction;
  item: BountyItem;
};

const difficultyScores: Record<UncertaintyLevel, number> = {
  入门: 10,
  进阶: 30,
  破局: 90,
  渡劫: 270,
  飞升: 810,
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
    declinePriorityChallenge,
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

  const submittedLootIds = useMemo(() => submittedLootIdsFromComments(state.comments), [state.comments]);
  const allBounties = useMemo(
    () =>
      state.results.flatMap((result) => {
        const objective = state.objectives.find((item) => item.id === result.objectiveId);
        if (!objective) return [];

        const actions = state.tasks.filter((task) => task.linkedResultId === result.id);
        const effectiveResult = isEmptyChallenger(result.owner) ? { ...result, owner: "" } : result;
        const status = bountyStatus(effectiveResult, actions, state.automaticCompletions?.[objective.id]?.rets?.[result.id], submittedLootIds.has(result.id));
        if (status !== "open") return [];

        const isMainline = objective.resultIds[0] === result.id;
        const challengeApplications = result.challengeApplications ?? [];
        const pendingApplications = challengeApplications.filter((application) => application.status === "pending");
        const source = result.source ?? "managerDefined";
        const definer = result.definer ?? "";
        const priorityExpiresAt = result.priorityChallengeExpiresAt ?? "";
        if (source === "memberProposed" && !priorityExpiresAt && !result.owner) return [];
        const priorityDeclinedBy = result.priorityDeclinedBy ?? [];
        const definerDeclined = Boolean(definer) && priorityDeclinedBy.includes(definer);
        const isCurrentDefiner = source === "memberProposed" && definer === currentMember;
        const isPriorityActive = Boolean(priorityExpiresAt) && isFutureTime(priorityExpiresAt, now) && !definerDeclined;
        return [
          {
            uncertaintyPoints: uncertaintyPoints(result),
            deadline: result.finalDueAt ?? "",
            definer,
            difficultyRank: difficultyRank(result),
            hasCurrentApplication: pendingApplications.some((application) => application.applicant === currentMember),
            isRecruitment: isMainline && result.assignedChallenger === currentMember,
            isCurrentDefinerLockedOut: isCurrentDefiner && (!isPriorityActive || priorityDeclinedBy.includes(currentMember)),
            isPriorityChallenge: isCurrentDefiner && isPriorityActive,
            isPriorityReserved: source === "memberProposed" && isPriorityActive,
            objective,
            priorityExpiresAt,
            result,
            source,
          },
        ];
      }),
    [currentMember, now, state.automaticCompletions, state.objectives, state.results, state.tasks, submittedLootIds],
  );

  const recruitmentItems = useMemo(
    () => allBounties.filter((item) => item.isRecruitment).sort(compareByUrgency),
    [allBounties],
  );

  const priorityItems = useMemo(
    () => allBounties.filter((item) => item.isPriorityChallenge).sort(compareByPriorityTime),
    [allBounties],
  );

  const availableBounties = useMemo(
    () =>
      allBounties.filter(
        (item) => !item.isRecruitment && !item.hasCurrentApplication && !item.isPriorityChallenge && !item.isPriorityReserved && !item.isCurrentDefinerLockedOut,
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
        `${item.result.title} ${item.objective.title}`.toLowerCase().includes(normalizedQuery);
      const difficultyMatch = difficultyFilter === "all" || item.result.uncertaintyLevel === difficultyFilter;
      const objectiveMatch = objectiveFilter === "all" || item.objective.id === objectiveFilter;
      return queryMatch && difficultyMatch && objectiveMatch;
    });

    return [...filtered].sort((left, right) => compareBounties(left, right, sortKey));
  }, [availableBounties, difficultyFilter, objectiveFilter, query, sortKey]);

  const contribution = useMemo(() => contributionSummary(state, currentMember, submittedLootIds), [currentMember, state, submittedLootIds]);
  const hasFilters = query.trim() || difficultyFilter !== "all" || objectiveFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setDifficultyFilter("all");
    setObjectiveFilter("all");
  };

  const applyChallenge = async (item: BountyItem) => {
    setProcessingBountyId(item.result.id);
    const ok = await applyForBounty(item.result.id);
    setProcessingBountyId(null);
    if (ok) {
      setConfirmTarget(null);
      setPreview((current) => (current?.result.id === item.result.id ? null : current));
    }
  };

  const acceptChallenge = async (item: BountyItem) => {
    setProcessingBountyId(item.result.id);
    const ok = await acceptBountyChallenge(item.result.id);
    setProcessingBountyId(null);
    if (ok) {
      setConfirmTarget(null);
      setPreview((current) => (current?.result.id === item.result.id ? null : current));
      navigate("/tasks");
    }
  };

  const declinePriority = (item: BountyItem) => {
    if (declinePriorityChallenge(item.result.id)) {
      setPreview((current) => (current?.result.id === item.result.id ? null : current));
    }
  };

  return (
    <div className="bounty-hall-page grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="orf-text-muted text-sm font-semibold">当前周期 · {currentCycle(state.objectives)}</div>
          <h1 className="orf-text-primary mt-1 text-3xl font-semibold">悬赏大厅</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate("/tasks")}>
            <Trophy className="h-4 w-4" />
            我的挑战
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: "newResult", source: "memberProposed" })}>
            <Send className="h-4 w-4" />
            提出候选悬赏指标
          </Button>
        </div>
      </header>

      <ContributionSummary points={contribution.points} />

      {recruitmentItems.length > 0 && (
        <section className="grid gap-3" aria-labelledby="recruitment-title">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[color:var(--orf-warning-text)]" />
            <h2 id="recruitment-title" className="orf-text-primary text-base font-semibold">
              征召令
            </h2>
          </div>
          <div className="grid gap-3">
            {recruitmentItems.map((item) => (
              <RecruitmentCard
                key={item.result.id}
                item={item}
                now={now}
                processing={processingBountyId === item.result.id}
                onAccept={() => setConfirmTarget({ action: "accept", item })}
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        </section>
      )}

      {priorityItems.length > 0 && (
        <section className="grid gap-3" aria-labelledby="priority-title">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-[color:var(--orf-warning-text)]" />
            <h2 id="priority-title" className="orf-text-primary text-base font-semibold">
              优先挑战
            </h2>
          </div>
          <div className="grid gap-3">
            {priorityItems.map((item) => (
              <PriorityChallengeCard
                key={item.result.id}
                item={item}
                now={now}
                processing={processingBountyId === item.result.id}
                onAccept={() => setConfirmTarget({ action: "accept", item })}
                onDecline={() => declinePriority(item)}
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4" aria-label="可申请挑战悬赏指标">
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="orf-text-secondary text-sm">
            当前可申请 <span className="orf-text-primary font-semibold">{filteredBounties.length}</span> 条
          </div>
          {hasFilters && (
            <button className="orf-text-secondary orf-hover-text text-sm font-medium" onClick={clearFilters}>
              清空筛选
            </button>
          )}
        </div>

        {filteredBounties.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {filteredBounties.map((item) => (
              <BountyCard
                key={item.result.id}
                item={item}
                now={now}
                processing={processingBountyId === item.result.id}
                onApply={() => setConfirmTarget({ action: "apply", item })}
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={hasFilters ? "没有符合条件的可申请悬赏指标" : "当前没有可申请挑战的悬赏指标"}
            description={hasFilters ? "调整搜索或筛选条件后再查看。" : "新的未分配悬赏发布后会出现在这里；已提交的申请等待指挥官确认。"}
          />
        )}
      </section>

      {preview && (
        <LightBountyPreview
          item={preview}
          now={now}
          processing={processingBountyId === preview.result.id}
          action={preview.isRecruitment || preview.isPriorityChallenge ? "accept" : "apply"}
          onAction={() => setConfirmTarget({ action: preview.isRecruitment || preview.isPriorityChallenge ? "accept" : "apply", item: preview })}
          onClose={() => setPreview(null)}
          onDeclinePriority={preview.isPriorityChallenge ? () => declinePriority(preview) : undefined}
        />
      )}

      {confirmTarget && (
        <ChallengeConfirmModal
          item={confirmTarget}
          processing={processingBountyId === confirmTarget.item.result.id}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => void (confirmTarget.action === "accept" ? acceptChallenge(confirmTarget.item) : applyChallenge(confirmTarget.item))}
        />
      )}
    </div>
  );
}

function ContributionSummary({ points }: { points: number }) {
  return (
    <section className="orf-card orf-card-padding grid gap-4 md:grid-cols-[1fr_auto] md:items-center" aria-label="我的贡献概览">
      <SummaryMetric icon={Trophy} label="我的积分" value={formatPoints(points)} />
      <Link className="orf-control orf-secondary-action inline-flex items-center justify-center gap-2 border px-3 py-2 text-sm font-medium" to="/reports">
        查看积分明细
        <ExternalLink className="h-4 w-4" />
      </Link>
    </section>
  );
}

function SummaryMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="orf-fantasy-emblem flex h-10 w-10 shrink-0 items-center justify-center [--orf-fantasy-tone:var(--orf-fantasy-blue)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="orf-text-muted text-xs font-semibold">{label}</div>
        <div className="orf-text-primary truncate text-2xl font-semibold">{value}</div>
      </div>
    </div>
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
    <div className="orf-card orf-card-padding grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
      <label className="relative block min-w-0">
        <span className="sr-only">搜索悬赏指标</span>
        <Search className="orf-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          className="orf-input h-11 pl-9 pr-3"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索悬赏指标标题或目标..."
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
        <SelectControl label="难度" value={difficultyFilter} onChange={(value) => onDifficultyChange(value as DifficultyFilter)}>
          {difficultyOptions.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "全部难度" : item}
            </option>
          ))}
        </SelectControl>
        <SelectControl label="目标" value={objectiveFilter} onChange={onObjectiveChange}>
          <option value="all">全部目标</option>
          {objectiveOptions.map((objective) => (
            <option key={objective.id} value={objective.id}>
              {objective.title}
            </option>
          ))}
        </SelectControl>
        <SelectControl label="排序" value={sortKey} onChange={(value) => onSortChange(value as SortKey)}>
          <option value="deadline">截止时间</option>
          <option value="points">不确定性分</option>
          <option value="difficulty">难度</option>
          <option value="created">发布时间</option>
        </SelectControl>
        {hasFilters && <IconButton icon={X} label="清空筛选" onClick={onClear} />}
      </div>
    </div>
  );
}

function SelectControl({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid min-w-[132px] gap-1">
      <span className="orf-text-muted text-xs font-semibold">{label}</span>
      <select className="orf-input h-10 px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
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
    <div className="orf-card orf-card-padding grid gap-4 border-[color:var(--orf-warning-border)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <button className="min-w-0 text-left" onClick={onPreview}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{difficultyLabel(item.result)}</Chip>
          <Chip>{item.uncertaintyPoints} 分</Chip>
        </div>
        <h3 className="orf-text-primary mt-3 line-clamp-2 text-base font-semibold">{item.result.title}</h3>
        <div className="orf-text-secondary mt-2 truncate text-sm">{item.objective.title}</div>
        <div className="orf-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</span>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onPreview}>
          查看口径
        </Button>
        <Button onClick={onAccept} disabled={processing}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          接受挑战
        </Button>
      </div>
    </div>
  );
}

function PriorityChallengeCard({
  item,
  now,
  processing,
  onAccept,
  onDecline,
  onPreview,
}: {
  item: BountyItem;
  now: Date;
  processing: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onPreview: () => void;
}) {
  return (
    <div className="orf-card orf-card-padding grid gap-4 border-[color:var(--orf-warning-border)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <button className="min-w-0 text-left" onClick={onPreview}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{difficultyLabel(item.result)}</Chip>
          <Chip>{item.uncertaintyPoints} 分</Chip>
        </div>
        <h3 className="orf-text-primary mt-3 line-clamp-2 text-base font-semibold">{item.result.title}</h3>
        <div className="orf-text-secondary mt-2 truncate text-sm">{item.objective.title}</div>
        <div className="orf-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>提出人：{item.definer || "未记录"}</span>
          <span>{remainingDateTime(item.priorityExpiresAt, now)}</span>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onDecline} disabled={processing}>
          放弃
        </Button>
        <Button onClick={onAccept} disabled={processing}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          接受挑战
        </Button>
      </div>
    </div>
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
    <article className="orf-card orf-card-hover group grid min-h-[224px] grid-rows-[1fr_auto] overflow-visible">
      <button className="grid min-w-0 gap-3 p-4 text-left" onClick={onPreview}>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <Chip>{difficultyLabel(item.result)}</Chip>
          <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
        </div>

        <div className="min-w-0">
          <h3 className="orf-text-primary line-clamp-2 min-h-[48px] text-base font-semibold leading-6">{item.result.title}</h3>
          <div className="orf-text-secondary mt-2 truncate text-sm">{item.objective.title}</div>
          {item.source === "memberProposed" && item.definer && <div className="orf-text-muted mt-2 truncate text-xs font-semibold">提出人：{item.definer}</div>}
        </div>

        <div className="orf-text-secondary inline-flex min-w-0 items-center gap-1.5 text-sm">
          <Clock className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</span>
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 border-t orf-border px-4 py-3">
        <Button variant="secondary" onClick={onPreview}>
          查看口径
        </Button>
        <Button className="ml-auto" onClick={onApply} disabled={processing}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          申请挑战
        </Button>
      </div>
    </article>
  );
}

function LightBountyPreview({
  action,
  item,
  now,
  processing,
  onAction,
  onClose,
  onDeclinePriority,
}: {
  action: ChallengeAction;
  item: BountyItem;
  now: Date;
  processing: boolean;
  onAction: () => void;
  onClose: () => void;
  onDeclinePriority?: () => void;
}) {
  useEscape(onClose);
  const actionLabel = action === "accept" ? "接受挑战" : "申请挑战";

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/35 px-4 py-[10vh]" onMouseDown={onClose}>
      <aside className="orf-card z-50 w-full max-w-2xl" aria-label="悬赏指标轻详情" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b orf-border p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Chip>{difficultyLabel(item.result)}</Chip>
              <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
            </div>
            <h2 className="orf-text-primary mt-3 text-xl font-semibold leading-7">{item.result.title}</h2>
            <div className="orf-text-secondary mt-2 text-sm">{item.objective.title}</div>
          </div>
          <IconButton icon={X} label="关闭轻详情" onClick={onClose} />
        </div>

        <div className="grid gap-5 p-5">
          <section className="grid gap-3">
            <SectionTitle icon={Target}>悬赏口径</SectionTitle>
            <InfoRow label="衡量要求" value={item.result.metricRequirement ?? item.result.description} />
            <InfoRow label="完成标准" value={item.result.completionStandard ?? "未填写"} />
            {item.definer && <InfoRow label="提出人" value={item.definer} />}
          </section>

          <section className="grid gap-3">
            <SectionTitle icon={Trophy}>挑战判断</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricBox label="难度" value={difficultyLabel(item.result)} />
              <MetricBox label="不确定性分" value={`${item.uncertaintyPoints}`} />
              <MetricBox label="剩余时间" value={item.deadline ? remainingTime(item.deadline, now) : "未设置"} />
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t orf-border p-5">
          <div className="flex items-center gap-2">
            {onDeclinePriority && (
              <Button variant="secondary" onClick={onDeclinePriority}>
                放弃
              </Button>
            )}
            <Button onClick={onAction} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : action === "accept" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {actionLabel}
            </Button>
          </div>
        </div>
      </aside>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[14vh]" onMouseDown={onCancel}>
      <div className="orf-card w-full max-w-lg" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b orf-border p-5">
          <div>
            <div className="orf-text-muted text-sm font-semibold">{actionLabel}</div>
            <h2 className="orf-text-primary mt-1 text-lg font-semibold">{title}</h2>
          </div>
          <IconButton icon={X} label="关闭" onClick={onCancel} />
        </div>
        <div className="grid gap-4 p-5">
          <div className="orf-surface-muted rounded-md border orf-border p-4">
            <div className="orf-text-primary line-clamp-2 text-base font-semibold">{item.item.result.title}</div>
            <div className="orf-text-secondary mt-2 truncate text-sm">{item.item.objective.title}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip>{difficultyLabel(item.item.result)}</Chip>
              <Chip tone="gold">{item.item.uncertaintyPoints} 分</Chip>
            </div>
          </div>
          <p className="orf-text-secondary text-sm">{description}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={processing}>
              取消
            </Button>
            <Button onClick={onConfirm} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : item.action === "accept" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon: LucideIcon }) {
  return (
    <div className="orf-text-primary flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-[color:var(--orf-accent-text)]" />
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="orf-text-muted text-xs font-semibold">{label}</div>
      <div className="orf-text-primary text-sm leading-6">{value}</div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="orf-surface-muted rounded-md border orf-border p-3">
      <div className="orf-text-muted text-xs font-semibold">{label}</div>
      <div className="orf-text-primary mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "gold" | "warning" }) {
  return (
    <span
      className={clsx(
        "orf-status-tag inline-flex h-7 items-center justify-center border px-2.5 text-xs font-bold leading-none",
        tone === "neutral" && "orf-badge-neutral",
        tone === "accent" && "orf-badge-accent",
        tone === "gold" && "border-[color:var(--orf-warning-border)] bg-[color:var(--orf-warning-bg)] text-[color:var(--orf-warning-text)]",
        tone === "warning" && "orf-badge-warning",
      )}
    >
      {children}
    </span>
  );
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

function compareByPriorityTime(left: BountyItem, right: BountyItem) {
  const leftExpiresAt = left.priorityExpiresAt || "9999-12-31T23:59:59.999Z";
  const rightExpiresAt = right.priorityExpiresAt || "9999-12-31T23:59:59.999Z";
  return leftExpiresAt.localeCompare(rightExpiresAt) || compareByUrgency(left, right);
}

function isFutureTime(value: string, now: Date) {
  const target = new Date(value);
  return !Number.isNaN(target.getTime()) && target.getTime() > now.getTime();
}

function contributionSummary(state: OrfState, currentMember: string, submittedLootIds: Set<string>) {
  let points = 0;

  for (const result of state.results) {
    if (!result.owner || isEmptyChallenger(result.owner)) continue;
    if (result.owner !== currentMember) continue;
    const objective = state.objectives.find((item) => item.id === result.objectiveId);
    const actions = state.tasks.filter((task) => task.linkedResultId === result.id);
    const status = bountyStatus(result, actions, objective ? state.automaticCompletions?.[objective.id]?.rets?.[result.id] : undefined, submittedLootIds.has(result.id));
    if (status === "settled") {
      points += uncertaintyPoints(result);
    }
  }

  return { points };
}

function uncertaintyPoints(result: Result) {
  return result.uncertaintyLevel ? difficultyScores[result.uncertaintyLevel] : difficultyScores["进阶"];
}

function difficultyRank(result: Result) {
  return result.uncertaintyLevel ? difficultyRanks[result.uncertaintyLevel] : difficultyRanks["进阶"];
}

function difficultyLabel(result: Result) {
  return result.uncertaintyLevel ?? "进阶";
}

function isEmptyChallenger(owner: string) {
  const value = owner.trim();
  return value === "" || value === "User" || value === "未分配";
}

function remainingDateTime(value: string, now: Date) {
  if (!value) return "未设置";

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return value;

  const diffMinutes = Math.ceil((target.getTime() - now.getTime()) / 60000);
  const absMinutes = Math.abs(diffMinutes);
  const prefix = diffMinutes >= 0 ? "剩余" : "已超时";
  const days = Math.floor(absMinutes / 1440);
  const hours = Math.floor((absMinutes % 1440) / 60);
  const minutes = absMinutes % 60;

  if (days > 0) return `${prefix} ${days} 天 ${hours} 小时`;
  if (hours > 0) return `${prefix} ${hours} 小时 ${minutes} 分钟`;
  return `${prefix} ${minutes} 分钟`;
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
