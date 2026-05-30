// SDK Phase 5 — Paragraph Styles panel as a declarative composition.
//
// Migrates the expert-leaf form (Phase-5 v1) to the catalog model
// per `docs/verso/panel-catalog-and-sdk-extension.md` §5.3 + §5.5.
// One `VERSO_INPUT_COLLECTION_SELECT` primitive (the §9 D7
// addition) wired to `documentCollection:paragraphStyles` on its
// reads and `selectionProperty:appliedParagraphStyle` on its
// write. The selected style's `selfId` becomes the
// `Value::Text(...)` payload of a `SetProperty` on the current
// StoryRange — the apply arm rounds the range to whole paragraphs
// and rewrites each paragraph's `paragraph_style` ref.
//
// Per the binding ceiling (§11.5): the composition emits only
// literal props + selectionProperty bindings; no expressions, no
// conditionals. The Style panel chrome (Create / Edit / Delete
// affordances) lands in v2 when the corresponding Operations
// ship.

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_COLLECTION_SELECT,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const paragraphStylesComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Paragraph Styles" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_COLLECTION_SELECT,
      props: {
        label: "Style",
        collectionName: "paragraphStyles",
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "appliedParagraphStyle",
        },
      },
    },
  ],
};
