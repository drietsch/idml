// SDK Phase 5 (v1 sweep) — Control bar.
//
// Horizontal-strip variant of the Properties panel. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 6 — the
// "Control" idiom InDesign uses for the top context bar.
// Renders the same compositions Properties does (Object
// Transform + Stroke + Character + Paragraph) but in a
// horizontally-scrollable row so it fits a thin top dock.
//
// The compositions stay vertical inside each section — only the
// outer flow is horizontal. Wide sections (Object, Paragraph)
// take more space; the scroll lets them all coexist.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useContentSelection,
  useSelection,
} from "@verso/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { characterComposition } from "./character.composition";
import { objectTransformComposition } from "./object-transform.composition";
import { paragraphComposition } from "./paragraph.composition";
import { strokeComposition } from "./stroke.composition";

export function ControlPanel() {
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const hasElement = elementSelection.length > 0;
  const hasContent = !!contentSelection;

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        className="p-2 flex gap-3 overflow-x-auto"
        data-control-panel="ready"
        data-has-element={hasElement ? "true" : "false"}
        data-has-content={hasContent ? "true" : "false"}
      >
        {!hasElement && !hasContent ? (
          <div
            className="text-xs text-muted-foreground self-center"
            data-control-empty
          >
            Select a frame or place a text caret.
          </div>
        ) : null}
        {hasElement ? (
          <div
            className="shrink-0 min-w-[14rem] border-r border-input pr-3"
            data-control-section="object"
          >
            <CompositionRenderer composition={objectTransformComposition} />
          </div>
        ) : null}
        {hasElement ? (
          <div
            className="shrink-0 min-w-[14rem] border-r border-input pr-3"
            data-control-section="stroke"
          >
            <CompositionRenderer composition={strokeComposition} />
          </div>
        ) : null}
        {hasContent ? (
          <div
            className="shrink-0 min-w-[14rem] border-r border-input pr-3"
            data-control-section="character"
          >
            <CompositionRenderer composition={characterComposition} />
          </div>
        ) : null}
        {hasContent ? (
          <div
            className="shrink-0 min-w-[14rem]"
            data-control-section="paragraph"
          >
            <CompositionRenderer composition={paragraphComposition} />
          </div>
        ) : null}
      </div>
    </CatalogRegistryProvider>
  );
}
