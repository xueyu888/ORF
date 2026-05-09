import { clsx } from "clsx";
import {
  ArrowUpDown,
  Check,
  Clock,
  ExternalLink,
  Flag,
  Link2,
  ListChecks,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Search,
  ShieldAlert,
  Star,
  Target,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CommentPanel, type CommentReplyInput } from "../features/challenge/comments/CommentPanel";
import { bountyDeadline, remainingTime } from "../features/challenge/model/challengeDates";
import { commentCountFor, commentCountsByTarget, submittedLootIdsFromComments } from "../features/challenge/model/challengeComments";
import { bountyStatus } from "../features/challenge/model/challengeStatus";
import { useOrf } from "../state/OrfProvider";
import type { Objective, OrfState, Result, Task, UncertaintyLevel } from "../types/orf";
import { metricValue, resultProgress } from "../utils/format";
import { Button, EmptyState, IconButton, ProgressBar } from "../components/ui";

type BountyKind = "mainline" | "side";
type DifficultyFilter = "all" | UncertaintyLevel;
type KindFilter = "all" | BountyKind;
type SortKey = "deadline" | "points" | "difficulty" | "created";

type BountyItem = {
  actions: Task[];
  uncertaintyPoints: number;
  definitionPoints: number;
  deadline: string;
  difficultyRank: number;
  isRecruitment: boolean;
  kind: BountyKind;
  objective: Objective;
  result: Result;
};

