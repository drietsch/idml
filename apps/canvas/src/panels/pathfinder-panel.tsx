// SDK Phase 5 (v1 sweep) — Pathfinder panel.
//
// Multi-target geometry ops. Per `panel-catalog-and-sdk-extension.md`
// §6 Tier 3 + §10 audit register: declares `writes: ["geometry"]`.
//
// v1 ships only **Union** as a working op — implemented via
// axis-aligned bounding-box math (the kept frame's bounds expand
// to enclose the union of the inputs; the other frames are
// removed). True path-boolean ops (Bezier-precise
// union/intersect/subtract/exclude) need polygon CSG math that
// the workspace doesn't have a dep for yet; the three other
// buttons are stubbed (disabled with a "v2" title) so the panel
// inventory is complete without lying about behaviour.
//
// The kept frame is the first id in `elementSelection`. The
// commit dispatches as a single `Mutation::Batch` so one undo
// reverts the whole pathfinder operation.

import {
  useCanvasClient,
  useSelection,
} from "@verso/shell";
import type { ElementId } from "@verso/client";

type PathfinderKind = "union" | "subtract" | "intersect" | "exclude";

const BUTTONS: Array<{
  kind: PathfinderKind;
  label: string;
  hint: string;
  v1: boolean;
}> = [
  { kind: "union", label: "Union", hint: "Combine paths (Union, BBox)", v1: true },
  {
    kind: "intersect",
    label: "Intersect",
    hint: "Intersect paths (BBox)",
    v1: true,
  },
  {
    kind: "subtract",
    label: "Subtract",
    hint: "Subtract — needs Bezier CSG (v2)",
    v1: false,
  },
  {
    kind: "exclude",
    label: "Exclude",
    hint: "Exclude — needs Bezier CSG (v2)",
    v1: false,
  },
];

export function PathfinderPanel() {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const enabled = elementSelection.length >= 2;

  async function run(kind: PathfinderKind) {
    if (!enabled) return;
    if (kind !== "union" && kind !== "intersect") {
      // v2 op — UI is disabled but guard the apply path too.
      return;
    }
    // 1. Snapshot every selected frame's bounds.
    const entries: Array<{
      id: ElementId;
      bounds: [number, number, number, number];
    }> = [];
    for (const id of elementSelection) {
      const props = await client.elementProperties(id);
      const b = props?.entries.find((e) => e.path === "frameBounds")?.value;
      if (b && b.type === "bounds" && Array.isArray(b.value) && b.value.length === 4) {
        entries.push({
          id,
          bounds: b.value as [number, number, number, number],
        });
      }
    }
    if (entries.length < 2) return;
    // 2. Compute the result BBox per kind.
    let resultBounds: [number, number, number, number];
    if (kind === "union") {
      let top = Number.POSITIVE_INFINITY;
      let left = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      for (const { bounds } of entries) {
        if (bounds[0] < top) top = bounds[0];
        if (bounds[1] < left) left = bounds[1];
        if (bounds[2] > bottom) bottom = bounds[2];
        if (bounds[3] > right) right = bounds[3];
      }
      resultBounds = [top, left, bottom, right];
    } else {
      // intersect — intersection BBox; empty if zero-overlap.
      let top = Number.NEGATIVE_INFINITY;
      let left = Number.NEGATIVE_INFINITY;
      let bottom = Number.POSITIVE_INFINITY;
      let right = Number.POSITIVE_INFINITY;
      for (const { bounds } of entries) {
        if (bounds[0] > top) top = bounds[0];
        if (bounds[1] > left) left = bounds[1];
        if (bounds[2] < bottom) bottom = bounds[2];
        if (bounds[3] < right) right = bounds[3];
      }
      // Empty intersection: collapse to no-op (don't destroy
      // anything silently — the user can re-try with overlapping
      // frames).
      if (top >= bottom || left >= right) return;
      resultBounds = [top, left, bottom, right];
    }
    // 3. Build a Batch — first SetElementProperty(kept, bounds,
    //    resultBbox), then RemoveNode for every other frame.
    const kept = entries[0];
    const ops: Array<unknown> = [];
    ops.push({
      op: "setElementProperty",
      args: {
        elementId: kept.id,
        path: "frameBounds",
        value: { type: "bounds", value: resultBounds },
      },
    });
    for (let i = 1; i < entries.length; i++) {
      ops.push({
        op: "deleteFrame",
        args: { frameId: rawIdOf(entries[i].id) },
      });
    }
    await client.mutate({
      op: "batch",
      args: { ops: ops as never },
    });
  }

  return (
    <div className="p-3 flex flex-col gap-2" data-pathfinder-panel="ready">
      <div className="text-xs text-muted-foreground uppercase">
        Pathfinder
      </div>
      <div
        className="grid grid-cols-2 gap-1"
        role="group"
        aria-label="Pathfinder"
      >
        {BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.kind}
            data-pathfinder-kind={btn.kind}
            data-v1={btn.v1 ? "true" : "false"}
            disabled={!enabled || !btn.v1}
            title={btn.hint}
            className="text-xs px-2 py-1 border border-input rounded bg-background hover:bg-muted/60 disabled:opacity-50"
            onClick={() => {
              void run(btn.kind);
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
      {enabled ? null : (
        <div
          className="text-xs text-muted-foreground"
          data-pathfinder-hint
        >
          Select 2 or more frames to combine.
        </div>
      )}
      <div
        className="text-xs text-muted-foreground"
        data-pathfinder-v2-note
      >
        Subtract / Intersect / Exclude need Bezier CSG (v2).
      </div>
    </div>
  );
}

/** Extract the raw IDML `Self` id from an `ElementId`. The wire
 *  shape carries `{ kind, id }` for most variants; `StoryRange` is
 *  a different beast but Pathfinder never targets it. */
function rawIdOf(elementId: ElementId): string {
  const e = elementId as unknown as {
    kind: string;
    id: string | { story_id?: string };
  };
  if (typeof e.id === "string") return e.id;
  // StoryRange isn't a pathfinder target — fall through to the
  // story_id for completeness.
  return (e.id?.story_id ?? "") as string;
}
