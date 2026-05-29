// Inspector P1 — structured property panel for the selected
// element. Reads `ElementProperties` from the worker, dispatches
// edits through the generic `SetElementProperty` mutation, and
// re-fetches on every `mutationApplied` / `undoApplied` /
// `redoApplied` so the displayed values stay live (A1 from
// `docs/old/inspector.md` §A1-A4).
//
// v1 covers frame-level properties only — bounds, transform, fill,
// stroke colour, stroke weight, opacity. Story / paragraph /
// character / object-style edits are added as the apply layer's
// supported (NodeId, PropertyPath) combinations expand.

import { useEffect, useMemo, useState } from "react";

import { BoundsInput, ColorPicker, LengthInput, NumberInput } from "@verso/ui";
import { useCanvasClient, useSelection } from "@verso/shell";

import type {
  ElementId,
  ElementProperties,
  PropertyEntry,
  PropertyPath,
  Value,
} from "../channel/protocol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

export function InspectorPanel(_: PanelProps) {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const target = elementSelection.length === 1 ? elementSelection[0] : null;
  const [props, setProps] = useState<ElementProperties | null>(null);

  // Re-fetch on selection change OR when the document mutates so the
  // values stay live (A1). The worker pushes mutationApplied /
  // undoApplied / redoApplied after any committed mutation; either
  // edge invalidates our cached snapshot.
  useEffect(() => {
    if (!target) {
      setProps(null);
      return;
    }
    let cancelled = false;
    const fetch = () => {
      void client
        .elementProperties(target)
        .then((next) => {
          if (!cancelled) setProps(next);
        })
        .catch(() => {
          if (!cancelled) setProps(null);
        });
    };
    fetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        fetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, target?.kind, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) {
    return (
      <div className="p-3 text-sm text-muted-foreground" data-inspector="empty">
        Select an element to inspect.
      </div>
    );
  }
  if (!props) {
    return (
      <div className="p-3 text-sm text-muted-foreground" data-inspector="loading">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 text-sm" data-inspector="ready">
      <Header kind={props.kind} id={target.id} />
      <div className="space-y-2">
        {props.entries.map((entry) => (
          <PropertyRow
            key={entry.path}
            entry={entry}
            onCommit={(next) => commit(client, target, entry.path, next)}
          />
        ))}
      </div>
    </div>
  );
}

function Header(props: { kind: string; id: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-input">
      <span className="font-medium" data-inspector-kind>
        {props.kind}
      </span>
      <span className="text-xs text-muted-foreground" data-inspector-id>
        {props.id}
      </span>
    </div>
  );
}

function PropertyRow(props: {
  entry: PropertyEntry;
  onCommit: (next: Value) => void;
}) {
  const { entry, onCommit } = props;
  return (
    <div
      className="grid grid-cols-[8rem_1fr] items-center gap-2"
      data-property={entry.path}
    >
      <label className="text-xs text-muted-foreground">
        {labelForPath(entry.path)}
      </label>
      {entry.value === null || entry.value === undefined ? (
        // SDK Phase 3 — `PropertyEntry.value: Option<Value>` lands a
        // `null` when the read snapshot can't pick a single winner
        // (e.g. a `NodeId::StoryRange` whose `CharacterRun`s carry
        // different values for this path). Render an em-dash so the
        // user sees "mixed" rather than a confusing default.
        <span className="text-xs text-muted-foreground" data-mixed>
          —
        </span>
      ) : (
        <ValueEditor value={entry.value} onCommit={onCommit} />
      )}
    </div>
  );
}

function ValueEditor(props: { value: Value; onCommit: (v: Value) => void }) {
  const { value, onCommit } = props;
  switch (value.type) {
    case "bounds":
      return (
        <BoundsInput
          valuePt={value.value as [number, number, number, number]}
          onChangePt={(next) =>
            onCommit({ type: "bounds", value: next } as Value)
          }
        />
      );
    case "colorRef":
      return (
        <ColorPicker
          value={value.value}
          onCommit={(next) =>
            onCommit({ type: "colorRef", value: next } as Value)
          }
        />
      );
    case "length":
      return (
        <LengthInput
          valuePt={value.value ?? 0}
          onChangePt={(next) =>
            onCommit({ type: "length", value: next } as Value)
          }
        />
      );
    case "transform":
      return <TransformEditor value={value} onCommit={onCommit} />;
    default:
      return (
        <span className="text-xs text-muted-foreground">
          (unsupported: {value.type})
        </span>
      );
  }
}

function TransformEditor(props: {
  value: Extract<Value, { type: "transform" }>;
  onCommit: (v: Value) => void;
}) {
  const m = useMemo(
    () => props.value.value ?? [1, 0, 0, 1, 0, 0],
    [props.value.value],
  );
  const labels = ["a", "b", "c", "d", "tx", "ty"];
  return (
    <div className="grid grid-cols-3 gap-1" data-transform-editor>
      {m.map((cell, idx) => (
        <NumberInput
          key={idx}
          value={cell}
          label={labels[idx]}
          onChange={() => {
            /* live updates ignored; commit on Enter/blur */
          }}
          onCommit={(next) => {
            const out = [...m] as [number, number, number, number, number, number];
            out[idx] = next;
            props.onCommit({ type: "transform", value: out } as Value);
          }}
        />
      ))}
    </div>
  );
}

function labelForPath(path: PropertyPath): string {
  switch (path) {
    case "frameBounds":
      return "Bounds";
    case "frameTransform":
      return "Transform";
    case "frameFillColor":
      return "Fill";
    case "frameStrokeColor":
      return "Stroke";
    case "frameStrokeWeight":
      return "Weight";
    case "frameOpacity":
      return "Opacity";
    default:
      return path;
  }
}

async function commit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  target: ElementId,
  path: PropertyPath,
  value: Value,
) {
  try {
    await client.mutate({
      op: "setElementProperty",
      args: { elementId: target, path, value },
    });
  } catch (err) {
    // Worker rejected (e.g. unsupported (NodeId, PropertyPath)).
    // Future polish: surface the error inline.
    // eslint-disable-next-line no-console
    console.warn("inspector commit failed:", err);
  }
}
