// SDK Phase 5 (v1 sweep) — Effects per-field editors composition.
//
// Composed under the Effects panel's existing toggle row. Five
// drop-shadow per-field editors:
//   - Mode (toggle-group — Drop / Inner / etc per IDML spec)
//   - X offset, Y offset (length scrubs in pt)
//   - Size (length scrub in pt)
//   - Opacity (length scrub 0..100)
//   - Color (color swatch ref)
//
// Apply arms materialise a default DropShadowSetting on the
// first per-field write into a prior-None state, so the user can
// dial in fields without first toggling Drop Shadow on.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const effectsComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Drop shadow" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Mode",
        options: [
          { value: "Drop", label: "D" },
          { value: "Inner", label: "I" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowMode",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "X offset" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowXOffset",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "Y offset" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowYOffset",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "Blur size" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowSize",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Opacity" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowOpacity",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_COLOR_SWATCH,
      props: { label: "Shadow color" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowColor",
        },
      },
    },
  ],
};
