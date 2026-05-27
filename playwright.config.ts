import { defineConfig, devices } from "@playwright/test";
import { disabledTestdSpecGlobs } from "./testd/testd.config";

const realSystemEnabled = process.env.ORF_REAL_E2E === "1";
if (realSystemEnabled) {
  process.env.DATABASE_POOL_MAX ??= "4";
  process.env.DATABASE_CONNECTION_TIMEOUT_MS ??= "30000";
}

const defaultPort = realSystemEnabled ? 5174 : 5173;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${defaultPort}`;
const webServerPort = new URL(baseURL).port || String(defaultPort);
const baseHost = new URL(baseURL).hostname;
if (baseHost === "127.0.0.1" || baseHost === "localhost") {
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
    delete process.env[key];
  }
}

export default defineConfig({
  testDir: "./testd",
  outputDir: ".artifacts/playwright-test-results",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  testIgnore: disabledTestdSpecGlobs,
  reporter: [
    ["list", { printSteps: true }],
    ["./testd/_framework/reporter.ts"],
  ],
  fullyParallel: !realSystemEnabled,
  workers: realSystemEnabled ? 1 : undefined,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev:web -- --host 127.0.0.1 --port ${webServerPort}`,
        reuseExistingServer: !process.env.CI && !realSystemEnabled,
        timeout: 120_000,
        url: baseURL,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
