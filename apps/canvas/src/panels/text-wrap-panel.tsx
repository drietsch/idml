// SDK Phase 5 (v1 sweep) — Text Wrap panel.
//
// Composition shim. Element-scope bindings to frameTextWrapMode +
// frameTextWrapOffsets. Both share the same Option<TextWrap>
// backing field; the apply arms preserve the other half when one
// is committed in isolation.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { textWrapComposition } from "./text-wrap.composition";

export function TextWrapPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-text-wrap-panel="ready">
        <CompositionRenderer composition={textWrapComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
