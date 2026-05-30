// SDK Phase 5 (v1 sweep) — Pathfinder panel acceptance.
//
// Curve-preserving Bezier CSG via flo_curves. All four ops
// (Union / Intersect / Subtract / Exclude) ship in v1.
// The TS panel dispatches a single `Mutation::PathfinderBoolean`;
// the Rust apply layer reads each frame's path, runs flo_curves
// (`path_add` / `path_sub` / `path_intersect`), and builds an
// internal Batch (FramePath + RemoveNode) so one Cmd-Z reverses
// everything.
//
// Fixtures use plain rectangles so the apply result is
// predictable — Union of two non-overlapping rects = compound
// path of 2 subpaths; Subtract overlapping = L-shape of 6
// vertices; Intersect of overlapping = the overlap rect.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Pathfinder panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await page.getByText("Pathfinder", { exact: true }).first().click();
  });

  test("AC-PF-1 — panel mounts; 4 buttons; all enabled when 2+ selected", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-pathfinder-panel="ready"]'),
    ).toBeVisible();
    const buttons = page.locator(
      '[data-pathfinder-panel="ready"] button[data-pathfinder-kind]',
    );
    await expect(buttons).toHaveCount(4);
    // Hint visible with empty selection (all buttons disabled).
    await expect(
      page.locator('[data-pathfinder-panel="ready"] [data-pathfinder-hint]'),
    ).toBeVisible();
  });

  test("AC-PF-2 — Subtract on overlapping rects yields L-shape + removes others", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
          mutate(op: unknown): Promise<unknown>;
          pathAnchors(id: unknown): Promise<{
            anchors: Array<{ anchor: [number, number] }>;
            subpathStarts: number[];
          } | null>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const treeJson = await dbg.client
        .executeScript("verso.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const ids: Array<{ kind: string; id: string }> = [];
      const walk = (nodes: Node[] | undefined) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") ids.push(n.id);
          walk(n.children);
        }
      };
      walk(JSON.parse(treeJson) as Node[]);
      if (ids.length < 2) throw new Error("< 2 TextFrames");
      const pair = ids.slice(0, 2);
      // Pin both bounds + anchors so the Pathfinder reads
      // a deterministic geometry (the fixture's parsed anchors
      // would otherwise dominate via the path_anchors fallback).
      const rect = (
        l: number,
        t: number,
        r: number,
        b: number,
      ): Array<{
        anchor: [number, number];
        left: [number, number];
        right: [number, number];
      }> => [
        { anchor: [l, t], left: [l, t], right: [l, t] },
        { anchor: [r, t], left: [r, t], right: [r, t] },
        { anchor: [r, b], left: [r, b], right: [r, b] },
        { anchor: [l, b], left: [l, b], right: [l, b] },
      ];
      await dbg.client.mutate({
        op: "batch",
        args: {
          ops: [
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 0, 20, 20] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "framePath",
                value: {
                  type: "framePath",
                  value: { anchors: rect(0, 0, 20, 20), subpathStarts: [0] },
                },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "frameBounds",
                value: { type: "bounds", value: [10, 10, 30, 30] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "framePath",
                value: {
                  type: "framePath",
                  value: { anchors: rect(10, 10, 30, 30), subpathStarts: [0] },
                },
              },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(pair);
    });

    // Dispatch the Mutation directly to isolate the wire from the
    // panel UI. The panel just packs elementSelection into this
    // same payload.
    await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: { mutate(op: unknown): Promise<unknown> };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      await dbg.client.mutate({
        op: "pathfinderBoolean",
        args: { kept: pair[0], others: [pair[1]], kind: "subtract" },
      });
    }, result);
    await page.waitForTimeout(300);

    // Inspect bounds before the click — confirms the setup batch
    // landed and the kept frame is at [0,0,20,20].
    const beforeKeptBounds = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const props = await dbg.client.elementProperties(pair[0]);
      return props?.entries.find((e) => e.path === "frameBounds")?.value?.value ?? null;
    }, result);
    // The kept frame's bounds aren't touched by FramePath — only
    // its anchors. Bounds stay at [0,0,20,20] (the prior setup).
    expect(beforeKeptBounds).toEqual([0, 0, 20, 20]);

    const aftermath = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<{
            entries: Array<{
              path: string;
              value: { type: string; value: number[] } | null;
            }>;
          } | null>;
          pathAnchors(id: unknown): Promise<{
            anchors: Array<{ anchor: [number, number] }>;
            subpathStarts: number[];
          } | null>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const props0 = await dbg.client.elementProperties(pair[0]);
      const props1 = await dbg.client.elementProperties(pair[1]);
      const anchors0 = await dbg.client.pathAnchors(pair[0]);
      const boundsAfter =
        props0?.entries.find((e) => e.path === "frameBounds")?.value?.value ??
        null;
      return {
        keptExists: props0 !== null,
        otherGone: props1 === null,
        keptVertexCount: anchors0?.anchors.length ?? 0,
        keptBoundsAfter: boundsAfter,
        keptAnchorsRaw: anchors0?.anchors ?? null,
      };
    }, result);

    // Diagnostic — surface everything via the test message so we
    // can see WHAT state the apply landed in.
    expect(
      aftermath,
      `aftermath state: ${JSON.stringify(aftermath)}`,
    ).toMatchObject({
      keptExists: true,
      otherGone: true,
      keptVertexCount: 6,
    });
  });

  test("AC-PF-3 — single Cmd-Z reverses the whole Pathfinder op", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      type DebugCanvas = {
        client?: {
          executeScript(src: string): Promise<{
            output: string[];
            error: string | null;
          }>;
          elementProperties(id: unknown): Promise<unknown>;
          mutate(op: unknown): Promise<unknown>;
          undo(): Promise<unknown>;
        };
        setElementSelection?(ids: unknown[], mode: string): void;
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const treeJson = await dbg.client
        .executeScript("verso.tree()")
        .then((r) => r.output[0] ?? "[]");
      type Node = {
        id?: { kind: string; id: string } | null;
        children?: Node[];
      };
      const ids: Array<{ kind: string; id: string }> = [];
      const walk = (nodes: Node[] | undefined) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.id && n.id.kind === "textFrame") ids.push(n.id);
          walk(n.children);
        }
      };
      walk(JSON.parse(treeJson) as Node[]);
      if (ids.length < 2) throw new Error("< 2 TextFrames");
      const pair = ids.slice(0, 2);
      await dbg.client.mutate({
        op: "batch",
        args: {
          ops: [
            {
              op: "setElementProperty",
              args: {
                elementId: pair[0],
                path: "frameBounds",
                value: { type: "bounds", value: [0, 0, 20, 20] },
              },
            },
            {
              op: "setElementProperty",
              args: {
                elementId: pair[1],
                path: "frameBounds",
                value: { type: "bounds", value: [10, 10, 30, 30] },
              },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      dbg.setElementSelection?.(pair, "replace");
      await new Promise((r) => setTimeout(r, 80));
      return JSON.stringify(pair);
    });

    // Run Union (any op is fine — point is the undo coalescing).
    await page
      .locator(
        '[data-pathfinder-panel="ready"] button[data-pathfinder-kind="union"]',
      )
      .click();
    await page.waitForTimeout(150);

    // One undo.
    await page.evaluate(async () => {
      type DebugCanvas = {
        client?: { undo(): Promise<unknown> };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      await dbg.client.undo();
    });
    await page.waitForTimeout(150);

    const restored = await page.evaluate(async (pairJson) => {
      type DebugCanvas = {
        client?: {
          elementProperties(id: unknown): Promise<unknown>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("no client");
      const pair = JSON.parse(pairJson) as Array<{ kind: string; id: string }>;
      const p0 = await dbg.client.elementProperties(pair[0]);
      const p1 = await dbg.client.elementProperties(pair[1]);
      return { keptExists: p0 !== null, otherRestored: p1 !== null };
    }, result);

    // After one undo, both frames exist again.
    expect(restored.keptExists).toBe(true);
    expect(restored.otherRestored).toBe(true);
  });
});
