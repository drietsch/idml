// SDK Phase 5 (v1 sweep) — toggle-group primitive acceptance.
//
// Validates the §9 segmented-toggle primitive through its first
// two users (≥2-panels rule): Paragraph alignment + Stroke
// end-cap. Both bind a Value::Text to an enum-string property
// path and commit the picked option's `value` as the new Text
// payload.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — toggle-group primitive", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-TG-1 — paragraph alignment toggle-group writes paragraphJustification", async ({
    page,
  }) => {
    const applied = await page.evaluate(async () => {
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
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");
      const storiesJson = await dbg.client
        .executeScript("verso.stories()")
        .then((r) => r.output[0] ?? "[]");
      const stories = JSON.parse(storiesJson) as Array<{
        selfId: string;
        characterCount: number;
      }>;
      if (!stories.length) throw new Error("no stories");
      const story = stories[0];
      const range = {
        storyId: story.selfId,
        start: 0,
        end: Math.max(1, Math.min(story.characterCount, 4)),
      };
      dbg.setContentSelection?.(range);
      await new Promise((r) => setTimeout(r, 50));

      const setResult = await dbg.client.executeScript(
        `verso.set("storyRange:${range.storyId}@${range.start}..${range.end}",
                   "paragraphJustification",
                   "RightAlign");`,
      );
      if (setResult.error) throw new Error(setResult.error);
      if (setResult.output[0]?.trim() !== "true") {
        throw new Error(
          `verso.set returned ${setResult.output[0]}; expected "true"`,
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
        (e) => e.path === "paragraphJustification",
      );
      return entry?.value?.value ?? null;
    });

    expect(applied).toBe("RightAlign");
  });

  test("AC-TG-2 — stroke end-cap toggle-group writes frameStrokeEndCap on Rectangle", async ({
    page,
  }) => {
    const applied = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");

      // Find the first Rectangle id in the fixture's tree.
      const treeJson = await dbg.client
        .executeScript("verso.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const walk = (nodes: Node[] | undefined): Node["id"] => {
        if (!nodes) return null;
        for (const n of nodes) {
          if (n.id && n.id.kind === "rectangle") return n.id;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      const target = walk(JSON.parse(treeJson) as Node[]);
      if (!target) throw new Error("fixture has no Rectangle");

      const addr = `${target.kind}:${target.id}`;
      const setResult = await dbg.client.executeScript(
        `verso.set(${JSON.stringify(addr)}, "frameStrokeEndCap", "RoundEndCap");`,
      );
      if (setResult.error) throw new Error(setResult.error);
      if (setResult.output[0]?.trim() !== "true") {
        throw new Error(
          `verso.set returned ${setResult.output[0]}; expected "true"`,
        );
      }
      await new Promise((r) => setTimeout(r, 50));

      const inspectJson = await dbg.client
        .executeScript(`verso.inspect(${JSON.stringify(addr)});`)
        .then((r) => r.output[0] ?? "");
      const inspect = JSON.parse(inspectJson) as {
        entries: Array<{ path: string; value: { value: string } | null }>;
      };
      const entry = inspect.entries.find(
        (e) => e.path === "frameStrokeEndCap",
      );
      return entry?.value?.value ?? null;
    });

    expect(applied).toBe("RoundEndCap");
  });
});
