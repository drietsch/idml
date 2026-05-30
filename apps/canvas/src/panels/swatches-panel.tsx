// SDK Phase 5 (named sweep) — Swatches panel.
//
// Composition shim. Element-scope binding to frameFillColor.
// Apply path: SetProperty(FrameFillColor, ColorRef(Some|None))
// against the selected page item. Empty-string commit clears the
// fill (Value::ColorRef(None)).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { swatchesComposition } from "./swatches.composition";

export function SwatchesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-swatches-panel="ready">
        <CompositionRenderer composition={swatchesComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
