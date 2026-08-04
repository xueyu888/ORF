import { useEffect, useMemo, useState } from "react";
import { getFeedbackAssignees } from "../../state/apiClient";
import type { OrfUser } from "../../types/orf";
import {
  feedbackAssigneeOptionsFromUsers,
  mergeFeedbackAssigneeOptions,
  type FeedbackAssigneeOption,
} from "./model/feedbackAssigneeOptions";

export function useFeedbackAssigneeOptions(users: readonly OrfUser[], currentUser: OrfUser | null): FeedbackAssigneeOption[] {
  const [remoteOptions, setRemoteOptions] = useState<FeedbackAssigneeOption[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setRemoteOptions([]);
      return;
    }

    let cancelled = false;
    getFeedbackAssignees()
      .then((response) => {
        if (!cancelled) setRemoteOptions(response.users);
      })
      .catch(() => {
        if (!cancelled) setRemoteOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const localOptions = useMemo(() => feedbackAssigneeOptionsFromUsers(users), [users]);
  const currentUserOption = useMemo(
    () => currentUser?.status === "active"
      ? [{ avatarUrl: currentUser.avatarUrl ?? null, id: currentUser.id, name: currentUser.name }]
      : [],
    [currentUser],
  );

  return useMemo(
    () => mergeFeedbackAssigneeOptions(remoteOptions, localOptions, currentUserOption),
    [currentUserOption, localOptions, remoteOptions],
  );
}
