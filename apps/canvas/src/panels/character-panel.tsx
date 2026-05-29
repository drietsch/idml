// SDK Phase 3 — Character panel.
//
// Wraps the catalog's CompositionRenderer. The panel file contains
// NO JSX of its own beyond the wrapping section + registry
// provider; every field, label, and editor renders from
// `character.composition.ts`. The catalog registry is a
// module-level singleton (built once at first import).

import { createCatalogRegistry, type CatalogRegistry } from "@verso/catalog";
import {
  CatalogRegistryProvider,
  CompositionRenderer,
  registerBuiltInCatalogEntries,
} from "@verso/shell";

import { characterComposition } from "./character.composition";

let registrySingleton: CatalogRegistry | null = null;
function catalog(): CatalogRegistry {
  if (!registrySingleton) {
    registrySingleton = createCatalogRegistry();
    registerBuiltInCatalogEntries(registrySingleton);
  }
  return registrySingleton;
}

export function CharacterPanel() {
  return (
    <CatalogRegistryProvider registry={catalog()}>
      <div className="p-3" data-character-panel="ready">
        <CompositionRenderer composition={characterComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
