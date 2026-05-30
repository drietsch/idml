// SDK Phase 3 — element-scope declarative panels.
//
// Stroke + Object/Transform panels rendered as catalog compositions
// over the existing frame-level apply arms (FrameStrokeWeight,
// FrameStrokeColor, FrameBounds, FrameOpacity). Element-scope
// bindings — they resolve against the current single element
// selection.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const TEXT_FRAME_ID = "ua365e1";

interface ElementIdShape {
  kind: string;
  id: string;
}

interface CanvasGlobal {
  client: {
    setElementSelection: (
      ids: ElementIdShape[],
      mode: string,
    ) => Promise<ElementIdShape[]>;
  };
  // The React `SelectionContext` state setter — without calling
  // this the binding hook reads stale [] from the context. The
  // worker-side setElementSelection updates the worker; this
  // updates the main-thread mirror that React panels read.
  setElementSelection: (ids: ElementIdShape[]) => void;
}

async function selectFrame(page: import("@playwright/test").Page, id: string) {
  await page.evaluate(
    async ({ id }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const target = { kind: "textFrame", id };
      const ids = await c.client.setElementSelection([target], "replace");
      c.setElementSelection(ids);
    },
    { id },
  );
}

/** The three property panels (Character, Stroke, Object) share the
 *  "properties" group in dockview — they're tabs in the same
 *  container, so only one is rendered at a time. The default
 *  active tab depends on layout-persistence + insertion order;
 *  tests explicitly activate the tab they're asserting on. */
async function activateTab(
  page: import("@playwright/test").Page,
  title: string,
) {
  // Dockview renders tabs as divs with the panel title as text;
  // clicking by exact text content activates the tab.
  await page.getByText(title, { exact: true }).first().click();
}

test.describe("Phase 3 — element-scope declarative panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-STROKE-1 — Stroke panel mounts; shows em-dash placeholders when no selection", async ({
    page,
  }) => {
    await activateTab(page, "Stroke");
    await expect(page.locator('[data-stroke-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-stroke-panel="ready"] [data-section="Stroke"]'),
    ).toBeVisible();
    // 2 fields: Weight + Color. Both em-dash with no selection.
    const mixed = page.locator('[data-stroke-panel="ready"] [data-mixed]');
    await expect(mixed).toHaveCount(2);
  });

  test("AC-STROKE-2 — selecting a frame populates the Stroke panel fields", async ({
    page,
  }) => {
    await selectFrame(page, TEXT_FRAME_ID);
    await activateTab(page, "Stroke");
    // After selection, the em-dash placeholders disappear because
    // the binding hook resolves real values. There should still be
    // 2 leaf rows but no more placeholders.
    await expect(
      page.locator('[data-stroke-panel="ready"] [data-mixed]'),
    ).toHaveCount(0);
    // The Weight field is a LengthInput — its display value lives
    // inside the input. The Color field is a ColorPicker swatch.
    // We don't check exact values here (fixture-dependent); just
    // assert the leaf rows resolve.
    await expect(
      page.locator('[data-stroke-panel="ready"] input').first(),
    ).toBeVisible();
  });

  test("AC-OBJECT-1 — Object panel mounts; em-dash placeholders when no selection", async ({
    page,
  }) => {
    await activateTab(page, "Object");
    await expect(
      page.locator('[data-object-transform-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-object-transform-panel="ready"] [data-section="Object"]',
      ),
    ).toBeVisible();
    // 2 fields: Bounds + Opacity. Both em-dash with no selection.
    const mixed = page.locator(
      '[data-object-transform-panel="ready"] [data-mixed]',
    );
    await expect(mixed).toHaveCount(2);
  });

  test("AC-OBJECT-2 — selecting a frame populates Bounds + Opacity", async ({
    page,
  }) => {
    await selectFrame(page, TEXT_FRAME_ID);
    await activateTab(page, "Object");
    await expect(
      page.locator('[data-object-transform-panel="ready"] [data-mixed]'),
    ).toHaveCount(0);
    // BoundsInput renders 4 LengthInput cells; Opacity renders 1.
    // 5 inputs total in the Object panel.
    await expect(
      page.locator('[data-object-transform-panel="ready"] input'),
    ).toHaveCount(5);
  });

  test("AC-OBJECT-3 — multi-selection with differing bounds shows mixed", async ({
    page,
  }) => {
    // Select two frames with different bounds — Bounds should
    // collapse to mixed (em-dash), Opacity should also be mixed
    // unless they happen to share the value.
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              setElementSelection: (
                ids: { kind: string; id: string }[],
                mode: string,
              ) => Promise<{ kind: string; id: string }[]>;
            };
            setElementSelection: (ids: { kind: string; id: string }[]) => void;
          };
        }
      ).__canvas;
      const ids = await c.client.setElementSelection(
        [
          { kind: "textFrame", id: "ua365e1" },
          { kind: "rectangle", id: "ueccee2" },
        ],
        "replace",
      );
      c.setElementSelection(ids);
    });
    await activateTab(page, "Object");
    // The two frames have different bounds → Bounds field is mixed
    // → em-dash. Opacity may or may not be mixed depending on
    // fixture; assert at least 1 mixed appears (Bounds).
    await expect
      .poll(
        async () =>
          await page
            .locator('[data-object-transform-panel="ready"] [data-mixed]')
            .count(),
      )
      .toBeGreaterThanOrEqual(1);
  });
});
