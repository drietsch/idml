// SDK Phase 5 (v1 sweep) — Align panel.
//
// Six-button alignment palette: align-left / -center-h / -right
// + align-top / -center-v / -bottom. Reads the current element
// selection + each frame's bounds, computes the target
// coordinate per kind (selection AABB edges or center), and
// dispatches a sequence of SetElementProperty(FrameBounds)
// mutations through the existing wire. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 3 + §10 audit
// register: declares `writes: ["geometry"]` since the commit set
// is a multi-target rewrite of frame bounds.
//
// v1 limitation: each frame is its own mutation entry on the
// undo stack (the wire-level Mutation doesn't expose Batch), so
// "Align Left" on 4 frames takes 4 Cmd-Z presses to revert. A
// follow-up wire-level Mutation::Batch coalesces this.

import {
  useCanvasClient,
  useSelection,
} from "@paged-media/shell";
import type { ElementId } from "@paged-media/client";

type AlignKind =
  | "left"
  | "centerH"
  | "right"
  | "top"
  | "centerV"
  | "bottom"
  | "distributeH"
  | "distributeV";

const ALIGN_BUTTONS: Array<{ kind: AlignKind; label: string; hint: string }> = [
  { kind: "left", label: "L", hint: "Align Left" },
  { kind: "centerH", label: "C", hint: "Center Horizontally" },
  { kind: "right", label: "R", hint: "Align Right" },
  { kind: "top", label: "T", hint: "Align Top" },
  { kind: "centerV", label: "M", hint: "Center Vertically" },
  { kind: "bottom", label: "B", hint: "Align Bottom" },
];

const DISTRIBUTE_BUTTONS: Array<{ kind: AlignKind; label: string; hint: string }> = [
  { kind: "distributeH", label: "↔", hint: "Distribute Horizontally" },
  { kind: "distributeV", label: "↕", hint: "Distribute Vertically" },
];

export function AlignPanel() {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const enabled = elementSelection.length >= 2;

  async function align(kind: AlignKind) {
    if (elementSelection.length < 2) return;
    // 1. Snapshot each selected frame's bounds.
    const entries: Array<{ id: ElementId; bounds: [number, number, number, number] }> = [];
    for (const id of elementSelection) {
      const props = await client.elementProperties(id);
      const bounds = props?.entries.find((e) => e.path === "frameBounds")
        ?.value;
      if (
        bounds &&
        bounds.type === "bounds" &&
        Array.isArray(bounds.value) &&
        bounds.value.length === 4
      ) {
        entries.push({
          id,
          bounds: bounds.value as [number, number, number, number],
        });
      }
    }
    if (entries.length < 2) return;

    // 2. Compute the selection AABB.
    let minTop = Number.POSITIVE_INFINITY;
    let minLeft = Number.POSITIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    for (const { bounds } of entries) {
      const [top, left, bottom, right] = bounds;
      if (top < minTop) minTop = top;
      if (left < minLeft) minLeft = left;
      if (bottom > maxBottom) maxBottom = bottom;
      if (right > maxRight) maxRight = right;
    }

    // 3. Compute per-frame target bounds; collect into one batch.
    const children: Array<{
      op: "setElementProperty";
      args: {
        elementId: ElementId;
        path: "frameBounds";
        value: { type: "bounds"; value: [number, number, number, number] };
      };
    }> = [];

    // Distribute paths have their own routine (sort + interleave).
    // The alignment kinds compute per-frame independently.
    if (kind === "distributeH" || kind === "distributeV") {
      // Need ≥3 frames to distribute meaningfully (2 frames already
      // sit at the extremes).
      if (entries.length < 3) return;
      // Sort by center on the relevant axis.
      const axis = kind === "distributeH" ? "h" : "v";
      const center = (b: [number, number, number, number]) =>
        axis === "h" ? (b[1] + b[3]) / 2 : (b[0] + b[2]) / 2;
      const sorted = entries.slice().sort((a, b) => center(a.bounds) - center(b.bounds));
      const firstC = center(sorted[0].bounds);
      const lastC = center(sorted[sorted.length - 1].bounds);
      const step = (lastC - firstC) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        const { id, bounds } = sorted[i];
        const [top, left, bottom, right] = bounds;
        const w = right - left;
        const h = bottom - top;
        const targetCenter = firstC + step * i;
        let nTop = top;
        let nLeft = left;
        if (axis === "h") {
          nLeft = targetCenter - w / 2;
        } else {
          nTop = targetCenter - h / 2;
        }
        if (
          Math.abs(nTop - top) < 1e-3 &&
          Math.abs(nLeft - left) < 1e-3
        ) {
          continue;
        }
        children.push({
          op: "setElementProperty",
          args: {
            elementId: id,
            path: "frameBounds",
            value: {
              type: "bounds",
              value: [nTop, nLeft, nTop + h, nLeft + w],
            },
          },
        });
      }
    } else {
      for (const { id, bounds } of entries) {
        const [top, left, bottom, right] = bounds;
        const w = right - left;
        const h = bottom - top;
        let nTop = top;
        let nLeft = left;
        switch (kind) {
          case "left":
            nLeft = minLeft;
            break;
          case "right":
            nLeft = maxRight - w;
            break;
          case "centerH":
            nLeft = (minLeft + maxRight - w) / 2;
            break;
          case "top":
            nTop = minTop;
            break;
          case "bottom":
            nTop = maxBottom - h;
            break;
          case "centerV":
            nTop = (minTop + maxBottom - h) / 2;
            break;
        }
        const nBottom = nTop + h;
        const nRight = nLeft + w;
        if (
          Math.abs(nTop - top) < 1e-3 &&
          Math.abs(nLeft - left) < 1e-3
        ) {
          continue;
        }
        children.push({
          op: "setElementProperty",
          args: {
            elementId: id,
            path: "frameBounds",
            value: {
              type: "bounds",
              value: [nTop, nLeft, nBottom, nRight],
            },
          },
        });
      }
    }
    if (children.length === 0) return;
    // 4. Dispatch as a single Mutation::Batch — one undo entry
    //    coalesces the whole multi-target rewrite.
    await client.mutate({
      op: "batch",
      args: { ops: children },
    });
  }

  const distributeEnabled = elementSelection.length >= 3;
  return (
    <div className="p-3 flex flex-col gap-2" data-align-panel="ready">
      <div className="text-xs text-muted-foreground uppercase">
        Align
      </div>
      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Align">
        {ALIGN_BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.kind}
            data-align-kind={btn.kind}
            disabled={!enabled}
            title={btn.hint}
            className="text-xs px-2 py-1 border border-input rounded bg-background hover:bg-muted/60 disabled:opacity-50"
            onClick={() => {
              void align(btn.kind);
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="text-xs text-muted-foreground uppercase pt-2 border-t border-input">
        Distribute
      </div>
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Distribute">
        {DISTRIBUTE_BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.kind}
            data-align-kind={btn.kind}
            disabled={!distributeEnabled}
            title={btn.hint}
            className="text-xs px-2 py-1 border border-input rounded bg-background hover:bg-muted/60 disabled:opacity-50"
            onClick={() => {
              void align(btn.kind);
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
      {enabled ? null : (
        <div
          className="text-xs text-muted-foreground"
          data-align-hint
        >
          Select 2 or more frames to align.
        </div>
      )}
      {!distributeEnabled && enabled ? (
        <div
          className="text-xs text-muted-foreground"
          data-distribute-hint
        >
          Select 3 or more frames to distribute.
        </div>
      ) : null}
    </div>
  );
}
