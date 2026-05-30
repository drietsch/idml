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

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const characterStylesComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Character Styles" },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_COLLECTION_SELECT,
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
