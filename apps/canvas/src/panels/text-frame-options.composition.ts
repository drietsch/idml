// SDK Phase 5 (v1 sweep) — Text Frame Options panel as a
// declarative composition.
//
// One row today: inset spacing (`[top, left, bottom, right]` in
// pt). Bound to the new `frameInsetSpacing` apply arm.
//
// Future: vertical-justification, column count, gutter,
// auto-sizing. Each gains a row + apply arm as Operations ship.
// The pattern is the same one Character / Paragraph / Object
// already use.

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_BOUNDS,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const textFrameOptionsComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Text Frame Options" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_BOUNDS,
      props: { label: "Inset (pt)" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameInsetSpacing",
        },
      },
    },
  ],
};
