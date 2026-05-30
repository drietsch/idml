// SDK Phase 5 (v1 sweep) — Frame Fitting panel as a declarative
// composition.
//
// Rectangle-only — the apply layer raises UnsupportedProperty for
// other kinds (TextFrame / Oval / Polygon / GraphicLine don't
// host placed images in IDML's content-fitting sense). Two rows:
// a fitting-type toggle-group and a crops Bounds row carrying
// the [top, left, bottom, right] crop in pt (IDML's signed-from-
// frame-edge convention; negative grows the image outward).
//
// Reads:  `selectionProperty:frameFittingCrops` +
//         `selectionProperty:frameFittingType`
// Writes: same.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const frameFittingComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Frame Fitting" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Fit",
        options: [
          { value: "None", label: "—" },
          { value: "Proportionally", label: "▭" },
          { value: "FillProportionally", label: "▣" },
          { value: "FitContent", label: "↥" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFittingType",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_BOUNDS,
      props: { label: "Crops (pt)" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFittingCrops",
        },
      },
    },
  ],
};
