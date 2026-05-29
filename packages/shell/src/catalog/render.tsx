// SDK Phase 3 — composition renderer.
//
// Walks a `CompositionNode` tree, looks up each catalog reference,
// resolves its bindings against the current selection state, and
// renders the corresponding leaf or descends into a composition
// sub-tree. The renderer is the single React entry point a
// declarative-panel registration uses — see
// docs/verso/sdk-implementation-plan.md §3a.

import { createContext, useContext, type ReactElement } from "react";
import type { CatalogRegistry, CompositionNode, LeafProps } from "@verso/catalog";

import { useBindings, type ResolvedBinding } from "./binding-hook";

/** Provides the catalog registry to nested CompositionRenderer
 *  instances. Apps register their primitives once on mount and
 *  pass the registry through this provider. */
const CatalogRegistryContext = createContext<CatalogRegistry | null>(null);

export function CatalogRegistryProvider(props: {
  registry: CatalogRegistry;
  children: React.ReactNode;
}) {
  return (
    <CatalogRegistryContext.Provider value={props.registry}>
      {props.children}
    </CatalogRegistryContext.Provider>
  );
}

function useCatalogRegistry(): CatalogRegistry {
  const r = useContext(CatalogRegistryContext);
  if (!r) {
    throw new Error(
      "CompositionRenderer rendered outside CatalogRegistryProvider",
    );
  }
  return r;
}

/** Top-level entry. Renders one composition tree; subscribes via
 *  the binding hook to selection + mutationApplied so the leaves
 *  stay live. */
export function CompositionRenderer({
  composition,
}: {
  composition: CompositionNode;
}): ReactElement {
  return <Node node={composition} />;
}

function Node({ node }: { node: CompositionNode }): ReactElement {
  const registry = useCatalogRegistry();
  const entry = registry.get(node.catalogId);
  const resolved = useBindings(node.bindings);

  if (!entry) {
    return (
      <span
        className="text-xs text-destructive"
        data-catalog-unknown={node.catalogId}
      >
        unknown catalog entry: {node.catalogId}
      </span>
    );
  }

  if (entry.kind === "leaf" && entry.leaf) {
    const Leaf = entry.leaf;
    // Primary binding is `"value"` by convention; leaves with
    // multi-binding shapes (BoundsInput, etc.) read additional
    // bindings from `props` if their schema declares them. The
    // renderer doesn't enforce a fixed name; it just forwards
    // every resolved binding plus the static props.
    const value = resolved.value?.value ?? null;
    const onCommit = resolved.value?.onCommit;
    const leafProps: LeafProps = {
      value,
      onCommit,
      props: {
        ...node.props,
        // Forward all non-primary resolved bindings under the same
        // name so leaves can read them by name (e.g.
        // `props.fillColor` for a multi-bind leaf).
        ...resolvedExtras(resolved),
      },
    };
    return <Leaf {...leafProps} />;
  }

  // Composition. Render the children — either inline children on
  // this node OR the inlined composition of the catalog entry
  // itself (rare; only used when a composition catalog entry is
  // pre-built and registered without inlining via JSON).
  const children = node.children ?? entry.composition?.children ?? [];
  return (
    <div className="flex flex-col gap-2" data-catalog-id={node.catalogId}>
      {children.map((child, idx) => (
        <Node key={`${child.catalogId}-${idx}`} node={child} />
      ))}
    </div>
  );
}

function resolvedExtras(
  resolved: Record<string, ResolvedBinding>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, r] of Object.entries(resolved)) {
    if (name === "value") continue;
    out[name] = r.value;
  }
  return out;
}
