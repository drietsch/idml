// SDK Phase 5 — Tools panel acceptance.
//
// Expert leaf consuming useSelection's activeTool / setActiveTool.
// Writes application state, not document state.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Tools panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Tools", { exact: true }).first().click();
  });

  test("AC-TOOLS-1 — panel mounts and lists Select + Text", async ({
    page,
  }) => {
    await expect(page.locator('[data-tools-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-tools-panel="ready"] [data-tool="select"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-tools-panel="ready"] [data-tool="text"]'),
    ).toBeVisible();
  });

  test("AC-TOOLS-2 — clicking a tool button updates activeTool", async ({
    page,
  }) => {
    // Default active tool is `select`.
    await expect(
      page.locator(
        '[data-tools-panel="ready"] [data-tool="select"][data-active="true"]',
      ),
    ).toBeVisible();
    // Click Text → switches.
    await page
      .locator('[data-tools-panel="ready"] [data-tool="text"]')
      .click();
    await expect(
      page.locator(
        '[data-tools-panel="ready"] [data-tool="text"][data-active="true"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-tools-panel="ready"] [data-tool="select"][data-active="false"]',
      ),
    ).toBeVisible();
  });
});
