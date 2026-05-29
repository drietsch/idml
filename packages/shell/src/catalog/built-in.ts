// SDK Phase 3 — default catalog registrations.
//
// Adds the primitive leaves to a `CatalogRegistry`. Apps call
// `registerBuiltInCatalogEntries(registry)` once at startup.

import type { CatalogEntry, CatalogRegistry } from "@verso/catalog";

import {
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
export const VERSO_LAYOUT_SECTION = "verso.layout.section";
export const VERSO_LABEL = "verso.label";

const ENTRIES: CatalogEntry[] = [
  {
    id: VERSO_INPUT_LENGTH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: [{ scope: "content", ref: "characterFontSize" }],
      writes: [{ scope: "content", ref: "characterFontSize" }],
    },
    leaf: LengthLeaf,
  },
  {
    id: VERSO_INPUT_COLOR_SWATCH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: [{ scope: "content", ref: "characterFillColor" }],
      writes: [{ scope: "content", ref: "characterFillColor" }],
    },
    leaf: ColorSwatchLeaf,
  },
  {
    id: VERSO_INPUT_NUMERIC_SCRUB,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: [{ scope: "content", ref: "characterTracking" }],
      writes: [{ scope: "content", ref: "characterTracking" }],
    },
    leaf: NumericScrubLeaf,
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
