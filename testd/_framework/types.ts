export const STATE_CASE_MODEL = "B -> Setup -> S0 -> Action -> S1 -> Clean -> B" as const;

export type StateCaseModel = typeof STATE_CASE_MODEL;

export type StateCaseStageName = "B" | "Setup" | "S0" | "Action" | "S1" | "Clean";

export type StateCaseRunStageName = StateCaseStageName | "B after Clean";

export type StepParams = Record<string, unknown>;

export type StepExecutionMethod = "playwright" | "api" | "prisma" | "mock";

export type StepSource = {
  caseStepId: string;
  method: StepExecutionMethod;
};

export type StepSpec<TParams extends StepParams = StepParams> = {
  id: string;
  title: string;
  source: StepSource;
  object: string;
  operator: string;
  params?: TParams;
};

export type StateBlock = {
  description: string;
  assertions: StepSpec[];
};

export type ActionBlock = {
  description: string;
  steps: StepSpec[];
};

export type StateCaseSpec<TData extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  title: string;
  model: StateCaseModel;
  tags?: string[];
  data: TData;
  B: StateBlock;
  Setup: ActionBlock;
  S0: StateBlock;
  Action: ActionBlock;
  S1: StateBlock;
  Clean: ActionBlock;
};

export type StateCaseRuntime = {
  values: Record<string, unknown>;
};

export type StateCaseOperatorContext<
  TContext,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = {
  ctx: TContext;
  data: TData;
  runtime: StateCaseRuntime;
  testCase: StateCaseSpec<TData>;
  stage: StateCaseRunStageName;
  step: StepSpec;
  params: StepParams;
};

export type StateCaseOperator<
  TContext,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = (operatorContext: StateCaseOperatorContext<TContext, TData>) => Promise<unknown> | unknown;

export type OperatorRegistry<
  TContext,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = Record<string, Record<string, StateCaseOperator<TContext, TData>>>;
