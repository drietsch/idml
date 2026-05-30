// SDK Phase 3 — default catalog registrations.
//
// Adds the primitive leaves to a `CatalogRegistry`. Apps call
// `registerBuiltInCatalogEntries(registry)` once at startup.

import type { CatalogEntry, CatalogRegistry } from "@paged-media/catalog";

import {
  BoundsLeaf,
  CollectionSelectLeaf,
  ColorSwatchLeaf,
  LabelLeaf,
  LayoutSectionLeaf,
  LengthLeaf,
  NumericScrubLeaf,
  ToggleGroupLeaf,
} from "./leaves";

/** Stable catalog ids the rest of the codebase references. */
export const PAGED_INPUT_LENGTH = "paged.input.length";
export const PAGED_INPUT_COLOR_SWATCH = "paged.input.color-swatch";
export const PAGED_INPUT_NUMERIC_SCRUB = "paged.input.numeric-scrub";
export const PAGED_INPUT_BOUNDS = "paged.input.bounds";
export const PAGED_INPUT_COLLECTION_SELECT = "paged.input.collection-select";
export const PAGED_INPUT_TOGGLE_GROUP = "paged.input.toggle-group";
export const PAGED_LAYOUT_SECTION = "paged.layout.section";
export const PAGED_LABEL = "paged.label";

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
    id: PAGED_INPUT_LENGTH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: LengthLeaf,
  },
  {
    id: PAGED_INPUT_COLOR_SWATCH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: ColorSwatchLeaf,
  },
  {
    id: PAGED_INPUT_NUMERIC_SCRUB,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: NumericScrubLeaf,
  },
  {
    id: PAGED_INPUT_BOUNDS,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: BoundsLeaf,
  },
  {
    // SDK Phase 5 (D7) — apply-an-entity selector. Reads its row
    // list from any named document collection per
    // `panel-catalog-and-sdk-extension.md` §9 + §11.5. The
    // composition node parameterises `collectionName`; the leaf's
    // bindings declaration is a generic
    // `documentCollection:swatches` placeholder for audit purposes
    // (every composition that uses this primitive declares its
    // *specific* collection via the prop). The write goes through
    // `selectionProperty:*` — the composition binds the leaf's
    // `value` to whichever applied-entity path (e.g.
    // `appliedParagraphStyle`).
    id: PAGED_INPUT_COLLECTION_SELECT,
    kind: "leaf",
    props: { label: "string", collectionName: "string" },
    bindings: {
      reads: ["selectionProperty:*", "documentCollection:swatches"],
      writes: ["selectionProperty:*"],
    },
    leaf: CollectionSelectLeaf,
  },
  {
    // SDK Phase 5 (v1 sweep) — segmented multi-state toggle.
    // Reads a `Value::Text` enum string; commits the picked
    // option's `value` as a Text payload. Per
    // `panel-catalog-and-sdk-extension.md` §9. First users in
    // v1: Paragraph alignment (justification) + Stroke end-cap
    // (≥2 panels rule).
    id: PAGED_INPUT_TOGGLE_GROUP,
    kind: "leaf",
    props: { label: "string", options: "JsonValue" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: ToggleGroupLeaf,
  },
  {
    id: PAGED_LAYOUT_SECTION,
    kind: "leaf", // layout-only leaf; children come from the composition node
    props: { title: "string" },
    bindings: { reads: [], writes: [] },
    leaf: LayoutSectionLeaf,
  },
  {
    id: PAGED_LABEL,
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