type CommentTarget = {
  id: string;
  title: string;
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
    addComment,
    claimBounty,
    currentUser,
    deleteCommentMessage,
    isAdmin,
    notify,
    openModal,
    state,
    updateCommentMessage,
  } = useOrf();
  const navigate = useNavigate();
  const currentMember = currentUser?.name ?? state.users.find((user) => user.id === state.currentUserId)?.name ?? "User";
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [preview, setPreview] = useState<BountyItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<BountyItem | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [processingBountyId, setProcessingBountyId] = useState<string | null>(null);
  const now = useMinuteNow();

  const submittedLootIds = useMemo(() => submittedLootIdsFromComments(state.comments), [state.comments]);
  const commentCounts = useMemo(() => commentCountsByTarget(state.comments), [state.comments]);
  const allBounties = useMemo(
    () =>
      state.results.flatMap((result) => {
        const objective = state.objectives.find((item) => item.id === result.objectiveId);
        if (!objective) return [];

        const actions = state.tasks.filter((task) => task.linkedResultId === result.id);
        const effectiveResult = isUnclaimedOwner(result.owner) ? { ...result, owner: "" } : result;
        const status = bountyStatus(effectiveResult, actions, state.automaticCompletions?.[objective.id]?.rets?.[result.id], submittedLootIds.has(result.id));
        if (status !== "open") return [];

        const kind: BountyKind = objective.resultIds[0] === result.id ? "mainline" : "side";
        return [
          {
            actions,
            uncertaintyPoints: uncertaintyPoints(result),
            definitionPoints: definitionPoints(),
            deadline: bountyDeadline(actions),
            difficultyRank: difficultyRank(result),
            isRecruitment: kind === "mainline" && objective.owner === currentMember,
            kind,
            objective,
            result,
          },
        ];
      }),
    [currentMember, state.automaticCompletions, state.objectives, state.results, state.tasks, submittedLootIds],
  );

  const recruitmentItems = useMemo(
    () => allBounties.filter((item) => item.isRecruitment).sort(compareByUrgency),
    [allBounties],
  );

  const objectiveOptions = useMemo(() => {
    const ids = new Set(allBounties.map((item) => item.objective.id));
    return state.objectives.filter((objective) => ids.has(objective.id));
  }, [allBounties, state.objectives]);

  const filteredBounties = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = allBounties.filter((item) => {
      const queryMatch =
        !normalizedQuery ||
        `${item.result.title} ${item.result.metricName} ${item.result.description} ${item.objective.title}`.toLowerCase().includes(normalizedQuery);
      const kindMatch = kindFilter === "all" || item.kind === kindFilter;
      const difficultyMatch = difficultyFilter === "all" || item.result.uncertaintyLevel === difficultyFilter;
      const objectiveMatch = objectiveFilter === "all" || item.objective.id === objectiveFilter;
      return queryMatch && kindMatch && difficultyMatch && objectiveMatch;
    });

    return [...filtered].sort((left, right) => compareBounties(left, right, sortKey));
  }, [allBounties, difficultyFilter, kindFilter, objectiveFilter, query, sortKey]);

  const contribution = useMemo(() => contributionSummary(state, currentMember, submittedLootIds), [currentMember, state, submittedLootIds]);
  const hasFilters = query.trim() || kindFilter !== "all" || difficultyFilter !== "all" || objectiveFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setKindFilter("all");
    setDifficultyFilter("all");
    setObjectiveFilter("all");
  };

  const openComments = (item: BountyItem) => setCommentTarget({ id: item.result.id, title: item.result.title });

  const copyBountyLink = (item: BountyItem) => {
    const url = `${window.location.origin}/objectives/${item.objective.id}/results/${item.result.id}`;
    const write = navigator.clipboard?.writeText(url);
    if (!write) {
      notify("当前浏览器不支持复制链接");
      return;
    }

    void write.then(() => notify("链接已复制")).catch(() => notify("复制链接失败"));
  };

  const acceptChallenge = async (item: BountyItem) => {
    setProcessingBountyId(item.result.id);
    const ok = await claimBounty(item.result.id);
    setProcessingBountyId(null);
    if (ok) {
      setConfirmTarget(null);
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
          {isAdmin && (
            <>
              <Button variant="secondary" onClick={() => openModal({ type: "newResult" })}>
                <Target className="h-4 w-4" />
                新建悬赏
              </Button>
              <Button onClick={() => openModal({ type: "newObjective" })}>
                <Flag className="h-4 w-4" />
                新建目标
              </Button>
            </>
          )}
        </div>
      </header>

      <ContributionSummary
        availableCount={allBounties.length}
        points={contribution.points}
        rankText={contribution.rankText}
        settledCount={contribution.settledCount}
      />

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
                onAccept={() => setConfirmTarget(item)}
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4" aria-label="可挑战悬赏">
        <Toolbar
          difficultyFilter={difficultyFilter}
          hasFilters={Boolean(hasFilters)}
          kindFilter={kindFilter}
          objectiveFilter={objectiveFilter}
          objectiveOptions={objectiveOptions}
          query={query}
          sortKey={sortKey}
          onClear={clearFilters}
          onDifficultyChange={setDifficultyFilter}
          onKindChange={setKindFilter}
          onObjectiveChange={setObjectiveFilter}
          onQueryChange={setQuery}
          onSortChange={setSortKey}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="orf-text-secondary text-sm">
            当前可挑战 <span className="orf-text-primary font-semibold">{filteredBounties.length}</span> 条
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
                commentCount={commentCountFor(commentCounts, "result", item.result.id)}
                item={item}
                now={now}
                processing={processingBountyId === item.result.id}
                onAccept={() => setConfirmTarget(item)}
                onComment={() => openComments(item)}
                onCopy={() => copyBountyLink(item)}
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={hasFilters ? "没有符合条件的可挑战悬赏" : "当前没有可主动挑战的悬赏"}
            description={hasFilters ? "调整搜索或筛选条件后再查看。" : "新的未分配悬赏发布后会出现在这里；已接受的挑战请到挑战页处理。"}
          />
        )}
      </section>

      {preview && (
        <BountyPreviewDrawer
          commentCount={commentCountFor(commentCounts, "result", preview.result.id)}
          item={preview}
          now={now}
          processing={processingBountyId === preview.result.id}
          onAccept={() => setConfirmTarget(preview)}
          onClose={() => setPreview(null)}
          onComment={() => openComments(preview)}
        />
      )}

      {confirmTarget && (
        <ChallengeConfirmModal
          item={confirmTarget}
          processing={processingBountyId === confirmTarget.result.id}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => void acceptChallenge(confirmTarget)}
        />
      )}

      {commentTarget && (
        <CommentPanel
          canManageAllComments={isAdmin}
          currentMember={currentMember}
          targetTitle={commentTarget.title}
          threads={state.comments.filter((thread) => thread.targetType === "result" && thread.targetId === commentTarget.id)}
          onAddComment={(body, replyInput?: CommentReplyInput) =>
            addComment({
              targetType: "result",
              targetId: commentTarget.id,
              targetTitle: commentTarget.title,
              body,
              author: currentMember,
              parentMessageId: replyInput?.parentMessageId,
              replyToMessageId: replyInput?.replyToMessageId,
              replyToAuthor: replyInput?.replyToAuthor,
            })
          }
          onClose={() => setCommentTarget(null)}
          onDeleteComment={deleteCommentMessage}
          onUpdateComment={updateCommentMessage}
        />
      )}
    </div>
  );
}

