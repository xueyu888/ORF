import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { canShowFrontend } from "../config/frontendVisibility";
import { canApplyForObjectiveChallenge } from "../domain/orfLifecycle";
import { BountyButton, BountyEmptyState } from "../features/bounty-hall/BountyHallSkin";
import { BountyHallTabs } from "../features/bounty-hall/components/BountyHallTabs";
import { BountyObjectiveList } from "../features/bounty-hall/components/BountyObjectiveList";
import { BountyOverview } from "../features/bounty-hall/components/BountyOverview";
import { BountyToolbar } from "../features/bounty-hall/components/BountyToolbar";
import { ChallengeConfirmModal } from "../features/bounty-hall/components/ChallengeConfirmModal";
import { useMinuteNow } from "../features/bounty-hall/hooks/useMinuteNow";
import {
  bountyTargetElement,
  buildHallItemBuckets,
  buildHallItems,
  compareByUrgency,
  compareHallItems,
  defaultHallTab,
  hallTabs,
  preferredHallTabForBountyItem,
  searchableBountyText,
} from "../features/bounty-hall/model/bountyHallItems";
import { bountyCycleLabel } from "../features/bounty-hall/model/bountyHallSummary";
import type { BountyItem, ChallengeConfirmTarget, DifficultyFilter, HallTab, SortKey } from "../features/bounty-hall/model/bountyHallTypes";
import { challengePathForTarget, parseChallengeTargetHash } from "../features/challenge/model/challengeLinks";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { getBountyHallData, type BountyHallData } from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";

