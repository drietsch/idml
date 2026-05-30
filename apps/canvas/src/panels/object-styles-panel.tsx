// SDK Phase 5 (v1 sweep) — Object Styles panel.
//
// Composition shim. Element-scope binding to appliedObjectStyle —
// the apply arm (added in Track A's Task G) routes the
// Value::Text(selfId) commit to the page item's
// `applied_object_style` field; the style cascade resolves on
// the next rebuild.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { objectStylesComposition } from "./object-styles.composition";

export function ObjectStylesPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-object-styles-panel="ready">
        <CompositionRenderer composition={objectStylesComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
