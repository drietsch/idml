// SDK Phase 5 (named sweep) — Gradients panel.
//
// Composition shim. Same recipe as Swatches with collectionName:
// "gradients". A gradient self_id flows through the same
// FrameFillColor apply arm as a swatch self_id (IDML allows
// either as the FillColor attribute).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { gradientsComposition } from "./gradients.composition";

export function GradientsPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-gradients-panel="ready">
        <CompositionRenderer composition={gradientsComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
