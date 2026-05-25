import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Reuse an already-running Vite dev server when one is up (faster
// iteration locally); otherwise spawn one. The wasm bundle is built
// out-of-band via `npm run wasm` — Playwright does not rebuild it.
const PORT = Number(process.env.IDML_CANVAS_TEST_PORT ?? 5180);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  // Single worker keeps the snapshot tier deterministic (worker pool
  // contention can race the layout cache across packs). Re-enable
  // parallelism once we've confirmed perf isn't bottlenecked by it.
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  timeout: 5 * 60_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1600, height: 1000 },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: __dirname,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // WebGPU lights up when BACKEND=gpu — but headless Chromium
        // doesn't ship a WebGPU adapter, so we force headed mode in
        // that case. On Linux the Vulkan flags are needed; on macOS
        // Metal works by default.
        headless: (process.env.BACKEND ?? "").toLowerCase() !== "gpu",
        launchOptions:
          (process.env.BACKEND ?? "").toLowerCase() === "gpu"
            ? {
                args: [
                  "--enable-unsafe-webgpu",
                  "--use-vulkan",
                  "--enable-features=Vulkan",
                ],
              }
            : {},
      },
    },
  ],
  metadata: {
    repoRoot: REPO_ROOT,
  },
});
