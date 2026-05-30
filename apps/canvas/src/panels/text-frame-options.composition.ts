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

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const textFrameOptionsComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Text Frame Options" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_BOUNDS,
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
