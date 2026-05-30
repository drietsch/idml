// SDK Phase 5 — Gradients panel acceptance.
//
// Validates that the collection-select primitive's
// `valueType: "colorRef"` extension generalises to the gradients
// collection. The panel mounts and the bound select carries the
// expected data attributes; gradient apply via FillColor is
// covered by the existing FrameFillColor unit tests + the
// Swatches panel's AC-SWATCH-2 (both flow through the same
// apply arm).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/gradients.idml`;

test.describe("Phase 5 — Gradients panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Gradients", { exact: true }).first().click();
  });

  test("AC-GRAD-1 — panel mounts as a composition with a gradients select", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-gradients-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-gradients-panel="ready"] select[data-collection="gradients"][data-value-type="colorRef"]',
      ),
    ).toBeVisible();
  });
});
