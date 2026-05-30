// SDK Phase 3 — default catalog registrations.
//
// Adds the primitive leaves to a `CatalogRegistry`. Apps call
// `registerBuiltInCatalogEntries(registry)` once at startup.

import type { CatalogEntry, CatalogRegistry } from "@verso/catalog";

import {
  BoundsLeaf,
  ColorSwatchLeaf,
  LabelLeaf,
  LayoutSectionLeaf,
  LengthLeaf,
  NumericScrubLeaf,
} from "./leaves";

/** Stable catalog ids the rest of the codebase references. */
export const VERSO_INPUT_LENGTH = "verso.input.length";
export const VERSO_INPUT_COLOR_SWATCH = "verso.input.color-swatch";
export const VERSO_INPUT_NUMERIC_SCRUB = "verso.input.numeric-scrub";
export const VERSO_INPUT_BOUNDS = "verso.input.bounds";
export const VERSO_LAYOUT_SECTION = "verso.layout.section";
export const VERSO_LABEL = "verso.label";

// Leaf binding declarations describe the leaf's *write surface* —
// the audit-only declaration that this primitive emits a typed
// `selectionProperty:*` commit regardless of which specific
// `PropertyPath` the composition wires it to. The actual binding
// at render time comes from the composition node's `bindings` dict
// (still constrained by the §11.5 binding ceiling: literal + ref +
// coerce). Each primitive declares a `selectionProperty:*` reads +
// writes pair — the audit surface confirms the leaf is on the
// supported wire, without committing to a specific path.

const ENTRIES: CatalogEntry[] = [
  {
    id: VERSO_INPUT_LENGTH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: LengthLeaf,
  },
  {
    id: VERSO_INPUT_COLOR_SWATCH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: ColorSwatchLeaf,
  },
  {
    id: VERSO_INPUT_NUMERIC_SCRUB,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: NumericScrubLeaf,
  },
  {
    id: VERSO_INPUT_BOUNDS,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: BoundsLeaf,
  },
  {
    id: VERSO_LAYOUT_SECTION,
    kind: "leaf", // layout-only leaf; children come from the composition node
    props: { title: "string" },
    bindings: { reads: [], writes: [] },
    leaf: LayoutSectionLeaf,
  },
  {
    id: VERSO_LABEL,
    kind: "leaf",
    props: { text: "string" },
    bindings: { reads: [], writes: [] },
    leaf: LabelLeaf,
  },
];

export function registerBuiltInCatalogEntries(registry: CatalogRegistry) {
  for (const entry of ENTRIES) {
    registry.register(entry);
  }
}
