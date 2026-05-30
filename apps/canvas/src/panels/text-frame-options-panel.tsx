// SDK Phase 5 (v1 sweep) — Text Frame Options panel.
//
// Composition shim. Element-scope binding to frameInsetSpacing
// via the existing BoundsInput primitive.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { textFrameOptionsComposition } from "./text-frame-options.composition";

export function TextFrameOptionsPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-text-frame-options-panel="ready">
        <CompositionRenderer composition={textFrameOptionsComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
