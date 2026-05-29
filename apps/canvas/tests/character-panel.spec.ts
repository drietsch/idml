// SDK Phase 3 — Character panel acceptance.
//
// The Character panel is the proof-of-concept declarative composition:
// every field renders from `character.composition.ts`, bindings
// resolve against the current content selection (mapped to
// `ElementId.storyRange`), and edits commit through the apply arm
// at `(NodeId::StoryRange, Character*)`.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 3 — Character panel (declarative composition)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    // The three property panels (Character, Stroke, Object) share
    // the "properties" group in dockview — only one is rendered
    // at a time. Activate Character explicitly before asserting.
    await page.getByText("Character", { exact: true }).first().click();
  });

  test("AC-CHAR-1 — Character panel mounts and shows section title", async ({
    page,
  }) => {
    // The Character panel is in `BUILT_IN_PANELS` with title "Character".
    // Dockview renders it as a tab; it should be visible by default in
    // the right-side group alongside Inspector / Layers.
    await expect(page.locator('[data-character-panel="ready"]')).toBeVisible();
    // The section title comes from the composition's
    // `verso.layout.section` leaf with props.title = "Character".
    await expect(
      page.locator('[data-character-panel="ready"] [data-section="Character"]'),
    ).toBeVisible();
  });

  test("AC-CHAR-2 — fields render em-dash placeholder when no content selection", async ({
    page,
  }) => {
    // No content selection by default → every binding resolves to
    // null → every leaf shows the em-dash placeholder.
    const mixed = page.locator(
      '[data-character-panel="ready"] [data-mixed]',
    );
    // 4 fields × em-dash = 4 placeholders.
    await expect(mixed).toHaveCount(4);
    // All show the em-dash character.
    const text = await mixed.first().textContent();
    expect(text?.trim()).toBe("—");
  });

  test("AC-CHAR-3 — setContentSelection routes through __canvas without throwing", async ({
    page,
  }) => {
    // The shell exposes `setContentSelection` on the __canvas debug
    // surface so tests can drive content-scope bindings without
    // needing a click → text-mode → drag flow. This smoke test
    // verifies the wire is in place. A richer end-to-end test that
    // populates Character fields needs a public surface listing
    // story ids; that's Phase 3.x scope (the natural addition is a
    // `verso.stories()` script-side function returning self_id +
    // first-run offsets so a test can pick a non-trivial range).
    const ok = await page.evaluate(() => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            setContentSelection: (
              sel: { storyId: string; start: number; end: number } | null,
            ) => void;
          };
        }
      ).__canvas;
      if (typeof c.setContentSelection !== "function") return false;
      // Passing a placeholder id is fine — the worker rejects it
      // gracefully (the script-side bridge already proves this in
      // crates/idml-script/tests/script_basics.rs).
      c.setContentSelection({ storyId: "Story/__test__", start: 0, end: 3 });
      // Clear so it doesn't leak into the next test.
      c.setContentSelection(null);
      return true;
    });
    expect(ok).toBe(true);
  });
});
