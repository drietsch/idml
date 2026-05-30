// SDK Phase 5 — Character Styles panel acceptance.
//
// Direct twin of `paragraph-styles-panel.spec.ts`. Validates the
// §9 "≥2 panels" rule for VERSO_INPUT_COLLECTION_SELECT — the
// same primitive driving Paragraph Styles also drives this panel,
// parameterised by `collectionName` + the bound property path.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Character Styles panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page
      .getByText("Character Styles", { exact: true })
      .first()
      .click();
  });

  test("AC-CSTYLE-1 — panel mounts as a composition with a select", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-character-styles-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-character-styles-panel="ready"] select[data-collection="characterStyles"]',
      ),
    ).toBeVisible();
  });

  test("AC-CSTYLE-2 — selecting a style writes appliedCharacterStyle through the apply layer", async ({
    page,
  }) => {
    const selectedSelfId = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
        };
        setContentSelection?(sel: {
          storyId: string;
          start: number;
          end: number;
        } | null): void;
      };
      const w = window as unknown as { __canvas?: DebugCanvas };
      const dbg = w.__canvas;
      if (!dbg?.client) {
        throw new Error("__canvas client not available");
      }

      const stories = await dbg.client
        .executeScript("verso.stories()")
        .then((r) => JSON.parse(r.output[0] ?? "[]"));
      if (!stories.length) throw new Error("fixture has no stories");
      const story = stories[0] as {
        selfId: string;
        characterCount: number;
      };
      const range = {
        storyId: story.selfId,
        start: 0,
        end: Math.max(1, Math.min(story.characterCount, 4)),
      };
      dbg.setContentSelection?.(range);
      await new Promise((r) => setTimeout(r, 50));

      const stylesJson = await dbg.client
        .executeScript("verso.characterStyles()")
        .then((r) => r.output[0] ?? "[]");
      const styles = JSON.parse(stylesJson);
      if (!styles.length) {
        throw new Error(
          `fixture has no character styles; raw=${stylesJson}`,
        );
      }
      const target = (styles as Array<{ selfId: string }>).find(
        (s) => s.selfId && s.selfId.length > 0,
      );
      if (!target) {
        throw new Error(
          `no character style with a non-empty selfId; styles=${stylesJson}`,
        );
      }

      const setResult = await dbg.client.executeScript(
        `verso.set("storyRange:${range.storyId}@${range.start}..${range.end}",
                   "appliedCharacterStyle",
                   ${JSON.stringify(target.selfId)});`,
      );
      if (setResult.error) {
        throw new Error(`verso.set errored: ${setResult.error}`);
      }
      // verso.set returns the boolean apply-success indicator as the
      // script's terminal expression.
      const setOk = setResult.output[0]?.trim();
      if (setOk !== "true") {
        throw new Error(
          `verso.set returned ${setOk}; target.selfId=${target.selfId}`,
        );
      }
      await new Promise((r) => setTimeout(r, 50));

      const inspectJson = await dbg.client
        .executeScript(
          `verso.inspect("storyRange:${range.storyId}@${range.start}..${range.end}");`,
        )
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{ path: string; value: { value: string } | null }>;
      };
      const entry = inspect.entries.find(
        (e) => e.path === "appliedCharacterStyle",
      );
      return entry?.value?.value ?? null;
    });

    expect(selectedSelfId).toBeTruthy();
  });
});
