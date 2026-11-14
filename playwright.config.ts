import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", timeout: 60000, expect: { timeout: 15000 }, fullyParallel: false, workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.INVARIANT_TEST_BASE_URL || "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.INVARIANT_TEST_BASE_URL ? undefined : { command: "npm run dev -- --port 3000", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 60000, env: { INVARIANT_DATA_DIR: ".runtime/e2e", PORT: "3000" } },
});
