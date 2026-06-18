import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyChallengesData, type TaskManagementData } from "../../../state/apiClient";
import type { OrfState } from "../../../types/orf";
import type { OrfReadModelInvalidation } from "../../../types/realtime";
import { readModelInvalidationKey } from "../../realtime/readModelInvalidations";

export type ChallengeReadModelState = OrfState;

export function useChallengeReadModelData(input: {
  readModelInvalidations: OrfReadModelInvalidation[];
  showAll: boolean;
  state: OrfState;
}): ChallengeReadModelState {
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
    state.projects,
    state.results,
    state.tasks,
    taskManagementInvalidationKey,
  ]);

  return useMemo<ChallengeReadModelState>(() => {
    if (!challengeData) return state;
    const { pendingChallengeApplications: _pendingChallengeApplications, ...taskManagementData } = challengeData;

    return {
      ...state,
      ...taskManagementData,
    };
  }, [challengeData, state]);
}
