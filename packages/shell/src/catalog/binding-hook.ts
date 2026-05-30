// SDK Phase 3 — binding resolver hook.
//
// Given a `Binding`, returns the current resolved value and an
// `onCommit` callback that writes through the apply layer. The
// hook subscribes to selection changes + `mutationApplied` so the
// rendered leaf stays live.

import { useEffect, useMemo, useState } from "react";
import type {
  Binding,
  SelectionPropertyBinding,
} from "@verso/catalog";
import type { CanvasClient, ElementId, ElementProperties, Value } from "@verso/client";

import { useCanvasClient } from "../state/canvas-client-context";
import { useSelection } from "../state/selection-context";
import { useContentSelection } from "../state/content-selection-context";

/** Result of resolving a binding: `null` value = mixed /
 *  indeterminate / no selection. */
export interface ResolvedBinding {
  value: Value | null;
  onCommit?: (next: Value) => void;
}

/**
 * Hook returning resolved values + commit callbacks for the bindings
 * declared on a CompositionNode. Element-scope bindings read from
 * the visual element selection; content-scope bindings read from
 * the text content selection (constructed as
 * `ElementId::StoryRange` for the apply boundary). Both subscribe
 * to mutationApplied so the displayed values stay live (A1
 * invariant from docs/old/inspector.md §A1-A4).
 *
 * The returned map is keyed by the binding name in the composition
 * node — usually `"value"` for the leaf's primary binding, but a
 * leaf can declare multiple bindings (e.g. a BoundsInput with one
 * per cell).
 */
