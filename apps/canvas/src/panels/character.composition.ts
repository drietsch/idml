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

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_COLOR_SWATCH,
  VERSO_INPUT_LENGTH,
  VERSO_INPUT_NUMERIC_SCRUB,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const characterComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Character" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_LENGTH,
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
      catalogId: VERSO_INPUT_LENGTH,
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
      catalogId: VERSO_INPUT_NUMERIC_SCRUB,
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
      catalogId: VERSO_INPUT_COLOR_SWATCH,
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
