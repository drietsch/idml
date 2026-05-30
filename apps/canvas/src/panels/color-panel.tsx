// SDK Phase 5 (v1 sweep) — Color panel.
//
// Composition shim. Per `panel-catalog-and-sdk-extension.md`
// §6 Tier 2b: a focused color editor that complements Swatches
// (which is the palette browser). v1 surface: fill swatch
// picker + fill tint slider. CMYK / RGB channel sliders land in
// v2 with a resolved-color side channel + matching apply path.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { colorComposition } from "./color.composition";

export function ColorPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-color-panel="ready">
        <CompositionRenderer composition={colorComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