function ContributionSummary({
  availableCount,
  points,
  rankText,
  settledCount,
}: {
  availableCount: number;
  points: number;
  rankText: string;
  settledCount: number;
}) {
  return (
    <section className="orf-card orf-card-padding grid gap-4 md:grid-cols-[1.1fr_1fr_1fr_auto] md:items-center" aria-label="我的贡献概览">
      <SummaryMetric icon={Trophy} label="我的积分" value={formatPoints(points)} />
      <SummaryMetric icon={Star} label="贡献排名" value={rankText} />
      <SummaryMetric icon={Check} label="已结算悬赏" value={`${settledCount}`} />
      <Link className="orf-control orf-secondary-action inline-flex items-center justify-center gap-2 border px-3 py-2 text-sm font-medium" to="/reports">
        查看积分明细
        <ExternalLink className="h-4 w-4" />
      </Link>
      <div className="orf-text-muted md:col-span-4 text-xs">当前大厅有 {availableCount} 条可主动挑战悬赏；执行状态统一在挑战页处理。</div>
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
  kindFilter,
  objectiveFilter,
  objectiveOptions,
  query,
  sortKey,
  onClear,
  onDifficultyChange,
  onKindChange,
  onObjectiveChange,
  onQueryChange,
  onSortChange,
}: {
  difficultyFilter: DifficultyFilter;
  hasFilters: boolean;
  kindFilter: KindFilter;
  objectiveFilter: string;
  objectiveOptions: Objective[];
  query: string;
  sortKey: SortKey;
  onClear: () => void;
  onDifficultyChange: (value: DifficultyFilter) => void;
  onKindChange: (value: KindFilter) => void;
  onObjectiveChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
}) {
  return (
    <div className="orf-card orf-card-padding grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
      <label className="relative block min-w-0">
        <span className="sr-only">搜索悬赏</span>
        <Search className="orf-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          className="orf-input h-11 pl-9 pr-3"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索悬赏标题、目标或指标..."
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
        <SelectControl label="类型" value={kindFilter} onChange={(value) => onKindChange(value as KindFilter)}>
          <option value="all">全部类型</option>
          <option value="mainline">主线悬赏</option>
          <option value="side">支线悬赏</option>
        </SelectControl>
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
          <Chip tone="warning">主线悬赏</Chip>
          <Chip>{difficultyLabel(item.result)}</Chip>
          <Chip>{item.uncertaintyPoints} 分</Chip>
        </div>
        <h3 className="orf-text-primary mt-3 line-clamp-2 text-base font-semibold">{item.result.title}</h3>
        <div className="orf-text-secondary mt-2 truncate text-sm">{item.objective.title}</div>
        <div className="orf-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>征召原因：主线悬赏尚未确认挑战者</span>
          <span>{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</span>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onPreview}>
          查看详情
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
  commentCount,
  item,
  now,
  processing,
  onAccept,
  onComment,
  onCopy,
  onPreview,
}: {
  commentCount: number;
  item: BountyItem;
  now: Date;
  processing: boolean;
  onAccept: () => void;
  onComment: () => void;
  onCopy: () => void;
  onPreview: () => void;
}) {
  const progress = resultProgress(item.result);
  const validationSummary = item.result.completionStandard || item.result.metricRequirement || item.result.description;

  return (
    <article className="orf-card orf-card-hover group grid min-h-[292px] grid-rows-[1fr_auto] overflow-visible">
      <button className="grid min-w-0 gap-3 p-4 text-left" onClick={onPreview}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <Chip tone={item.kind === "mainline" ? "accent" : "neutral"}>{item.kind === "mainline" ? "主线" : "支线"}</Chip>
            <Chip>{difficultyLabel(item.result)}</Chip>
            <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
          </div>
          <div className="opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <MoreHorizontal className="orf-text-muted h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="orf-text-primary line-clamp-2 min-h-[48px] text-base font-semibold leading-6">{item.result.title}</h3>
          <div className="orf-text-secondary mt-2 truncate text-sm">{item.objective.title}</div>
        </div>

        <div className="grid gap-2">
          <div className="orf-text-secondary flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.deadline ? remainingTime(item.deadline, now) : "未设置截止时间"}</span>
            </span>
            <span className="orf-text-muted shrink-0">{progress}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>

        <div className="orf-surface-muted rounded-md border orf-border p-3">
          <div className="orf-text-muted text-xs font-semibold">指标快照</div>
          <div className="orf-text-primary mt-1 truncate text-sm">
            当前 {metricValue(item.result.current, item.result.unit, item.result.direction)} / 目标{" "}
            {metricValue(item.result.target, item.result.unit, item.result.direction)}
          </div>
        </div>

        <div className="orf-text-muted min-h-[20px] truncate text-xs opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100" title={validationSummary}>
          验收：{validationSummary}
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 border-t orf-border px-4 py-3">
        <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <IconButton icon={ListChecks} label={`行动项 ${item.actions.length}`} onClick={onPreview} />
          <IconButton icon={MessageSquare} label={`评论 ${commentCount}`} onClick={onComment} />
          <IconButton icon={Link2} label="复制链接" onClick={onCopy} />
          <Link
            className="orf-control orf-ghost-action inline-flex h-9 w-9 items-center justify-center"
            title="打开详情"
            aria-label="打开详情"
            to={`/objectives/${item.objective.id}/results/${item.result.id}`}
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
        <Button className="ml-auto" onClick={onAccept} disabled={processing}>
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
          我要挑战
        </Button>
      </div>
    </article>
  );
}

