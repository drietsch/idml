// SDK Phase 3 — Character panel as a declarative composition.
//
// All bindings are `selectionProperty` refs with `scope: "content"`
// — they resolve against the current ContentSelection, mapped to
// an `ElementId.storyRange` by the binding hook. Reads come from
// `model.element_properties(StoryRange { ... })`; writes go through
// the apply arm at `(NodeId::StoryRange, CharacterFontSize | ...)`.
//
// Per the plan's binding ceiling (§11.5): literals + selectionProperty
// refs only — no expressions, no conditionals, no formatters.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const characterComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Character" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "Font size" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterFontSize",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "Leading" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterLeading",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Tracking" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterTracking",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_COLOR_SWATCH,
      props: { label: "Fill" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterFillColor",
        },
      },
    },
  ],
};
