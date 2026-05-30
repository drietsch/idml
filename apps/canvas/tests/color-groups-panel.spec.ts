// SDK Phase 5 (v1 sweep) — ColorGroups panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Color Groups panel", () => {
  test("AC-CGROUPS-1 — panel mounts; lists groups or shows empty placeholder", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Color Groups", { exact: true }).first().click();
    await expect(
      page.locator('[data-color-groups-panel="ready"]'),
    ).toBeVisible();
    const list = page.locator(
      '[data-color-groups-panel="ready"] [data-color-group-list]',
    );
    const empty = page.locator(
      '[data-color-groups-panel="ready"] [data-empty-color-groups]',
    );
    const listVisible = await list.isVisible();
    const emptyVisible = await empty.isVisible();
    expect(listVisible || emptyVisible).toBe(true);
  });
});
