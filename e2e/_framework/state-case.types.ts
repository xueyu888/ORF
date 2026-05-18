export type StateCase<TContext, TSetupState, TActionResult> = {
  id: string;
  title: string;

  B: (ctx: TContext) => Promise<void>;

  setup: (ctx: TContext) => Promise<TSetupState>;

  S0: (ctx: TContext, setupState: TSetupState) => Promise<void>;

  action: (ctx: TContext, setupState: TSetupState) => Promise<TActionResult>;

  S1: (
    ctx: TContext,
    setupState: TSetupState,
    actionResult: TActionResult,
  ) => Promise<void>;

  clean: (ctx: TContext, setupState: TSetupState) => Promise<void>;
};
