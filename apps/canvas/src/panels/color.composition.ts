// SDK Phase 5 (v1 sweep) — Color panel as a declarative
// composition.
//
// v1 ships fill picking + fill-tint scrub. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 2b. Future v2:
// CMYK / RGB channel sliders (would land as a new
// `verso.input.color-channel-sliders` primitive once we have a
// resolved-rgb side channel and a matching apply path).
//
// Reads:  `selectionProperty:frameFillColor` +
//         `selectionProperty:frameFillTint`
// Writes: same.

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_COLLECTION_SELECT,
  VERSO_INPUT_NUMERIC_SCRUB,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const colorComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Color" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_COLLECTION_SELECT,
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
    {
      catalogId: VERSO_INPUT_NUMERIC_SCRUB,
      props: { label: "Tint" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFillTint",
        },
      },
    },
  ],
};
