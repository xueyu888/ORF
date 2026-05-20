import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { ExecutionIssue, ExplorerConfig, NormalizedState, ScreenshotArtifact } from "./types";
import { shortHash } from "./stableHash";

export class ScreenshotCollector {
  private readonly stateIds = new Set<string>();
  private readonly artifacts: ScreenshotArtifact[] = [];
  private stateCount = 0;
  private issueCount = 0;

  constructor(
    private readonly page: Page,
    private readonly config: ExplorerConfig,
  ) {}

  async captureState(state: NormalizedState, step: number) {
    if (this.config.stateScreenshotLimit <= 0 || this.stateIds.has(state.id) || this.stateCount >= this.config.stateScreenshotLimit) {
      return;
    }
    this.stateIds.add(state.id);
    this.stateCount += 1;
    const fileName = `${padStep(step)}-${safeFilePart(state.id)}-${safeFilePart(state.routePattern)}.png`;
    const artifact = await this.capture("state", "states", fileName, {
      stateId: state.id,
      routePattern: state.routePattern,
      step,
    });
    if (artifact) {
      this.artifacts.push(artifact);
    }
  }

  async captureIssue(state: NormalizedState, step: number, issues: ExecutionIssue[]) {
    if (this.config.issueScreenshotLimit <= 0 || issues.length === 0 || this.issueCount >= this.config.issueScreenshotLimit) {
      return;
    }
    this.issueCount += 1;
    const primaryIssue = issues.find((issue) => issue.severity === "severe") ?? issues[0];
    const fileName = `${padStep(step)}-${safeFilePart(state.id)}-${safeFilePart(primaryIssue.type)}.png`;
    const artifact = await this.capture("issue", "issues", fileName, {
      stateId: state.id,
      routePattern: state.routePattern,
      step,
      issueType: primaryIssue.type,
      severity: primaryIssue.severity,
    });
    if (artifact) {
      this.artifacts.push(artifact);
    }
  }

  list() {
    return this.artifacts.map((artifact) => ({ ...artifact }));
  }

  private async capture(
    kind: ScreenshotArtifact["kind"],
    category: "states" | "issues",
    fileName: string,
    metadata: Omit<ScreenshotArtifact, "id" | "kind" | "path" | "fileName">,
  ) {
    const dir = path.join(this.config.screenshotDir, category);
    const filePath = path.join(dir, fileName);
    try {
      await fs.mkdir(dir, { recursive: true });
      await this.page.screenshot({ path: filePath, fullPage: true, animations: "disabled" });
      return {
        id: `shot-${shortHash(`${kind}:${filePath}`)}`,
        kind,
        path: filePath,
        fileName,
        ...metadata,
      } satisfies ScreenshotArtifact;
    } catch {
      return null;
    }
  }
}

function padStep(step: number) {
  return String(Math.max(0, step)).padStart(6, "0");
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "item";
}
