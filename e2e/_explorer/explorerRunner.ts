import type { Page } from "@playwright/test";
import { CoverageGraph } from "./coverageGraph";
import { executeEvent } from "./eventExecutor";
import { generateCandidateEvents } from "./eventGenerator";
import { EventScheduler } from "./eventScheduler";
import { normalizeState } from "./stateNormalizer";
import { collectTargets } from "./targetCollector";
import { SeededRandom } from "./seededRandom";
import { isInAllowedScope, shouldRunEvent } from "./safety";
import { runRepeatableRegionExplorer } from "./repeatableRegionRunner";
import { attachDiagnostics, resetToTarget, shellQuote } from "./runnerSupport";
import { ScreenshotCollector } from "./screenshotCollector";
import type { ExecutionResult, ExplorerConfig, ExplorerRunResult, StepRecord } from "./types";

export async function runUiExplorer(page: Page, config: ExplorerConfig): Promise<ExplorerRunResult> {
  const rng = new SeededRandom(config.seed);
  const graph = new CoverageGraph();
  const scheduler = new EventScheduler({ epsilon: config.epsilon });
  const diagnostics = attachDiagnostics(page.context(), page);
  const screenshots = new ScreenshotCollector(page, config);
  const records: StepRecord[] = [];
  let noChangeStreak = 0;
  const startedAt = Date.now();

  await resetToTarget(page, config);

  for (let step = 0; step < config.steps; step += 1) {
    if (isTimeBudgetExhausted(startedAt, config.maxDurationMs)) {
      break;
    }

    if (!isInAllowedScope(page.url(), config)) {
      await resetToTarget(page, config);
    }

    const before = await normalizeState(page, diagnostics.pendingCount(), config.stateAbstractor);
    const targets = await collectTargets(page);
    const candidates = generateCandidateEvents(targets).filter((candidate) => shouldRunEvent(candidate, config));
    const observed = graph.observeState(before, candidates, step);
    if (observed.isNewState) {
      await screenshots.captureState(before, step);
    }

    if (candidates.length === 0) {
      await resetToTarget(page, config);
      noChangeStreak = 0;
      continue;
    }

    const event = scheduler.pick(before, candidates, graph, rng);
    if (!event) {
      await resetToTarget(page, config);
      noChangeStreak = 0;
      continue;
    }

    const diagnosticCursor = diagnostics.cursor();
    const execution = await executeEvent(page, event, config);
    const diagnosticIssues = diagnostics.readSince(diagnosticCursor);
    const mergedExecution: ExecutionResult = {
      ...execution,
      issues: [...execution.issues, ...diagnosticIssues],
      ok: execution.ok && diagnosticIssues.every((issue) => issue.severity !== "severe"),
    };
    if (mergedExecution.routeEscape) {
      mergedExecution.issues = mergedExecution.issues.map((issue) =>
        issue.severity === "severe" ? { ...issue, severity: "ordinary", type: `route-escape-${issue.type}` } : issue,
      );
      mergedExecution.ok = true;
    }

    let after = await normalizeState(page, diagnostics.pendingCount(), config.stateAbstractor).catch(async () => {
      await resetToTarget(page, config);
      return normalizeState(page, diagnostics.pendingCount(), config.stateAbstractor);
    });

    if (after.flags.isWhiteScreen && !mergedExecution.routeEscape) {
      mergedExecution.issues.push({
        severity: "severe",
        type: "white-screen",
        message: "Normalized state detected a white screen.",
        url: page.url(),
      });
      mergedExecution.ok = false;
    }

    const update = graph.addTransition(before, event, after, mergedExecution, step);
    if (update.newState) {
      await screenshots.captureState(after, step);
    }
    if (mergedExecution.issues.length > 0) {
      await screenshots.captureIssue(after, step, mergedExecution.issues);
    }
    const noChange = before.id === after.id;
    noChangeStreak = noChange ? noChangeStreak + 1 : 0;
    scheduler.update(event);

    const record: StepRecord = {
      step,
      beforeStateId: before.id,
      afterStateId: after.id,
      eventSignature: event.signature,
      operation: event.operation,
      targetSignature: event.target?.signature,
      params: event.params,
      reward: update.reward,
      newState: update.newState,
      newTransition: update.newTransition,
      noChange,
      routeEscape: mergedExecution.routeEscape,
      issues: mergedExecution.issues,
    };
    records.push(record);

    if (mergedExecution.routeEscape && config.stopOnRouteEscape) {
      break;
    }

    if (
      (mergedExecution.routeEscape && config.resetOnRouteEscape) ||
      noChangeStreak >= config.maxNoChange ||
      after.flags.isWhiteScreen ||
      mergedExecution.issues.some((issue) => issue.severity === "severe")
    ) {
      await resetToTarget(page, config);
      after = await normalizeState(page, diagnostics.pendingCount(), config.stateAbstractor);
      graph.observeState(
        after,
        generateCandidateEvents(await collectTargets(page)).filter((candidate) => shouldRunEvent(candidate, config)),
        step,
      );
      await screenshots.captureState(after, step);
      noChangeStreak = 0;
    }
  }

  diagnostics.detach();
  const summary = graph.summarize(config.steps, records);
  const canonicalCoverage = graph.getCanonicalCandidateCoverage();
  const result: ExplorerRunResult = {
    config,
    seed: config.seed,
    summary,
    newStateCurve: graph.newStateCurve(records),
    newTransitionCurve: graph.newTransitionCurve(records),
    stateTable: graph.getStateTable(),
    transitionTable: graph.getTransitionTable(),
    frontierStates: graph.getFrontierStates(),
    untestedCandidateEvents: graph.getUntestedCandidateEvents(),
    canonicalCandidateEvents: canonicalCoverage.discovered,
    testedCanonicalCandidateEvents: canonicalCoverage.tested,
    eventSequence: records,
    screenshotArtifacts: screenshots.list(),
    replayCommand: [
      `UI_EXPLORER_TEST_KIND=${shellQuote(config.testKind)}`,
      `UI_EXPLORER_SAFETY_PROFILE=${shellQuote(config.safetyProfile)}`,
      `UI_EXPLORER_SEED=${shellQuote(config.seed)}`,
      `UI_EXPLORER_STEPS=${config.steps}`,
      config.maxDurationMs > 0 ? `UI_EXPLORER_MAX_DURATION_MS=${config.maxDurationMs}` : "",
      `UI_EXPLORER_STATE_ABSTRACTOR=${shellQuote(config.stateAbstractor)}`,
      `UI_EXPLORER_TARGET_PATH=${shellQuote(config.targetPath)}`,
      `UI_EXPLORER_BASE_URL=${shellQuote(config.baseURL)}`,
      "npm run test:e2e:explorer",
    ].filter(Boolean).join(" "),
  };

  if (config.runRepeatableRegionTests && config.testKind === "stateExploration") {
    result.repeatableRegionExploration = await runRepeatableRegionExplorer(page, config, result);
  }

  return result;
}

function isTimeBudgetExhausted(startedAt: number, maxDurationMs: number) {
  return maxDurationMs > 0 && Date.now() - startedAt >= maxDurationMs;
}
