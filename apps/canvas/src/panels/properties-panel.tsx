// SDK Phase 5 (v1 sweep) — Properties panel.
//
// Context-aware expert leaf that surfaces the most-relevant
// editor for the current selection. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 6 — the
// "Properties" / "Control" bar idiom InDesign uses. Composes
// existing compositions (Object Transform, Stroke, Character,
// Paragraph) rather than authoring new editor JSX:
//
//   - No selection ⇒ guidance hint.
//   - One or more elements selected ⇒ stack Object Transform +
//     Stroke (frame-level surface).
//   - A content selection set (text caret/range) ⇒ stack
//     Character + Paragraph below.
//
// Conditional rendering keeps the panel honest: it shows only
// the rows that have something to operate on. No new bindings,
// no new wire — just a routing layer over what already exists.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useContentSelection,
  useSelection,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { characterComposition } from "./character.composition";
import { objectTransformComposition } from "./object-transform.composition";
import { paragraphComposition } from "./paragraph.composition";
import { strokeComposition } from "./stroke.composition";

export function PropertiesPanel() {
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const hasElement = elementSelection.length > 0;
  const hasContent = !!contentSelection;

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        className="p-3 flex flex-col gap-3"
        data-properties-panel="ready"
        data-has-element={hasElement ? "true" : "false"}
        data-has-content={hasContent ? "true" : "false"}
      >
        {!hasElement && !hasContent ? (
          <div
            className="text-xs text-muted-foreground"
            data-properties-empty
          >
            Select a frame or place a text caret to see properties.
          </div>
        ) : null}
        {hasElement ? (
          <div data-properties-section="object">
            <CompositionRenderer composition={objectTransformComposition} />
          </div>
        ) : null}
        {hasElement ? (
          <div data-properties-section="stroke">
            <CompositionRenderer composition={strokeComposition} />
          </div>
        ) : null}
        {hasContent ? (
          <div data-properties-section="character">
            <CompositionRenderer composition={characterComposition} />
          </div>
        ) : null}
        {hasContent ? (
          <div data-properties-section="paragraph">
            <CompositionRenderer composition={paragraphComposition} />
          </div>
        ) : null}
      </div>
    </CatalogRegistryProvider>
  );
}
