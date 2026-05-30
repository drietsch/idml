// SDK Phase 5 (named sweep) — Swatches panel as a declarative
// composition.
//
// Element-scope binding to `frameFillColor` (a `Value::ColorRef`
// payload, NOT `Value::Text`). Uses the same
// `PAGED_INPUT_COLLECTION_SELECT` primitive that drives Paragraph
// / Character / Object Styles, with `valueType: "colorRef"` so
// the leaf emits the matching wire shape on commit. This is the
// fourth panel exercising the §9 ≥2-panels rule for the
// collection-select primitive (now ≥4).
//
// v1 limitation: the panel only writes the fill color. A future
// polish adds a fill/stroke toggle so one swatch grid drives both
// targets. The `valueType` extension is the load-bearing piece.
//
// Reads:  `documentCollection:swatches`
// Writes: `selectionProperty:frameFillColor` (ColorRef payload)

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const swatchesComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Swatches" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_COLLECTION_SELECT,
      props: {
        label: "Fill",
        collectionName: "swatches",
        valueType: "colorRef",
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFillColor",
        },
      },
    },
  ],
};
