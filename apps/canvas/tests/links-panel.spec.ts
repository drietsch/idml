// SDK Phase 5 (named sweep) — Links panel acceptance.
//
// Read-only expert leaf. Validates the wire (documentCollection:
// links → useCollection → list render) end-to-end.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

test.describe("Phase 5 — Links panel", () => {
  test("AC-LINKS-1 — empty fixture renders the empty-links placeholder", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/geometry-groups.idml`);
    await page.getByText("Links", { exact: true }).first().click();
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    await expect(page.locator("[data-empty-links]")).toBeVisible();
  });

  test("AC-LINKS-2 — images fixture lists at least one link", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/images.idml`);
    await page.getByText("Links", { exact: true }).first().click();
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-link-list] [data-link-host]");
    await expect(rows).not.toHaveCount(0);
  });
});
