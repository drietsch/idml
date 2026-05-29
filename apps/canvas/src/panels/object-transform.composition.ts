// SDK Phase 3 — Object/Transform panel as a declarative composition.
//
// Element-scope bindings — bounds + opacity, both existing
// frame-level paths. The full Object/Transform panel will eventually
// also expose explicit rotation + scale (decomposed from
// FrameTransform via a future `verso.input.rotation` /
// `verso.input.scale` primitive); for v1 only bounds + opacity are
// catalog-bindable, which keeps this commit scope-minimal.

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_BOUNDS,
  VERSO_INPUT_LENGTH,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const objectTransformComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Object" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_BOUNDS,
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
      catalogId: VERSO_INPUT_LENGTH,
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
