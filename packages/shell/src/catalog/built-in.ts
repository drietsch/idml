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

// Leaf binding declarations describe what *type* of value the leaf
// renders/commits, not a specific scope/path. The actual binding
// at render time comes from the composition node's `bindings`
// dict; this declaration is for the catalog audit surface (and
// the future ContributionFinder palette). Each leaf accepts any
// path whose `Value` variant matches its declared type — e.g.
// LengthLeaf consumes any Value::Length regardless of whether the
// composition binds it to `characterFontSize`, `frameStrokeWeight`,
// `frameOpacity`, etc.
const ANY_SCOPE = "*" as const;

const ENTRIES: CatalogEntry[] = [
  {
    id: VERSO_INPUT_LENGTH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: [{ scope: ANY_SCOPE, ref: "Value::Length" }],
      writes: [{ scope: ANY_SCOPE, ref: "Value::Length" }],
    },
    leaf: LengthLeaf,
  },
  {
    id: VERSO_INPUT_COLOR_SWATCH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: [{ scope: ANY_SCOPE, ref: "Value::ColorRef" }],
      writes: [{ scope: ANY_SCOPE, ref: "Value::ColorRef" }],
    },
    leaf: ColorSwatchLeaf,
  },
  {
    id: VERSO_INPUT_NUMERIC_SCRUB,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: [{ scope: ANY_SCOPE, ref: "Value::Length" }],
      writes: [{ scope: ANY_SCOPE, ref: "Value::Length" }],
    },
    leaf: NumericScrubLeaf,
  },
  {
    id: VERSO_INPUT_BOUNDS,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: [{ scope: ANY_SCOPE, ref: "Value::Bounds" }],
      writes: [{ scope: ANY_SCOPE, ref: "Value::Bounds" }],
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