export function useBindings(
  bindings: Record<string, Binding>,
): Record<string, ResolvedBinding> {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();

  // Compute the canonical address for each binding's scope. Cache
  // the JSON-stringified shape so the dependency arrays don't
  // re-trigger on every render.
  const addresses = useMemo(
    () => computeAddresses(bindings, elementSelection, contentSelection),
    [bindings, elementSelection, contentSelection],
  );

  const [snapshot, setSnapshot] = useState<Map<string, ElementProperties | null>>(
    new Map(),
  );

  // Fetch the snapshot for every distinct ElementId referenced by
  // the bindings. Re-fetch on `mutationApplied` / `undoApplied` /
  // `redoApplied` so values stay live.
  useEffect(() => {
    const distinct = dedupeAddresses(addresses);
    if (distinct.length === 0) {
      setSnapshot(new Map());
      return;
    }
    let cancelled = false;
    const refetch = () => {
      Promise.all(
        distinct.map(async (id) => {
          try {
            return [JSON.stringify(id), await client.elementProperties(id)] as const;
          } catch {
            return [JSON.stringify(id), null] as const;
          }
        }),
      ).then((pairs) => {
        if (cancelled) return;
        setSnapshot(new Map(pairs));
      });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, addressesJson(addresses)]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => buildResolved(bindings, addresses, snapshot, client),
    [bindings, addresses, snapshot, client],
  );
}

// ----------------------------------------------------------------
// internals
// ----------------------------------------------------------------

/** The address each binding reads from / writes to. Element-scope
 *  bindings resolve to the selected ElementIds (array — multi-select
 *  supported; the binding hook fetches all of them and collapses to
 *  Some(uniform) or null (mixed) per the §5.6 "mixed" sentinel).
 *  Content-scope to a `StoryRange` derived from the content
 *  selection. Literal bindings have no address. */
type Address =
  | { kind: "element"; ids: ElementId[] }
  | { kind: "content"; id: ElementId }
  | { kind: "literal"; value: unknown }
  | null;

function computeAddresses(
  bindings: Record<string, Binding>,
  elementSelection: ElementId[],
  contentSelection: { storyId: string; start: number; end: number } | null,
): Record<string, Address> {
  const out: Record<string, Address> = {};
  for (const [name, binding] of Object.entries(bindings)) {
    if (binding.kind === "literal") {
      out[name] = { kind: "literal", value: binding.value };
      continue;
    }
    // selectionProperty
    const scope = binding.scope ?? "element";
    if (scope === "element") {
      if (elementSelection.length === 0) {
        out[name] = null;
        continue;
      }
      // Multi-element selection: keep the full array; the resolver
      // fetches snapshots for each and collapses values per binding
      // path. Single-element is just the degenerate case.
      out[name] = { kind: "element", ids: elementSelection };
    } else {
      // content
      if (!contentSelection) {
        out[name] = null;
        continue;
      }
      out[name] = {
        kind: "content",
        id: {
          kind: "storyRange",
          id: {
            story_id: contentSelection.storyId,
            start: contentSelection.start,
            end: contentSelection.end,
          },
        } as ElementId,
      };
    }
  }
  return out;
}

function dedupeAddresses(addresses: Record<string, Address>): ElementId[] {
  const seen = new Map<string, ElementId>();
  for (const addr of Object.values(addresses)) {
    if (!addr || addr.kind === "literal") continue;
    if (addr.kind === "element") {
      for (const id of addr.ids) {
        seen.set(JSON.stringify(id), id);
      }
    } else {
      seen.set(JSON.stringify(addr.id), addr.id);
    }
  }
  return Array.from(seen.values());
}

function addressesJson(addresses: Record<string, Address>): string {
  return JSON.stringify(addresses);
}

function buildResolved(
  bindings: Record<string, Binding>,
  addresses: Record<string, Address>,
  snapshot: Map<string, ElementProperties | null>,
  client: CanvasClient,
): Record<string, ResolvedBinding> {
  const out: Record<string, ResolvedBinding> = {};
  for (const [name, binding] of Object.entries(bindings)) {
    const addr = addresses[name];
    if (!addr) {
      out[name] = { value: null };
      continue;
    }
    if (addr.kind === "literal") {
      out[name] = { value: addr.value as Value };
      continue;
    }
    const sb = binding as SelectionPropertyBinding;
    if (addr.kind === "element") {
      // Multi-element resolution + the "mixed" sentinel
      // (panel-catalog-and-sdk-extension.md §5.6): fetch each id's
      // snapshot, collect the values for this binding's path,
      // collapse via uniformity. Any disagreement → null (the
      // catalog leaves render this as em-dash). Empty → null.
      const values: Array<Value | null> = addr.ids.map((id) => {
        const props = snapshot.get(JSON.stringify(id));
        return props?.entries.find((e) => e.path === sb.path)?.value ?? null;
      });
      const collapsed = collapseValues(values);
      // Write fan-out: commit to every selected id. The apply
      // layer treats the writes as a Batch implicitly (each id
      // gets its own SetProperty); a future polish can wrap them
      // in an explicit Operation::Batch for one undo entry.
      out[name] = {
        value: collapsed,
        onCommit: makeOnCommitMany(client, addr.ids, sb.path),
      };
    } else {
      // content scope — single StoryRange address
      const props = snapshot.get(JSON.stringify(addr.id));
      const entry = props?.entries.find((e) => e.path === sb.path);
      out[name] = {
        value: entry?.value ?? null,
        onCommit: makeOnCommit(client, addr.id, sb.path),
      };
    }
  }
  return out;
}

/** Collapse a list of `Value | null` to a single representative or
 *  null (= "mixed"). All-null = null. All equal = that value. */
function collapseValues(values: Array<Value | null>): Value | null {
  if (values.length === 0) return null;
  const first = values[0];
  if (first === null) {
    // Mixed if any non-null exists; otherwise consistently null.
    return values.every((v) => v === null) ? null : null;
  }
  for (const v of values.slice(1)) {
    if (v === null) return null;
    if (!sameValue(first, v)) return null;
  }
  return first;
}

function sameValue(a: Value, b: Value): boolean {
  if (a.type !== b.type) return false;
  // Comparing primitive payloads via JSON stringify is cheap +
  // covers Length / ColorRef / Bounds / Transform / Bool / Text;
  // the wire shape is structurally simple.
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}

function makeOnCommit(
  client: CanvasClient,
  id: ElementId,
  path: string,
): (next: Value) => void {
  return (next) => {
    void client.mutate({
      op: "setElementProperty",
      args: { elementId: id, path: path as never, value: next },
    });
  };
}

/** Multi-target write — fan one Value out to every selected id.
 *  Each id receives its own SetProperty mutation. Future polish:
 *  wrap in an Operation::Batch so a single undo restores the
 *  whole multi-write. For now the user undoes once per id. */
function makeOnCommitMany(
  client: CanvasClient,
  ids: ElementId[],
  path: string,
): (next: Value) => void {
  return (next) => {
    for (const id of ids) {
      void client.mutate({
        op: "setElementProperty",
        args: { elementId: id, path: path as never, value: next },
      });
    }
  };
}
