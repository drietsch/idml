// SDK Phase 3 — Paragraph panel as a declarative composition.
//
// Content-scope bindings. Paragraph paths apply to a
// `NodeId::StoryRange` and round the range to whole paragraphs
// (paragraphs are atomic — you can't half-apply space-before).
// The snapshot returns one value per intersecting paragraph,
// collapsed to `Some(value)` when they agree or `None` for mixed.

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_LENGTH,
  VERSO_INPUT_TOGGLE_GROUP,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const paragraphComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Paragraph" },
  bindings: {},
  children: [
    {
      // SDK Phase 5 (v1 sweep) — alignment toggle-group.
      // Four-segment IDML default alignments. `LeftJustified` /
      // `CenterJustified` / `RightJustified` / `FullyJustified`
      // (binding-aware aliases) land when a binding-side selector
      // ships.
      catalogId: VERSO_INPUT_TOGGLE_GROUP,
      props: {
        label: "Align",
        options: [
          { value: "LeftAlign", label: "L" },
          { value: "CenterAlign", label: "C" },
          { value: "RightAlign", label: "R" },
          { value: "LeftJustified", label: "J" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphJustification",
        },
      },
    },
    {
      catalogId: VERSO_INPUT_LENGTH,
      props: { label: "Space before" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphSpaceBefore",
        },
      },
    },
    {
      catalogId: VERSO_INPUT_LENGTH,
      props: { label: "Space after" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphSpaceAfter",
        },
      },
    },
    {
      catalogId: VERSO_INPUT_LENGTH,
      props: { label: "First-line indent" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphFirstLineIndent",
        },
      },
    },
  ],
};
