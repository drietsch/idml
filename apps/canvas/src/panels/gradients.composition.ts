// SDK Phase 5 (named sweep) — Gradients panel as a declarative
// composition.
//
// Direct twin of `swatches.composition.ts`. IDML treats gradients
// as named entries in the same `Graphic` palette (via
// `<Gradient Self="Gradient/...">`); a frame's `FillColor`
// attribute can carry either a `Swatch/*` or `Gradient/*` self_id
// — both flow through the same `FrameFillColor` apply arm and
// `Value::ColorRef` write. So the only thing different from the
// Swatches panel is the bound collection.
//
// Reads:  `documentCollection:gradients`
// Writes: `selectionProperty:frameFillColor` (ColorRef payload
//         carrying a `Gradient/<self_id>`)

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_COLLECTION_SELECT,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const gradientsComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Gradients" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_COLLECTION_SELECT,
      props: {
        label: "Fill",
        collectionName: "gradients",
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
