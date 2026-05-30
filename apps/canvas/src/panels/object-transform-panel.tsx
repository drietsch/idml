// SDK Phase 3 — Object/Transform panel.
//
// Declarative composition over the existing FrameBounds + FrameOpacity
// apply arms. Element-scope bindings.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { objectTransformComposition } from "./object-transform.composition";

export function ObjectTransformPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-object-transform-panel="ready">
        <CompositionRenderer composition={objectTransformComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
