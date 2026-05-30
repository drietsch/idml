// SDK Phase 5 — Paragraph Styles panel.
//
// Wraps the catalog's CompositionRenderer per the §5 declarative
// pattern. The panel file contains NO JSX of its own beyond the
// wrapping section + registry provider; the single
// `collection-select` row + its binding live in
// `paragraph-styles.composition.ts`. The migration from the
// expert-leaf form is the end-to-end proof that the D1
// (documentCollection) + D7 (collection-select primitive) wire
// works.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { paragraphStylesComposition } from "./paragraph-styles.composition";

export function ParagraphStylesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-paragraph-styles-panel="ready">
        <CompositionRenderer composition={paragraphStylesComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
