import { defineConfig, devices } from "@playwright/test";

const realSystemEnabled = process.env.ORF_REAL_E2E === "1";
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
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
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
