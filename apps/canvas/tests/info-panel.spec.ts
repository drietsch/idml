// SDK Phase 5 (v1 sweep) — Info panel acceptance.
//
// Validates the `useDocumentMeta()` hook + DocumentMetaReply wire
// end-to-end. The panel renders six rows (Pages / Active page /
// Units / Color mode / Document / Dirty) backed by the singleton
// `CanvasModel::document_meta()` reply.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Info panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Info", { exact: true }).first().click();
  });

  test("AC-INFO-1 — panel mounts and surfaces the six DocumentMeta fields", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-info-panel="ready"]'),
    ).toBeVisible();
    for (const label of [
      "Pages",
      "Active page",
      "Units",
      "Color mode",
      "Document",
      "Dirty",
    ]) {
      await expect(
        page.locator(`[data-info-row="${label}"]`),
      ).toBeVisible();
    }
  });

  test("AC-INFO-2 — Pages row reflects the loaded document's page count", async ({
    page,
  }) => {
    const value = await page
      .locator('[data-info-row="Pages"] [data-info-value]')
      .textContent();
    // Fixture has ≥1 page; assert numeric non-zero.
    expect(value && /^[0-9]+$/.test(value)).toBe(true);
    expect(Number(value)).toBeGreaterThan(0);
  });
});
