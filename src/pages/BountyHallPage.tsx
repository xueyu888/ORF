import {
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Send,
  ShieldAlert,
  Star,
  Target,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { remainingTime } from "../features/challenge/model/challengeDates";
import { submittedLootIdsFromComments } from "../features/challenge/model/challengeComments";
import { bountyStatus } from "../features/challenge/model/challengeStatus";
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

  const declinePriority = async (item: BountyItem) => {
    setProcessingBountyId(item.result.id);
    const ok = await declinePriorityChallenge(item.result.id);
    setProcessingBountyId(null);
    if (ok) {
      setPreview((current) => (current?.result.id === item.result.id ? null : current));
    }
  };

  return (
    <div className="bounty-hall-page grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="bounty-page-eyebrow">当前周期 · {currentCycle(state.objectives)}</div>
          <h1 className="bounty-page-title">悬赏大厅</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <ContributionSummary points={contribution.points} />

      {recruitmentItems.length > 0 && (
        <section className="grid gap-3" aria-labelledby="recruitment-title">
          <div className="bounty-section-heading">
            <ShieldAlert className="h-5 w-5" />
            <h2 id="recruitment-title">征召令</h2>
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
          <div className="bounty-section-heading">
            <Star className="h-5 w-5" />
            <h2 id="priority-title">优先挑战</h2>
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
    <BountyPanel title="我的贡献" count="积分">
      <div className="bounty-contribution">
        <SummaryMetric icon={Trophy} label="我的积分" value={formatPoints(points)} />
        <BountyLinkButton to="/reports">
          查看积分明细
          <ExternalLink className="h-4 w-4" />
        </BountyLinkButton>
      </div>
    </BountyPanel>
  );
}

function SummaryMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="bounty-emblem shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="bounty-contribution-value">{value}</div>
        <div className="bounty-contribution-label">{label}</div>
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
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{difficultyLabel(item.result)}</Chip>
            <Chip>{item.uncertaintyPoints} 分</Chip>
          </div>
          <h3 className="mt-3 line-clamp-2">{item.result.title}</h3>
          <p className="mt-2 truncate text-sm">{item.objective.title}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <small>{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</small>
          </div>
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
    <BountyCardSurface priority>
      <button className="bounty-card-click" onClick={onPreview}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{difficultyLabel(item.result)}</Chip>
            <Chip>{item.uncertaintyPoints} 分</Chip>
          </div>
          <h3 className="mt-3 line-clamp-2">{item.result.title}</h3>
          <p className="mt-2 truncate text-sm">{item.objective.title}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <small>提出人：{item.definer || "未记录"}</small>
            <small>{remainingDateTime(item.priorityExpiresAt, now)}</small>
          </div>
        </div>
      </button>
      <div className="bounty-card-footer">
        <BountyButton variant="secondary" onClick={onDecline} disabled={processing}>
          放弃
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
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <Chip>{difficultyLabel(item.result)}</Chip>
            <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
          </div>

          <h3 className="mt-3 line-clamp-2">{item.result.title}</h3>
          <p className="mt-2 truncate text-sm">{item.objective.title}</p>
          {item.source === "memberProposed" && item.definer && <small className="mt-2 block truncate font-semibold">提出人：{item.definer}</small>}

          <div className="mt-4 inline-flex min-w-0 items-center gap-1.5 text-sm">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</span>
          </div>
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
    <BountyDialog
      onClose={onClose}
      subtitle={item.objective.title}
      title={item.result.title}
      footer={
        <>
          {onDeclinePriority && (
            <BountyButton variant="secondary" onClick={onDeclinePriority}>
              放弃
            </BountyButton>
          )}
          <BountyButton onClick={onAction} disabled={processing}>
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : action === "accept" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {actionLabel}
          </BountyButton>
        </>
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
          <h3 className="line-clamp-2">{item.item.result.title}</h3>
          <p className="mt-2 truncate text-sm">{item.item.objective.title}</p>
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
