import type { BrowserContext, Page, Request, Response } from "@playwright/test";
import { CoverageGraph } from "./coverageGraph";
import { executeEvent } from "./eventExecutor";
import { generateCandidateEvents } from "./eventGenerator";
import { EventScheduler } from "./eventScheduler";
import { normalizeState } from "./stateNormalizer";
import { collectTargets } from "./targetCollector";
import { SeededRandom } from "./seededRandom";
import { isInAllowedScope, shouldRunEvent, targetUrl } from "./safety";
import type { ExecutionIssue, ExecutionResult, ExplorerConfig, ExplorerRunResult, StepRecord } from "./types";

export async function runUiExplorer(page: Page, config: ExplorerConfig): Promise<ExplorerRunResult> {
  const rng = new SeededRandom(config.seed);
  const graph = new CoverageGraph();
  const scheduler = new EventScheduler({ epsilon: config.epsilon });
  const diagnostics = attachDiagnostics(page.context(), page);
  const records: StepRecord[] = [];
  let noChangeStreak = 0;

  await resetToTarget(page, config);

  for (let step = 0; step < config.steps; step += 1) {
    if (!isInAllowedScope(page.url(), config)) {
      await resetToTarget(page, config);
    }

    const before = await normalizeState(page, diagnostics.pendingCount(), config.stateMode);
    const targets = await collectTargets(page);
    const candidates = generateCandidateEvents(targets).filter((candidate) => shouldRunEvent(candidate, config));
    graph.observeState(before, candidates, step);

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

    let after = await normalizeState(page, diagnostics.pendingCount(), config.stateMode).catch(async () => {
      await resetToTarget(page, config);
      return normalizeState(page, diagnostics.pendingCount(), config.stateMode);
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
      after = await normalizeState(page, diagnostics.pendingCount(), config.stateMode);
      graph.observeState(
        after,
        generateCandidateEvents(await collectTargets(page)).filter((candidate) => shouldRunEvent(candidate, config)),
        step,
      );
      noChangeStreak = 0;
    }
  }

  diagnostics.detach();
  const summary = graph.summarize(config.steps, records);
  const canonicalCoverage = graph.getCanonicalCandidateCoverage();
  return {
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
    replayCommand: [
      `UI_EXPLORER_SEED=${shellQuote(config.seed)}`,
      `UI_EXPLORER_STEPS=${config.steps}`,
      `UI_EXPLORER_TARGET_PATH=${shellQuote(config.targetPath)}`,
      `UI_EXPLORER_BASE_URL=${shellQuote(config.baseURL)}`,
      "npm run test:e2e:explorer",
    ].join(" "),
  };
}

async function resetToTarget(page: Page, config: ExplorerConfig) {
  await page.goto(targetUrl(config), { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(100);
}

function attachDiagnostics(context: BrowserContext, page: Page) {
  const issues: ExecutionIssue[] = [];
  const pending = new Set<Request>();

  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") {
      issues.push({ severity: "ordinary", type: "console-error", message: message.text().slice(0, 500), url: page.url() });
    }
  };
  const onPageError = (error: Error) => {
    issues.push({ severity: "severe", type: "pageerror", message: error.message.slice(0, 500), url: page.url() });
  };
  const onRequest = (request: Request) => {
    if (request.url().startsWith("http")) {
      pending.add(request);
    }
  };
  const onRequestFinished = (request: Request) => {
    pending.delete(request);
  };
  const onRequestFailed = (request: Request) => {
    pending.delete(request);
    issues.push({
      severity: "ordinary",
      type: "request-failed",
      message: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`.slice(0, 500),
      url: request.url(),
    });
  };
  const onResponse = (response: Response) => {
    if (response.status() >= 500) {
      issues.push({
        severity: "ordinary",
        type: "server-error-response",
        message: `${response.status()} ${response.url()}`.slice(0, 500),
        url: response.url(),
      });
    }
  };
  const onNewPage = async (newPage: Page) => {
    if (newPage !== page) {
      issues.push({ severity: "ordinary", type: "new-window", message: `Closed new page: ${newPage.url()}` });
      await newPage.close().catch(() => undefined);
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("request", onRequest);
  page.on("requestfinished", onRequestFinished);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);
  context.on("page", onNewPage);

  return {
    cursor: () => issues.length,
    readSince: (cursor: number) => issues.slice(cursor),
    pendingCount: () => pending.size,
    detach: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("request", onRequest);
      page.off("requestfinished", onRequestFinished);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
      context.off("page", onNewPage);
    },
  };
}

function shellQuote(value: string) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
