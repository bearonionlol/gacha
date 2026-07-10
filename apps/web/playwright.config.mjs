import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.GACHA_E2E_PORT ?? "3210", 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("GACHA_E2E_PORT must be a valid TCP port.");
}

const baseURL = `http://127.0.0.1:${port}`;
const useProductionServer = process.env.CI === "true" || process.env.GACHA_E2E_USE_BUILD === "true";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "line",
  outputDir: "./e2e/.artifacts/test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure"
  },
  webServer: {
    command: `pnpm exec next ${useProductionServer ? "start" : "dev"} --hostname 127.0.0.1 --port ${port}`,
    env: {
      NEXT_DIST_DIR: ".next",
      NEXT_PUBLIC_GACHA_CHAIN_MODE: "demo",
      NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: "demo",
      NEXT_PUBLIC_GACHA_ENABLE_ADMIN: "false",
      NEXT_PUBLIC_GACHA_RPC_URL: ""
    },
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
    url: baseURL
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: "**/*.e2e.mjs",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-chromium",
      testMatch: "**/*.e2e.mjs",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
