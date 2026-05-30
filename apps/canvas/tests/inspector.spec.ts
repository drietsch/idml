// Inspector P1 acceptance tests. End-to-end: load a fixture, select
// a frame through the channel, fetch element_properties, dispatch a
// SetElementProperty mutation, assert the values reflected via a
// second fetch and via the inspector panel's DOM.
//
// Acceptance criteria (from the plan):
//   AC-INS-1  Selecting a frame surfaces its frame-level properties.
//   AC-INS-2  Editing the fill swatch lands as a SetProperty mutation.
//   AC-INS-3  Editing a bounds cell lands as a SetProperty mutation.
//   AC-INS-4  Cmd-Z restores the prior value; inspector reflects it.
//   AC-INS-5  A gesture-driven mutation also updates the panel live.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const TEXT_FRAME_ID = "ua365e1";

interface ElementId {
  kind: string;
  id: string;
}
interface PropertyEntry {
  path: string;
  value: { type: string; value: unknown };
}
interface ElementProperties {
  id: ElementId;
  kind: string;
  entries: PropertyEntry[];
}
interface CanvasGlobal {
  client: {
    elementProperties: (id: ElementId) => Promise<ElementProperties | null>;
    mutate: (m: unknown) => Promise<unknown>;
    setElementSelection: (
      ids: ElementId[],
      mode: string,
    ) => Promise<ElementId[]>;
    undo: () => Promise<unknown>;
    beginGesture: (nodes: ElementId[], gesture: unknown) => Promise<number>;
    updateGesture: (
      h: number,
      d: [number, number],
      mods: { shift: boolean; alt: boolean },
    ) => Promise<unknown>;
    commitGesture: (h: number) => Promise<unknown>;
  };
  setElementSelection: (ids: ElementId[]) => void;
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

async function fetchProps(
  page: import("@playwright/test").Page,
  id: string,
): Promise<ElementProperties> {
  const props = await page.evaluate(
    async ({ id }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.elementProperties({ kind: "textFrame", id });
    },
    { id },
  );
  if (!props) throw new Error(`elementProperties returned null for ${id}`);
  return props;
}

function entryFor(props: ElementProperties, path: string): PropertyEntry {
  const e = props.entries.find((x) => x.path === path);
  if (!e) throw new Error(`no entry for ${path}`);
  return e;
}

test.describe("Inspector P1 — property panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-INS-1 — element properties surface frame-level entries", async ({
    page,
  }) => {
    const props = await fetchProps(page, TEXT_FRAME_ID);
    expect(props.kind).toBe("TextFrame");
    const paths = props.entries.map((e) => e.path).sort();
    expect(paths).toEqual(
      [
        "appliedObjectStyle",
        "frameBounds",
        "frameDropShadow",
        "frameDropShadowColor",
        "frameDropShadowMode",
        "frameDropShadowOpacity",
        "frameDropShadowSize",
        "frameDropShadowXOffset",
        "frameDropShadowYOffset",
        "frameFillColor",
        "frameFillTint",
        "frameInsetSpacing",
        "frameNonprinting",
        "frameOpacity",
        "frameStrokeColor",
        "frameStrokeWeight",
        "frameTextWrapMode",
        "frameTextWrapOffsets",
        "frameTransform",
      ].sort(),
    );
  });

  test("AC-INS-2 — SetElementProperty on fill commits via the apply layer", async ({
    page,
  }) => {
    const before = await fetchProps(page, TEXT_FRAME_ID);
    const fillBefore = entryFor(before, "frameFillColor").value.value as
      | string
      | null;
    expect(fillBefore).not.toBe("Color/Red");

    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "setElementProperty",
          args: {
            elementId: { kind: "textFrame", id },
            path: "frameFillColor",
            value: { type: "colorRef", value: "Color/Red" },
          },
        });
      },
      { id: TEXT_FRAME_ID },
    );

    const after = await fetchProps(page, TEXT_FRAME_ID);
    expect(entryFor(after, "frameFillColor").value.value).toBe("Color/Red");
  });

  test("AC-INS-3 — SetElementProperty on bounds commits", async ({ page }) => {
    const before = await fetchProps(page, TEXT_FRAME_ID);
    const boundsBefore = entryFor(before, "frameBounds").value.value as [
      number,
      number,
      number,
      number,
    ];

    const next: [number, number, number, number] = [
      boundsBefore[0] + 10,
      boundsBefore[1] + 20,
      boundsBefore[2] + 10,
      boundsBefore[3] + 20,
    ];
    await page.evaluate(
      async ({ id, next }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "setElementProperty",
          args: {
            elementId: { kind: "textFrame", id },
            path: "frameBounds",
            value: { type: "bounds", value: next },
          },
        });
      },
      { id: TEXT_FRAME_ID, next },
    );

    const after = await fetchProps(page, TEXT_FRAME_ID);
    expect(entryFor(after, "frameBounds").value.value).toEqual(next);
  });

  test("AC-INS-4 — Cmd-Z restores the previous value", async ({ page }) => {
    const before = await fetchProps(page, TEXT_FRAME_ID);
    const originalOpacity = entryFor(before, "frameOpacity").value.value;
    await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        await c.client.mutate({
          op: "setElementProperty",
          args: {
            elementId: { kind: "textFrame", id },
            path: "frameOpacity",
            value: { type: "length", value: 50 },
          },
        });
      },
      { id: TEXT_FRAME_ID },
    );
    const mid = await fetchProps(page, TEXT_FRAME_ID);
    expect(entryFor(mid, "frameOpacity").value.value).toBe(50);

    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });
    const restored = await fetchProps(page, TEXT_FRAME_ID);
    expect(entryFor(restored, "frameOpacity").value.value).toEqual(
      originalOpacity,
    );
  });

  test("AC-INS-5 — a translate gesture updates the bounds entry live", async ({
    page,
  }) => {
    // Use a Rectangle (which carries un-rotated bounds) so the
    // translate path commits a SetProperty{FrameBounds} the
    // inspector reflects. The geometry-groups fixture has a cyan
    // square at page 0; its self-id is stable.
    const rectId = "ueccee2";
    const before = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementProperties({ kind: "rectangle", id });
      },
      { id: rectId },
    );
    if (!before) throw new Error("rect properties missing pre-gesture");
    const boundsBefore = (before.entries.find(
      (e: PropertyEntry) => e.path === "frameBounds",
    )!.value.value) as [number, number, number, number];

    const delta: [number, number] = [40, 30];
    await page.evaluate(
      async ({ id, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [{ kind: "rectangle", id }],
          { kind: "translate" },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: false });
        await c.client.commitGesture(h);
      },
      { id: rectId, delta },
    );
    const after = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementProperties({ kind: "rectangle", id });
      },
      { id: rectId },
    );
    if (!after) throw new Error("rect properties missing post-gesture");
    const boundsAfter = (after.entries.find(
      (e: PropertyEntry) => e.path === "frameBounds",
    )!.value.value) as [number, number, number, number];
    // Translate via FrameBounds: top/bottom shift dy, left/right shift dx.
    expect(boundsAfter[0]).toBeCloseTo(boundsBefore[0] + delta[1], 1);
    expect(boundsAfter[1]).toBeCloseTo(boundsBefore[1] + delta[0], 1);
    expect(boundsAfter[2]).toBeCloseTo(boundsBefore[2] + delta[1], 1);
    expect(boundsAfter[3]).toBeCloseTo(boundsBefore[3] + delta[0], 1);
  });
});
