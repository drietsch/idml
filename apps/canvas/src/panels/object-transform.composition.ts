// SDK Phase 3 — Object/Transform panel as a declarative composition.
//
// Element-scope bindings — bounds + opacity, both existing
// frame-level paths. The full Object/Transform panel will eventually
// also expose explicit rotation + scale (decomposed from
// FrameTransform via a future `paged.input.rotation` /
// `paged.input.scale` primitive); for v1 only bounds + opacity are
// catalog-bindable, which keeps this commit scope-minimal.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_LENGTH,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const objectTransformComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Object" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_BOUNDS,
      props: { label: "Bounds" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameBounds",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "Opacity" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameOpacity",
        },
      },
    },
  ],
};
