export type RealtimeConnectionStatus = "disabled" | "connecting" | "connected" | "disconnected";

export type RealtimeConnectionState = {
  connectedAt: string | null;
  connectionEpoch: number;
  disconnectedAt: string | null;
  status: RealtimeConnectionStatus;
};

export type RealtimeConnectionAction =
  | { type: "connecting" }
  | { at?: string; type: "connected" }
  | { at?: string; type: "disconnected" }
  | { type: "disabled" };

export type ReconciliationStatus = "idle" | "reconciling" | "ready" | "retrying";

export type ReconciliationState = {
  attempt: number;
  error: string | null;
  reconciledEpoch: number;
  reconcilingEpoch: number;
  status: ReconciliationStatus;
};

export type ReconciliationRequest = {
  epoch: number;
  reason: "connection" | "focus" | "online" | "page-mounted" | "realtime-event" | "visibility";
};

export type ChatRealtimeRecoveryStatus =
  | RealtimeConnectionStatus
  | "reconciling"
  | "ready"
  | "retrying";

export type ChatRealtimeRecoveryState = {
  connected: boolean;
  connectionEpoch: number;
  error: string | null;
  reconciledEpoch: number;
  status: ChatRealtimeRecoveryStatus;
};

type ReconciliationTimer = ReturnType<typeof setTimeout>;

type ReconciliationCoordinatorOptions = {
  cancelSchedule?: (timer: ReconciliationTimer) => void;
  onStateChange: (state: ReconciliationState) => void;
  reconcile: (request: ReconciliationRequest) => Promise<void>;
  retryDelaysMs?: readonly number[];
  schedule?: (run: () => void, delayMs: number) => ReconciliationTimer;
};

export const initialRealtimeConnectionState: RealtimeConnectionState = {
  connectedAt: null,
  connectionEpoch: 0,
  disconnectedAt: null,
  status: "disabled",
};

export const initialReconciliationState: ReconciliationState = {
  attempt: 0,
  error: null,
  reconciledEpoch: 0,
  reconcilingEpoch: 0,
  status: "idle",
};

export function reduceRealtimeConnectionState(
  state: RealtimeConnectionState,
  action: RealtimeConnectionAction,
): RealtimeConnectionState {
  if (action.type === "disabled") {
    return { ...state, status: "disabled" };
  }
  if (action.type === "connecting") {
    return { ...state, status: "connecting" };
  }
  if (action.type === "disconnected") {
    return {
      ...state,
      disconnectedAt: action.at ?? new Date().toISOString(),
      status: "disconnected",
    };
  }
  return {
    ...state,
    connectedAt: action.at ?? new Date().toISOString(),
    connectionEpoch: state.connectionEpoch + 1,
    status: "connected",
  };
}

export function buildChatRealtimeRecoveryState(
  connection: RealtimeConnectionState,
  reconciliation: ReconciliationState,
): ChatRealtimeRecoveryState {
  if (connection.status !== "connected") {
    return {
      connected: false,
      connectionEpoch: connection.connectionEpoch,
      error: reconciliation.error,
      reconciledEpoch: reconciliation.reconciledEpoch,
      status: connection.status,
    };
  }
  return {
    connected: true,
    connectionEpoch: connection.connectionEpoch,
    error: reconciliation.error,
    reconciledEpoch: reconciliation.reconciledEpoch,
    status: reconciliation.status === "idle" ? "connected" : reconciliation.status,
  };
}

export function createReconciliationCoordinator(options: ReconciliationCoordinatorOptions) {
  const retryDelaysMs = options.retryDelaysMs ?? [1_000, 2_000, 5_000, 10_000, 30_000];
  const schedule = options.schedule ?? ((run, delayMs) => setTimeout(run, delayMs));
  const cancelSchedule = options.cancelSchedule ?? ((timer) => clearTimeout(timer));
  let disposed = false;
  let pending: ReconciliationRequest | null = null;
  let retryTimer: ReconciliationTimer | null = null;
  let running = false;
  let retryAttempt = 0;
  let state = initialReconciliationState;

  const updateState = (next: ReconciliationState) => {
    state = next;
    if (!disposed) options.onStateChange(next);
  };

  const runPending = async () => {
    if (disposed || running || !pending) return;
    const request = pending;
    pending = null;
    running = true;
    updateState({
      ...state,
      attempt: retryAttempt + 1,
      error: null,
      reconcilingEpoch: request.epoch,
      status: "reconciling",
    });
    try {
      await options.reconcile(request);
      retryAttempt = 0;
      updateState({
        attempt: 0,
        error: null,
        reconciledEpoch: Math.max(state.reconciledEpoch, request.epoch),
        reconcilingEpoch: request.epoch,
        status: "ready",
      });
    } catch (error) {
      retryAttempt += 1;
      const errorText = error instanceof Error ? error.message : String(error);
      updateState({
        ...state,
        attempt: retryAttempt,
        error: errorText,
        reconcilingEpoch: request.epoch,
        status: "retrying",
      });
      if (!pending) pending = request;
    } finally {
      running = false;
    }

    if (disposed) return;
    if (state.status === "retrying" && pending) {
      const delayIndex = Math.min(Math.max(0, retryAttempt - 1), retryDelaysMs.length - 1);
      const delayMs = retryDelaysMs[delayIndex] ?? 30_000;
      retryTimer = schedule(() => {
        retryTimer = null;
        void runPending();
      }, delayMs);
      return;
    }
    if (pending) void runPending();
  };

  return {
    dispose() {
      disposed = true;
      pending = null;
      if (retryTimer) cancelSchedule(retryTimer);
      retryTimer = null;
    },
    request(request: ReconciliationRequest) {
      if (disposed || request.epoch <= 0) return;
      if (!pending || request.epoch >= pending.epoch) pending = request;
      if (retryTimer) {
        cancelSchedule(retryTimer);
        retryTimer = null;
      }
      if (!running) void runPending();
    },
    snapshot() {
      return state;
    },
  };
}
