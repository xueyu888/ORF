import fs from "node:fs/promises";
import path from "node:path";
import { liveReportSnapshot, renderLiveReportHtml, type LiveReportStatus } from "./reporter";
import type { UiExplorerProgressContext, UiExplorerRunObserver } from "./explorerRunner";
import type { ExplorerConfig, ExplorerRunResult, ScreenshotArtifact, StepRecord } from "./types";

export type LiveExplorerReporterOptions = {
  runDir: string;
  flushIntervalMs: number;
  resultFlushIntervalMs: number;
};

export class LiveExplorerReporter implements UiExplorerRunObserver {
  readonly reportPath: string;
  readonly resultPath: string;
  readonly summaryPath: string;
  readonly statusPath: string;
  readonly eventsPath: string;
  private revision = 0;
  private startedAt = Date.now();
  private lastFlushAt = 0;
  private lastResultFlushAt = 0;
  private eventWrite = Promise.resolve();
  private latestResult: ExplorerRunResult | null = null;

  constructor(
    private readonly config: ExplorerConfig,
    private readonly options: LiveExplorerReporterOptions,
  ) {
    this.reportPath = path.join(options.runDir, "report.html");
    this.resultPath = path.join(options.runDir, "result.json");
    this.summaryPath = path.join(options.runDir, "live-summary.json");
    this.statusPath = path.join(options.runDir, "run-status.json");
    this.eventsPath = path.join(options.runDir, "events.ndjson");
  }

  async initialize() {
    await fs.mkdir(this.options.runDir, { recursive: true });
    await fs.writeFile(this.eventsPath, "", "utf8");
    const initial = this.emptyResult();
    this.latestResult = initial;
    const snapshot = this.snapshot(initial, "running");
    await atomicWriteJson(this.summaryPath, snapshot);
    await atomicWriteJson(this.statusPath, this.status(snapshot.status));
    await atomicWriteText(this.reportPath, renderLiveReportHtml(initial, snapshot));
  }

  onStart(input: { startedAt: number }) {
    this.startedAt = input.startedAt;
  }

  onStep(input: UiExplorerProgressContext) {
    this.appendEvent(input.record);
    const now = Date.now();
    if (now - this.lastFlushAt < this.options.flushIntervalMs) {
      return;
    }
    this.lastFlushAt = now;
    const result = this.normalizeResult(input.createResult());
    this.latestResult = result;
    void this.flush(result, "running", now);
  }

  async onComplete(result: ExplorerRunResult) {
    await this.complete(result, "completed");
  }

  async complete(result: ExplorerRunResult, status: LiveReportStatus) {
    const normalized = this.normalizeResult(result);
    this.latestResult = normalized;
    await this.eventWrite;
    await this.flush(normalized, status, Date.now(), true);
  }

  async markFailed(error: unknown) {
    if (this.latestResult) {
      await this.flush(this.latestResult, "failed", Date.now(), true);
    }
    await atomicWriteJson(this.statusPath, {
      ...this.status("failed"),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private async flush(result: ExplorerRunResult, status: LiveReportStatus, now: number, forceResult = false) {
    const snapshot = this.snapshot(result, status);
    await atomicWriteJson(this.summaryPath, snapshot);
    await atomicWriteJson(this.statusPath, this.status(status));
    if (forceResult || now - this.lastResultFlushAt >= this.options.resultFlushIntervalMs) {
      this.lastResultFlushAt = now;
      await atomicWriteJson(this.resultPath, { ...result, ...result.summary });
      await atomicWriteText(this.reportPath, renderLiveReportHtml(result, snapshot));
    }
  }

  private snapshot(result: ExplorerRunResult, status: LiveReportStatus) {
    this.revision += 1;
    return liveReportSnapshot(result, status, {
      revision: this.revision,
      startedAt: this.startedAt,
      runDir: this.options.runDir,
      reportPath: this.reportPath,
      resultPath: this.resultPath,
    });
  }

  private status(status: LiveReportStatus) {
    return {
      status,
      revision: this.revision,
      seed: this.config.seed,
      startedAt: new Date(this.startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
      reportPath: this.reportPath,
      resultPath: this.resultPath,
    };
  }

  private appendEvent(record: StepRecord) {
    const line = `${JSON.stringify(record)}\n`;
    this.eventWrite = this.eventWrite.then(() => fs.appendFile(this.eventsPath, line, "utf8")).catch(() => undefined);
  }

  private emptyResult(): ExplorerRunResult {
    return this.normalizeResult({
      config: this.config,
      seed: this.config.seed,
      summary: {
        totalSteps: this.config.steps,
        executedSteps: 0,
        discoveredStateCount: 0,
        discoveredTransitionCount: 0,
        discoveredCandidateEventCount: 0,
        testedCandidateEventCount: 0,
        candidateEventCoverage: 0,
        discoveredCanonicalCandidateEventCount: 0,
        testedCanonicalCandidateEventCount: 0,
        canonicalCandidateEventCoverage: 0,
        payloadKindCoverage: 0,
        targetCoverage: 0,
        noChangeRate: 0,
        routeEscapeCount: 0,
        runtimeErrorCount: 0,
        severeFailureCount: 0,
        discoveredSpaceExplorationScore: 0,
        stateGrowthSaturation: 0,
        transitionGrowthSaturation: 0,
        repeatableRegionCount: 0,
      },
      newStateCurve: [],
      newTransitionCurve: [],
      stateTable: [],
      transitionTable: [],
      frontierStates: [],
      untestedCandidateEvents: [],
      canonicalCandidateEvents: [],
      testedCanonicalCandidateEvents: [],
      eventSequence: [],
      screenshotArtifacts: [],
      replayCommand: "npm run test:e2e:explorer:live",
    });
  }

  private normalizeResult(result: ExplorerRunResult): ExplorerRunResult {
    return {
      ...result,
      reportPath: this.resultPath,
      htmlReportPath: this.reportPath,
      screenshotArtifacts: result.screenshotArtifacts.map((artifact) => this.normalizeScreenshot(artifact)),
    };
  }

  private normalizeScreenshot(artifact: ScreenshotArtifact): ScreenshotArtifact {
    const relativePath = path.relative(this.options.runDir, artifact.path).split(path.sep).join("/");
    return {
      ...artifact,
      relativePath: relativePath.startsWith("..") ? (artifact.relativePath ?? artifact.path) : relativePath,
    };
  }
}

export function liveRunDir(reportRoot: string, seed: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(reportRoot, `${timestamp}-live-seed-${safeFilePart(seed)}`);
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await atomicWriteText(filePath, JSON.stringify(value, null, 2));
}

async function atomicWriteText(filePath: string, value: string) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, value, "utf8");
  await fs.rename(tmpPath, filePath);
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "seed";
}
