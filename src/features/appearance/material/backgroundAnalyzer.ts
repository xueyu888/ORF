import type { VisualBackgroundCrop } from "../../../domain/settings/visualBackgrounds";
import { createMaterialCache } from "./materialCache";
import { materialViewportAspectBucket, type MaterialViewportSize } from "./backgroundViewport";

export type BackgroundAnalysis = {
  averageRgb: [number, number, number];
  tintRgb: [number, number, number];
  saturation: number;
  luminanceP10: number;
  luminanceP50: number;
  luminanceP90: number;
  dynamicRange: number;
  darkPixelShare: number;
  lightPixelShare: number;
  edgeDensity: number;
  complexity: number;
};

export const neutralBackgroundAnalysis: BackgroundAnalysis = {
  averageRgb: [128, 132, 136],
  tintRgb: [128, 132, 136],
  saturation: 0.08,
  luminanceP10: 0.25,
  luminanceP50: 0.5,
  luminanceP90: 0.75,
  dynamicRange: 0.5,
  darkPixelShare: 0,
  lightPixelShare: 0,
  edgeDensity: 0.15,
  complexity: 0.35,
};

type AnalyzeInput = {
  imageUrl: string;
  crop: VisualBackgroundCrop;
  viewport: MaterialViewportSize;
};

type WorkerReply = { id: string; analysis?: BackgroundAnalysis; error?: string };
type PendingAnalysis = {
  resolve: (analysis: BackgroundAnalysis) => void;
  timeout: number;
};

const analysisCache = createMaterialCache<Promise<BackgroundAnalysis>>(48);
const pendingAnalyses = new Map<string, PendingAnalysis>();
let analyzerWorker: Worker | null = null;
let nextRequestId = 0;

function analysisKey(input: AnalyzeInput) {
  const { crop } = input;
  return JSON.stringify([
    input.imageUrl,
    Number(crop.centerX.toFixed(3)),
    Number(crop.centerY.toFixed(3)),
    Number(crop.zoom.toFixed(3)),
    materialViewportAspectBucket(input.viewport),
  ]);
}

function settlePending(id: string, analysis: BackgroundAnalysis) {
  const pending = pendingAnalyses.get(id);
  if (!pending) return;
  window.clearTimeout(pending.timeout);
  pendingAnalyses.delete(id);
  pending.resolve(analysis);
}

function workerInstance() {
  if (analyzerWorker) return analyzerWorker;
  if (typeof Worker === "undefined") return null;
  try {
    analyzerWorker = new Worker(new URL("./backgroundAnalyzer.worker.ts", import.meta.url), {
      type: "module",
      name: "orf-background-material-analyzer",
    });
    analyzerWorker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
      settlePending(event.data.id, event.data.analysis ?? neutralBackgroundAnalysis);
    });
    analyzerWorker.addEventListener("error", () => {
      for (const id of pendingAnalyses.keys()) settlePending(id, neutralBackgroundAnalysis);
      analyzerWorker?.terminate();
      analyzerWorker = null;
    });
    return analyzerWorker;
  } catch {
    analyzerWorker = null;
    return null;
  }
}

function requestAnalysis(input: AnalyzeInput) {
  const worker = workerInstance();
  if (!worker) return Promise.resolve(neutralBackgroundAnalysis);
  const id = `material-${Date.now().toString(36)}-${nextRequestId += 1}`;
  return new Promise<BackgroundAnalysis>((resolve) => {
    const timeout = window.setTimeout(() => settlePending(id, neutralBackgroundAnalysis), 8_000);
    pendingAnalyses.set(id, { resolve, timeout });
    worker.postMessage({ id, ...input });
  });
}

export function analyzeBackground(input: AnalyzeInput) {
  const key = analysisKey(input);
  const cached = analysisCache.get(key);
  if (cached) return cached;
  const analysis = requestAnalysis(input);
  analysisCache.set(key, analysis);
  return analysis;
}

export function clearBackgroundAnalysisCache() {
  analysisCache.clear();
}
