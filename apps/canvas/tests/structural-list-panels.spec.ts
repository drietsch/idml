// SDK Phase 5 (v1 sweep) — Wave 1 structural collection panels.
//
// Smoke-test acceptance for Pages-list / Spreads / Master Pages /
// Cell Styles / Table Styles / Fonts. Each panel mounts and
// renders either its row list or its empty-collection
// placeholder — both prove the channel + accessor chain
// completes.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/text-advanced.idml`;

async function mountAndAssert(
  page: Page,
  tabLabel: string,
  readySelector: string,
  rowsSelector: string,
  emptySelector: string,
) {
  await page.getByText(tabLabel, { exact: true }).first().click();
  await expect(page.locator(readySelector)).toBeVisible();
  const list = page.locator(rowsSelector);
  const empty = page.locator(emptySelector);
  const listVisible = await list.isVisible();
  const emptyVisible = await empty.isVisible();
  expect(listVisible || emptyVisible).toBe(true);
}

test.describe("Phase 5 — Wave 1 structural panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-WAVE1-1 — Pages (list) panel mounts and lists pages", async ({
    page,
  }) => {
    await mountAndAssert(
      page,
      "Pages (list)",
      '[data-pages-list-panel="ready"]',
      "[data-page-list]",
      "[data-empty-pages]",
    );
  });

  test("AC-WAVE1-2 — Spreads panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "Spreads",
      '[data-spreads-panel="ready"]',
      "[data-spread-list]",
      "[data-empty-spreads]",
    );
  });

  test("AC-WAVE1-3 — Master Pages panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "Master Pages",
      '[data-master-pages-panel="ready"]',
      "[data-master-page-list]",
      "[data-empty-master-pages]",
    );
  });

  test("AC-WAVE1-4 — Cell Styles panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "Cell Styles",
      '[data-cell-styles-panel="ready"]',
      "[data-cell-style-list]",
      "[data-empty-cell-styles]",
    );
  });

  test("AC-WAVE1-5 — Table Styles panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "Table Styles",
      '[data-table-styles-panel="ready"]',
      "[data-table-style-list]",
      "[data-empty-table-styles]",
    );
  });

  test("AC-WAVE1-6 — Fonts panel mounts and lists fonts in use", async ({
    page,
  }) => {
    await mountAndAssert(
      page,
      "Fonts",
      '[data-fonts-panel="ready"]',
      "[data-font-list]",
      "[data-empty-fonts]",
    );
  });
});
