// SDK Phase 3 — Paragraph panel as a declarative composition.
//
// Content-scope bindings. Paragraph paths apply to a
// `NodeId::StoryRange` and round the range to whole paragraphs
// (paragraphs are atomic — you can't half-apply space-before).
// The snapshot returns one value per intersecting paragraph,
// collapsed to `Some(value)` when they agree or `None` for mixed.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const paragraphComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Paragraph" },
  bindings: {},
  children: [
    {
      // SDK Phase 5 (v1 sweep) — alignment toggle-group.
      // Four-segment IDML default alignments. `LeftJustified` /
      // `CenterJustified` / `RightJustified` / `FullyJustified`
      // (binding-aware aliases) land when a binding-side selector
      // ships.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
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
      catalogId: PAGED_INPUT_LENGTH,
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
      catalogId: PAGED_INPUT_LENGTH,
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
      catalogId: PAGED_INPUT_LENGTH,
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
