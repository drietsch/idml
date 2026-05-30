// SDK Phase 5 (v1 sweep) — Pathfinder panel.
//
// Multi-target Bezier boolean ops. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 3 + §10 audit
// register: declares `writes: ["geometry"]`.
//
// All four ops (Union / Intersect / Subtract / Exclude) are
// curve-preserving — the Rust apply layer runs flo_curves CSG
// against the actual Bezier handles, not a polyline
// approximation. The TS panel is a thin dispatcher: collects
// the selection, packs it into a `Mutation::PathfinderBoolean`,
// and lets the Rust side do the math. One Cmd-Z reverses the
// entire op (replace + delete-others) via the inner Batch the
// Operation builds.

import { useCanvasClient, useSelection } from "@paged-media/shell";
import type { ElementId, PathfinderKind } from "@paged-media/client";

interface ButtonDef {
  kind: PathfinderKind;
  label: string;
  hint: string;
}

const BUTTONS: ButtonDef[] = [
  { kind: "union", label: "Union", hint: "Combine paths (Union)" },
  { kind: "intersect", label: "Intersect", hint: "Keep overlap (Intersect)" },
  { kind: "subtract", label: "Subtract", hint: "Top minus rest (Subtract)" },
  { kind: "exclude", label: "Exclude", hint: "Symmetric difference (Exclude)" },
];

export function PathfinderPanel() {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const enabled = elementSelection.length >= 2;

  async function run(kind: PathfinderKind) {
    if (!enabled) return;
    const [kept, ...others] = elementSelection as ElementId[];
    if (others.length === 0) return;
    await client.mutate({
      op: "pathfinderBoolean",
      args: { kept, others, kind },
    });
  }

  return (
    <div className="p-3 flex flex-col gap-2" data-pathfinder-panel="ready">
      <div className="text-xs text-muted-foreground uppercase">Pathfinder</div>
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
            disabled={!enabled}
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
    </div>
  );
}