export function BountyHallPage() {
  const {
    acceptBountyChallenge,
    applyForBounty,
    currentUser,
    readModelInvalidations,
  } = useOrf();
  const location = useLocation();
  const navigate = useNavigate();
  const bountyDataRequestRef = useRef(0);
  const [bountyData, setBountyData] = useState<BountyHallData | null>(null);
  const [loadingBounties, setLoadingBounties] = useState(true);
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [activeTab, setActiveTab] = useState<HallTab>(defaultHallTab);
  const [confirmTarget, setConfirmTarget] = useState<ChallengeConfirmTarget | null>(null);
  const [processingBountyId, setProcessingBountyId] = useState<string | null>(null);
  const now = useMinuteNow();
  const challengeActionsBlocked = currentUser?.role !== "member";
  const canOpenChallengeTarget = canShowFrontend(currentUser, "challenge.scope.all");
  const linkedBountyObjectiveId = useMemo(() => {
    const target = parseChallengeTargetHash(location.hash);
    return target?.type === "objective" ? target.id : null;
  }, [location.hash]);

  const loadBountyData = useCallback(async () => {
    const requestId = bountyDataRequestRef.current + 1;
    bountyDataRequestRef.current = requestId;
    setLoadingBounties(true);
    try {
      const nextBountyData = await getBountyHallData();
      if (bountyDataRequestRef.current === requestId) {
        setBountyData(nextBountyData);
      }
    } catch {
      if (bountyDataRequestRef.current === requestId) {
        setBountyData(null);
      }
    } finally {
      if (bountyDataRequestRef.current === requestId) {
        setLoadingBounties(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadBountyData();
  }, [loadBountyData]);

  const bountyInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "bountyHall"),
    [readModelInvalidations],
  );

  useEffect(() => {
    if (!bountyInvalidationKey) return;
    void loadBountyData();
  }, [bountyInvalidationKey, loadBountyData]);

  const recruitmentItems = useMemo(
    () => [...(bountyData?.recruitmentItems ?? [])].sort(compareByUrgency),
    [bountyData],
  );

  const currentUserId = currentUser?.id ?? "";
  const publicBounties = bountyData?.publicItems ?? [];
  const availableBounties = bountyData?.availableItems ?? [];
  const objectiveOptions = bountyData?.objectiveOptions ?? [];
  const hallItems = useMemo(
    () => buildHallItems({ availableBounties, publicBounties, recruitmentItems }),
    [availableBounties, publicBounties, recruitmentItems],
  );
  const pageObjectives = useMemo(() => {
    const objectives = hallItems.map((item) => item.objective);
    return objectives.length > 0 ? objectives : objectiveOptions;
  }, [hallItems, objectiveOptions]);
  const hallItemBuckets = useMemo(() => buildHallItemBuckets(hallItems, currentUserId), [currentUserId, hallItems]);
  const tabbedHallItems = hallItemBuckets[activeTab];
  const activeTabLabel = hallTabs.find((tab) => tab.key === activeTab)?.label ?? "全部";

  const filteredHallItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = tabbedHallItems.filter((item) => {
      const queryMatch = !normalizedQuery || searchableBountyText(item).includes(normalizedQuery);
      const difficultyMatch = difficultyFilter === "all" || item.results.some((result) => result.uncertaintyLevel === difficultyFilter);
      return queryMatch && difficultyMatch;
    });

    return [...filtered].sort((left, right) => compareHallItems(left, right, sortKey));
  }, [difficultyFilter, query, sortKey, tabbedHallItems]);

  const hasFilters = query.trim() || difficultyFilter !== "all";

  useEffect(() => {
    if (!linkedBountyObjectiveId) return;
    setQuery("");
    setDifficultyFilter("all");
  }, [linkedBountyObjectiveId]);

  useEffect(() => {
    if (!linkedBountyObjectiveId) return;
    const linkedItem = hallItems.find((item) => item.objective.id === linkedBountyObjectiveId);
    if (linkedItem) {
      setActiveTab(preferredHallTabForBountyItem(linkedItem, currentUserId));
    }
  }, [currentUserId, hallItems, linkedBountyObjectiveId]);

  useEffect(() => {
    if (!linkedBountyObjectiveId) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const element = bountyTargetElement(linkedBountyObjectiveId);
      if (!element) return;

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [filteredHallItems, linkedBountyObjectiveId]);

  const clearFilters = () => {
    setQuery("");
    setDifficultyFilter("all");
  };

  const applyChallenge = async (item: BountyItem, reason: string) => {
    if (item.isRecruitment) {
      await loadBountyData();
      setConfirmTarget(null);
      return;
    }
    if (!canApplyForObjectiveChallenge(item.objective)) {
      await loadBountyData();
      setConfirmTarget(null);
      return;
    }

    setProcessingBountyId(item.objective.id);
    const ok = await applyForBounty(item.objective.id, reason);
    setProcessingBountyId(null);
    if (ok) {
      setActiveTab("related");
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

  const openChallengeTarget = (objectiveId: string) => {
    navigate(challengePathForTarget({ id: objectiveId, type: "objective" }));
  };

  return (
    <div className="bounty-hall-page orf-workbench-surface grid gap-4">
      <BountyOverview
        publicCount={hallItems.length}
        cycle={bountyCycleLabel(pageObjectives)}
        challengerCount={hallItems.reduce((sum, item) => sum + item.challengers.length, 0)}
        openCount={hallItemBuckets.open.length}
        recruitmentCount={recruitmentItems.length}
      />

      <section className="grid gap-4" aria-label="悬赏目标列表">
        <div className="bounty-toolbar-panel">
          <BountyToolbar
            difficultyFilter={difficultyFilter}
            query={query}
            sortKey={sortKey}
            onDifficultyChange={setDifficultyFilter}
            onQueryChange={setQuery}
            onSortChange={setSortKey}
          />
        </div>

        <BountyHallTabs
          activeTab={activeTab}
          counts={{
            all: hallItemBuckets.all.length,
            open: hallItemBuckets.open.length,
            frozen: hallItemBuckets.frozen.length,
            submitted: hallItemBuckets.submitted.length,
            revisionRequired: hallItemBuckets.revisionRequired.length,
            accepted: hallItemBuckets.accepted.length,
            settled: hallItemBuckets.settled.length,
            related: hallItemBuckets.related.length,
          }}
          onChange={setActiveTab}
        />

        <div className="bounty-list-summary">
          <div className="bounty-list-count">
            悬赏目标 <span>{filteredHallItems.length}</span> 条
          </div>
          {hasFilters && (
            <BountyButton onClick={clearFilters} size="sm" variant="secondary">
              清空筛选
            </BountyButton>
          )}
        </div>

        {filteredHallItems.length > 0 ? (
          <BountyObjectiveList
            activeObjectiveId={linkedBountyObjectiveId}
            currentUserId={currentUserId}
            showDeclinedApplicationState={activeTab === "related"}
            items={filteredHallItems}
            now={now}
            onOpenChallengeWork={openChallengeTarget}
            onOpenObjective={canOpenChallengeTarget ? openChallengeTarget : undefined}
            processingBountyId={processingBountyId}
            onAction={(item, action) => setConfirmTarget({ action, blocked: challengeActionsBlocked, item })}
          />
        ) : (
          <BountyEmptyState
            title={loadingBounties ? "正在加载悬赏大厅" : hasFilters ? "没有符合条件的悬赏目标" : `${activeTabLabel}暂无悬赏目标`}
            description={loadingBounties ? "正在读取悬赏大厅专用接口。" : hasFilters ? "调整搜索或筛选条件后再查看。" : "公开悬赏的开放、冻结、验收和结算状态会在这里延续展示；与你有关的目标会进入我的相关。"}
          />
        )}
      </section>

      {confirmTarget && (
        <ChallengeConfirmModal
          item={confirmTarget}
          processing={processingBountyId === confirmTarget.item.objective.id}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={(reason) =>
            void (
              confirmTarget.action === "accept"
                ? acceptChallenge(confirmTarget.item)
                : applyChallenge(confirmTarget.item, reason ?? "")
            )
          }
        />
      )}
    </div>
  );
}
