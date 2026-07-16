import { useCallback, useEffect, useRef, useState } from "react";
import {
  createReconciliationCoordinator,
  initialReconciliationState,
  type ReconciliationRequest,
  type ReconciliationState,
} from "./realtimeRecoveryModel";

type UseRealtimeReconciliationInput = {
  connectionEpoch: number;
  connected: boolean;
  enabled: boolean;
  reconcile: (request: ReconciliationRequest) => Promise<void>;
};

export function useRealtimeReconciliation({
  connectionEpoch,
  connected,
  enabled,
  reconcile,
}: UseRealtimeReconciliationInput) {
  const [state, setState] = useState<ReconciliationState>(initialReconciliationState);
  const reconcileRef = useRef(reconcile);
  const coordinatorRef = useRef<ReturnType<typeof createReconciliationCoordinator> | null>(null);

  useEffect(() => {
    reconcileRef.current = reconcile;
  }, [reconcile]);

  useEffect(() => {
    if (!enabled) {
      setState(initialReconciliationState);
      return undefined;
    }
    const coordinator = createReconciliationCoordinator({
      onStateChange: setState,
      reconcile: (request) => reconcileRef.current(request),
    });
    coordinatorRef.current = coordinator;
    return () => {
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
    };
  }, [enabled]);

  const request = useCallback((reason: ReconciliationRequest["reason"]) => {
    if (!enabled || connectionEpoch <= 0) return;
    coordinatorRef.current?.request({ epoch: connectionEpoch, reason });
  }, [connectionEpoch, enabled]);

  useEffect(() => {
    if (!enabled || !connected || connectionEpoch <= 0) return;
    coordinatorRef.current?.request({ epoch: connectionEpoch, reason: "connection" });
  }, [connected, connectionEpoch, enabled]);

  return { request, state };
}