function BountyPreviewDrawer({
  commentCount,
  item,
  now,
  processing,
  onAccept,
  onClose,
  onComment,
}: {
  commentCount: number;
  item: BountyItem;
  now: Date;
  processing: boolean;
  onAccept: () => void;
  onClose: () => void;
  onComment: () => void;
}) {
  const navigate = useNavigate();
  useEscape(onClose);
  const progress = resultProgress(item.result);

  return (
    <div className="fixed inset-0 z-40 bg-black/35" onMouseDown={onClose}>
      <aside
        className="orf-card fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[520px] flex-col rounded-none"
        aria-label="悬赏预览"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b orf-border p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone={item.kind === "mainline" ? "accent" : "neutral"}>{item.kind === "mainline" ? "主线悬赏" : "支线悬赏"}</Chip>
              <Chip>{difficultyLabel(item.result)}</Chip>
              <Chip tone="gold">{item.uncertaintyPoints} 不确定性分</Chip>
            </div>
            <h2 className="orf-text-primary mt-3 text-xl font-semibold leading-7">{item.result.title}</h2>
            <div className="orf-text-secondary mt-2 text-sm">{item.objective.title}</div>
          </div>
          <IconButton icon={X} label="关闭预览" onClick={onClose} />
        </div>

        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5">
          <section className="grid gap-3">
            <SectionTitle icon={Target}>悬赏口径</SectionTitle>
            <InfoRow label="衡量要求" value={item.result.metricRequirement ?? item.result.description} />
            <InfoRow label="统计对象" value={item.result.statisticalObject ?? "未填写"} />
            <InfoRow label="完成标准" value={item.result.completionStandard ?? "未填写"} />
            <InfoRow label="样本集" value={item.result.sampleSet ?? "未填写"} />
            <InfoRow label="统计范围" value={item.result.measurementScope ?? "未填写"} />
          </section>

          <section className="grid gap-3">
            <SectionTitle icon={Trophy}>积分口径</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricBox label="难度" value={difficultyLabel(item.result)} />
              <MetricBox label="不确定性分" value={`${item.uncertaintyPoints}`} />
              <MetricBox label="指标定义分" value={`${item.definitionPoints}`} />
              <MetricBox label="剩余时间" value={item.deadline ? remainingTime(item.deadline, now) : "未设置"} />
              <MetricBox label="评论" value={`${commentCount}`} />
            </div>
          </section>

          <section className="grid gap-3">
            <SectionTitle icon={ArrowUpDown}>指标快照</SectionTitle>
            <div className="grid gap-2">
              <div className="orf-text-secondary flex justify-between gap-3 text-sm">
                <span>
                  当前 {metricValue(item.result.current, item.result.unit, item.result.direction)} / 目标{" "}
                  {metricValue(item.result.target, item.result.unit, item.result.direction)}
                </span>
                <span>{progress}%</span>
              </div>
              <ProgressBar value={progress} />
            </div>
          </section>

          <section className="grid gap-3">
            <SectionTitle icon={ListChecks}>行动项摘要</SectionTitle>
            {item.actions.length > 0 ? (
              <div className="grid gap-2">
                {item.actions.slice(0, 5).map((action) => (
                  <div key={action.id} className="orf-surface-muted flex min-w-0 items-center justify-between gap-3 rounded-md border orf-border p-3 text-sm">
                    <span className="orf-text-primary truncate">{action.title}</span>
                    <span className="orf-text-muted shrink-0">{action.dueDate}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="orf-text-muted rounded-md border orf-border p-3 text-sm">这个悬赏暂时没有行动项。</div>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t orf-border p-5">
          <Button variant="secondary" onClick={onComment}>
            <MessageSquare className="h-4 w-4" />
            评论
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate(`/objectives/${item.objective.id}/results/${item.result.id}`)}>
              <ExternalLink className="h-4 w-4" />
              详情
            </Button>
            <Button onClick={onAccept} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              我要挑战
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
  item: BountyItem;
  processing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscape(onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[14vh]" onMouseDown={onCancel}>
      <div className="orf-card w-full max-w-lg" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b orf-border p-5">
          <div>
            <div className="orf-text-muted text-sm font-semibold">确认挑战</div>
            <h2 className="orf-text-primary mt-1 text-lg font-semibold">接受后会进入你的挑战页</h2>
          </div>
          <IconButton icon={X} label="关闭" onClick={onCancel} />
        </div>
        <div className="grid gap-4 p-5">
          <div className="orf-surface-muted rounded-md border orf-border p-4">
            <div className="orf-text-primary line-clamp-2 text-base font-semibold">{item.result.title}</div>
            <div className="orf-text-secondary mt-2 truncate text-sm">{item.objective.title}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip tone={item.kind === "mainline" ? "accent" : "neutral"}>{item.kind === "mainline" ? "主线" : "支线"}</Chip>
              <Chip>{difficultyLabel(item.result)}</Chip>
              <Chip tone="gold">{item.uncertaintyPoints} 分</Chip>
            </div>
          </div>
          <p className="orf-text-secondary text-sm">大厅只记录你接受挑战；执行行动项、提交战利品和验收结算都在挑战页处理。</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={processing}>
              取消
            </Button>
            <Button onClick={onConfirm} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              接受挑战
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

function contributionSummary(state: OrfState, currentMember: string, submittedLootIds: Set<string>) {
  const members = new Map<string, { name: string; points: number; settledCount: number }>();
  for (const user of state.users) {
    members.set(user.name, { name: user.name, points: 0, settledCount: 0 });
  }

  for (const result of state.results) {
    if (!result.owner || isUnclaimedOwner(result.owner)) continue;
    const objective = state.objectives.find((item) => item.id === result.objectiveId);
    const actions = state.tasks.filter((task) => task.linkedResultId === result.id);
    const status = bountyStatus(result, actions, objective ? state.automaticCompletions?.[objective.id]?.rets?.[result.id] : undefined, submittedLootIds.has(result.id));
    const row = members.get(result.owner) ?? { name: result.owner, points: 0, settledCount: 0 };
    if (status === "settled") {
      row.points += uncertaintyPoints(result);
      row.settledCount += 1;
    }
    members.set(result.owner, row);
  }

  const ranking = Array.from(members.values()).sort((left, right) => right.points - left.points || left.name.localeCompare(right.name));
  const current = members.get(currentMember) ?? { name: currentMember, points: 0, settledCount: 0 };
  const rankIndex = ranking.findIndex((item) => item.name === currentMember);
  const rankText = current.points > 0 && rankIndex >= 0 ? `${rankIndex + 1} / ${ranking.length}` : "暂无";

  return { points: current.points, rankText, settledCount: current.settledCount };
}

function uncertaintyPoints(result: Result) {
  return result.uncertaintyLevel ? difficultyScores[result.uncertaintyLevel] : difficultyScores["进阶"];
}

function definitionPoints() {
  return 2;
}

function difficultyRank(result: Result) {
  return result.uncertaintyLevel ? difficultyRanks[result.uncertaintyLevel] : difficultyRanks["进阶"];
}

function difficultyLabel(result: Result) {
  return result.uncertaintyLevel ?? "进阶";
}

function isUnclaimedOwner(owner: string) {
  const value = owner.trim();
  return value === "" || value === "User" || value === "未分配";
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
