// SDK Phase 5 (v1 sweep) — Object Styles panel as a declarative
// composition.
//
// Sibling of `paragraph-styles.composition.ts` /
// `character-styles.composition.ts` with two differences:
//   - scope is `"element"` (object styles apply to a page-item
//     frame, not a text range).
//   - the bound path is `appliedObjectStyle`, routed through the
//     apply arm added in Track G of the Track-A plan.
//
// Reads:  `documentCollection:objectStyles` (model accessor
//          + dispatcher arm added in the same commit).
// Writes: `selectionProperty:appliedObjectStyle` (NodeId::TextFrame
//          | Rectangle | Oval | Polygon | GraphicLine + Value::Text).

import type { CompositionNode } from "@verso/catalog";
import {
  VERSO_INPUT_COLLECTION_SELECT,
  VERSO_LAYOUT_SECTION,
} from "@verso/shell";

export const objectStylesComposition: CompositionNode = {
  catalogId: VERSO_LAYOUT_SECTION,
  props: { title: "Object Styles" },
  bindings: {},
  children: [
    {
      catalogId: VERSO_INPUT_COLLECTION_SELECT,
      props: {
        label: "Style",
        collectionName: "objectStyles",
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "appliedObjectStyle",
        },
      },
    },
  ],
};
