import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyChallengesData, type TaskManagementData } from "../../../state/apiClient";
import type { OrfState } from "../../../types/orf";
import type { OrfReadModelInvalidation } from "../../../types/realtime";
import { readModelInvalidationKey } from "../../realtime/readModelInvalidations";

export function useChallengeReadModelData(input: {
  readModelInvalidations: OrfReadModelInvalidation[];
  showAll: boolean;
  state: OrfState;
}) {
  const { readModelInvalidations, showAll, state } = input;
  const [challengeData, setChallengeData] = useState<TaskManagementData | null>(null);
  const loadChallengeData = useCallback(async () => {
    setChallengeData(await getMyChallengesData(showAll ? "all" : "mine"));
  }, [showAll]);
  const taskManagementInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "taskManagement"),
    [readModelInvalidations],
  );

  useEffect(() => {
    void loadChallengeData().catch(() => setChallengeData(null));
  }, [
    loadChallengeData,
    state.comments,
    state.objectiveAlignmentRequests,
    state.objectiveTrialReviews,
    state.objectives,
    state.results,
    state.tasks,
    taskManagementInvalidationKey,
  ]);

  return useMemo<OrfState>(() => {
    const sourceData = challengeData ?? state;
    return { ...state, ...sourceData };
  }, [challengeData, state]);
}
