// SDK Phase 5 — Character Styles panel as a declarative composition.
//
// Direct twin of `paragraph-styles.composition.ts`. The
// collection-select primitive's ≥2-panels rule (§9 of
// `panel-catalog-and-sdk-extension.md`): Paragraph Styles + this
// panel together prove the primitive generalizes. One row + one
// binding; chrome (Create / Edit / Delete) lands when the
// corresponding `CreateCharacterStyle` / `EditCharacterStyle` /
// `DeleteCharacterStyle` Operations ship.
//
// Reads:  `documentCollection:characterStyles`
// Writes: `selectionProperty:appliedCharacterStyle`
//         (content-scope; the apply arm walks every CharacterRun
//          in the StoryRange, splitting runs at the boundaries).

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_COLLECTION_SELECT,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const characterStylesComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Character Styles" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_COLLECTION_SELECT,
      props: {
        label: "Style",
        collectionName: "characterStyles",
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "appliedCharacterStyle",
        },
      },
    },
  ],
};
