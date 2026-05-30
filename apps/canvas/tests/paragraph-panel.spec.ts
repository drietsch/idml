// SDK Phase 3 — Paragraph panel acceptance.
//
// Mirrors the Character panel — declarative composition over the
// new ParagraphSpaceBefore / ParagraphSpaceAfter /
// ParagraphFirstLineIndent apply arms. Content-scope bindings.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 3 — Paragraph panel (declarative composition)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Paragraph", { exact: true }).first().click();
  });

  test("AC-PARA-1 — Paragraph panel mounts and shows section title", async ({
    page,
  }) => {
    await expect(page.locator('[data-paragraph-panel="ready"]')).toBeVisible();
    await expect(
      page.locator(
        '[data-paragraph-panel="ready"] [data-section="Paragraph"]',
      ),
    ).toBeVisible();
  });

  test("AC-PARA-2 — fields render em-dash placeholder when no content selection", async ({
    page,
  }) => {
    // 4 fields × em-dash = 4 placeholders (alignment toggle-group
    // + space-before + space-after + first-line-indent).
    const mixed = page.locator('[data-paragraph-panel="ready"] [data-mixed]');
    await expect(mixed).toHaveCount(4);
  });

  test("AC-PARA-3 — content selection over a real story populates Paragraph fields", async ({
    page,
  }) => {
    const seeded = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              executeScript: (s: string) => Promise<{
                output: string[];
                error: string | null;
              }>;
            };
            setContentSelection: (
              sel: { storyId: string; start: number; end: number } | null,
            ) => void;
          };
        }
      ).__canvas;
      const result = await c.client.executeScript(
        `JSON.stringify(JSON.parse(verso.stories())[0] || null)`,
      );
      if (result.error) return null;
      const json = result.output[0] ?? null;
      if (!json) return null;
      const first = JSON.parse(json);
      if (!first || first.characterCount === 0) return null;
      const end = Math.min(3, first.characterCount);
      c.setContentSelection({ storyId: first.selfId, start: 0, end });
      return true;
    });
    expect(seeded).toBe(true);
    // After selection, fields with `Value::Length(None)` ("inherit
    // default") render as 0 in the LengthInput rather than em-dash
    // — same null-vs-mixed distinction the Character panel uses.
    // Em-dash should appear only when paragraphs in the range
    // disagree. Default fixture paragraphs all have None for
    // space_before/space_after/first_line_indent, which is uniform,
    // so the snapshot returns Some(Length(None)) and the leaf
    // renders 0. Em-dash count: 0.
    await expect
      .poll(
        async () =>
          await page
            .locator('[data-paragraph-panel="ready"] [data-mixed]')
            .count(),
      )
      .toBe(0);
  });
});
