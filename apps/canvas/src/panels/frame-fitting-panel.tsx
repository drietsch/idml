// SDK Phase 5 (v1 sweep) — Frame Fitting panel.
//
// Composition shim. Rectangle-only — picking the panel when a
// TextFrame is selected shows em-dash placeholders because the
// apply layer raises UnsupportedProperty for non-Rectangle kinds.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { frameFittingComposition } from "./frame-fitting.composition";

export function FrameFittingPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-frame-fitting-panel="ready">
        <CompositionRenderer composition={frameFittingComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
