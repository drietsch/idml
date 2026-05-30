// SDK Phase 3 — Character panel.
//
// Wraps the catalog's CompositionRenderer. The panel file contains
// NO JSX of its own beyond the wrapping section + registry
// provider; every field, label, and editor renders from
// `character.composition.ts`. The catalog registry is a
// module-level singleton built once at first import — shared with
// every other declarative panel via `./catalog-registry.ts`.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { characterComposition } from "./character.composition";

export function CharacterPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-character-panel="ready">
        <CompositionRenderer composition={characterComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
