import { useEffect, useRef, useState } from "react";
import {
  createReconciliationCoordinator,
  initialReconciliationState,
  type ReconciliationState,
} from "../features/realtime/realtimeRecoveryModel";

type AdminUsersSynchronizationInput = {
  userId: string | null;
  connectionEpoch: number;
  invalidationKey: string;
  membersPageVisible: boolean;
  refresh: () => Promise<void>;
};

/** One retrying refresh queue owns the administrator's member-list snapshot. */
export function useAdminUsersSynchronization(input: AdminUsersSynchronizationInput) {
  const [state, setState] = useState<ReconciliationState>(initialReconciliationState);
  const refreshRef = useRef(input.refresh);
  const coordinatorRef = useRef<ReturnType<typeof createReconciliationCoordinator> | null>(null);
  useEffect(() => { refreshRef.current = input.refresh; }, [input.refresh]);

  useEffect(() => {
    setState(initialReconciliationState);
    if (!input.userId) return;
    const coordinator = createReconciliationCoordinator({
      onStateChange: setState,
      reconcile: () => refreshRef.current(),
    });
    coordinatorRef.current = coordinator;
    coordinator.request({ epoch: 1, reason: "page-mounted" });
    return () => {
      coordinator.dispose();
      coordinatorRef.current = null;
    };
  }, [input.userId]);

  useEffect(() => {
    if (input.connectionEpoch > 0) {
      coordinatorRef.current?.request({ epoch: input.connectionEpoch + 1, reason: "connection" });
    }
  }, [input.connectionEpoch, input.userId]);

  useEffect(() => {
    if (input.invalidationKey) {
      coordinatorRef.current?.request({ epoch: input.connectionEpoch + 1, reason: "realtime-event" });
    }
  }, [input.invalidationKey, input.userId]);

  useEffect(() => {
    if (!input.userId || !input.membersPageVisible) return;
    const request = (reason: "page-mounted" | "focus" | "visibility" | "online") =>
      coordinatorRef.current?.request({ epoch: input.connectionEpoch + 1, reason });
    request("page-mounted");
    const onFocus = () => request("focus");
    const onOnline = () => request("online");
    const onVisibility = () => {
      if (document.visibilityState === "visible") request("visibility");
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [input.connectionEpoch, input.membersPageVisible, input.userId]);

  return state;
}
