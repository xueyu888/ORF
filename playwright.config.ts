import { defineConfig, devices } from "@playwright/test";
import { disabledTestdSpecGlobs } from "./testd/testd.config";
import { ensureTestdRunId } from "./testd/_framework/run-scope";

const realSystemEnabled = process.env.ORF_REAL_E2E === "1";
const includeDisabledTestdSpecs = process.env.TESTD_INCLUDE_DISABLED_SPECS === "1";
const testdSuite = process.env.TESTD_SUITE ?? "isolated";
const serialSuite = testdSuite === "permissions";
const permissionSpecGlobs = ["**/permissions/**/*.spec.ts"];

process.env.DATABASE_POOL_MAX ??= "15";
process.env.TESTD_DATABASE_POOL_MAX ??= "2";
process.env.DATABASE_CONNECTION_TIMEOUT_MS ??= "30000";
process.env.DATABASE_QUERY_TIMEOUT_MS ??= "30000";
process.env.TESTD_ROLE_PERMISSION_LOCK_TIMEOUT_MS ??= "300000";
ensureTestdRunId();

const testdTimeoutMs = positiveIntegerEnv(
  "TESTD_TEST_TIMEOUT_MS",
  serialSuite ? 180_000 : 60_000,
);

const suiteTestMatch = testdSuite === "permissions" ? permissionSpecGlobs : undefined;
const suiteTestIgnore = testdSuite === "isolated"
  ? permissionSpecGlobs
  : [];

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
  timeout: testdTimeoutMs,
  expect: {
    timeout: 5_000,
  },
  testMatch: suiteTestMatch,
  testIgnore: [
    ...suiteTestIgnore,
    ...(includeDisabledTestdSpecs ? [] : disabledTestdSpecGlobs),
  ],
  reporter: [
    ["list", { printSteps: true }],
    ["./testd/_framework/reporter.ts"],
  ],
  fullyParallel: !realSystemEnabled && !serialSuite,
  workers: realSystemEnabled || serialSuite ? 1 : undefined,
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

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
