// SDK Phase 5 (v1 sweep) — Text Wrap panel as a declarative
// composition.
//
// Two rows: a Mode toggle-group and a Bounds row for the wrap
// offsets. Both bind element-scope properties; the apply layer
// preserves the unset half when only one is committed. Frame
// kinds that carry `text_wrap` (TextFrame / Rectangle / Oval /
// Polygon / GraphicLine) accept both; TextFrame returns
// UnsupportedProperty on FrameStrokeEndCap so the Stroke panel's
// end-cap row reflects that gap — Text Wrap has no equivalent
// gap.
//
// Reads:  `selectionProperty:frameTextWrapMode` +
//         `selectionProperty:frameTextWrapOffsets`
// Writes: same.

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_BOUNDS,
  VERSO_INPUT_TOGGLE_GROUP,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const textWrapComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Text Wrap" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_TOGGLE_GROUP,
      props: {
        label: "Mode",
        options: [
          { value: "None", label: "—" },
          { value: "BoundingBoxTextWrap", label: "▦" },
          { value: "ContourTextWrap", label: "◯" },
          { value: "JumpObjectTextWrap", label: "↪" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameTextWrapMode",
        },
      },
    },
    {
      catalogId: VERSO_INPUT_BOUNDS,
      props: { label: "Offsets (pt)" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameTextWrapOffsets",
        },
      },
    },
  ],
};
