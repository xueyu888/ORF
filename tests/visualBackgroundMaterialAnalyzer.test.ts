import assert from "node:assert/strict";
import test from "node:test";
import { backgroundAnalysisWorkerSupported } from "../src/features/appearance/material/backgroundAnalyzer";

const RuntimeWorker = class {} as unknown as typeof Worker;
const RuntimeOffscreenCanvas = class {} as unknown as typeof OffscreenCanvas;

test("background material analysis uses workers only in supported interactive browser runtimes", () => {
  assert.equal(
    backgroundAnalysisWorkerSupported({
      navigator: { webdriver: false },
      offscreenCanvas: RuntimeOffscreenCanvas,
      worker: RuntimeWorker,
    }),
    true,
  );
  assert.equal(
    backgroundAnalysisWorkerSupported({
      navigator: { webdriver: false },
      offscreenCanvas: undefined,
      worker: RuntimeWorker,
    }),
    false,
  );
  assert.equal(
    backgroundAnalysisWorkerSupported({
      navigator: { webdriver: true },
      offscreenCanvas: RuntimeOffscreenCanvas,
      worker: RuntimeWorker,
    }),
    false,
  );
});
