// SDK Phase 5 — Character Styles panel.
//
// Composition shim — zero JSX past the wrapping section + provider.
// Twin of `paragraph-styles-panel.tsx`; identical recipe with a
// different `collectionName` + bound property path.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { characterStylesComposition } from "./character-styles.composition";

export function CharacterStylesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-character-styles-panel="ready">
        <CompositionRenderer composition={characterStylesComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
