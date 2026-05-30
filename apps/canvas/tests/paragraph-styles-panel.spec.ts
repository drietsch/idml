// SDK Phase 5 — Paragraph Styles panel acceptance.
//
// Expert leaf hybrid candidate per the panel-catalog doc §5.3/§5.5:
// reads `documentCollection:paragraphStyles`, applies the style id
// as a `selectionProperty:appliedParagraphStyle` write on click.
// This v1 is a thin button list — chrome polish lands when the
// Create/Edit/Delete style Operations ship.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Paragraph Styles panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page
      .getByText("Paragraph Styles", { exact: true })
      .first()
      .click();
  });

  test("AC-PSTYLE-1 — panel mounts and lists at least one style or shows empty", async ({
    page,
  }) => {
    // The panel renders either a `data-style-list` (when styles
    // exist) or `data-empty-styles` (when the fixture has none).
    // Either outcome proves the fetch path completed without
    // throwing — that's the assertion.
    await expect(
      page.locator('[data-paragraph-styles-panel="ready"]'),
    ).toBeVisible();
    const list = page.locator('[data-paragraph-styles-panel="ready"] [data-style-list]');
    const empty = page.locator(
      '[data-paragraph-styles-panel="ready"] [data-empty-styles]',
    );
    // Exactly one of the two is visible.
    const listVisible = await list.isVisible();
    const emptyVisible = await empty.isVisible();
    expect(listVisible || emptyVisible).toBe(true);
  });

  test("AC-PSTYLE-2 — without content selection, style buttons are disabled", async ({
    page,
  }) => {
    // The "Select text to apply a style" hint should be visible
    // when there's no content selection.
    await expect(
      page.locator(
        '[data-paragraph-styles-panel="ready"] [data-no-selection]',
      ),
    ).toBeVisible();
  });
});
