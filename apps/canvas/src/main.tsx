import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  VersoShell,
  caretContribution,
  contentGrabberContribution,
  hitMarkerContribution,
  marqueeContribution,
  pageDecorationsContribution,
  pathEditContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  rulerGuidesContribution,
  selectionChromeContribution,
  snapLinesContribution,
  useCamera,
  useCanvasClient,
  useContentSelection,
  useDocument,
  useRegistries,
  type OverlayContribution,
  type PanelContribution,
} from "@verso/shell";
import "@verso/shell/styles/globals.css";

import { CanvasClient } from "@verso/client";
import { APP_KEYBINDINGS, APP_MENU_ITEMS, buildAppCommands } from "./app-commands";
import { CanvasPanel } from "./panels/canvas-panel";
import { CharacterPanel } from "./panels/character-panel";
import { ArticlesPanel } from "./panels/articles-panel";
import { BookmarksPanel } from "./panels/bookmarks-panel";
import { CharacterStylesPanel } from "./panels/character-styles-panel";
import { ColorGroupsPanel } from "./panels/color-groups-panel";
import { ConditionSetsPanel } from "./panels/condition-sets-panel";
import { ConditionsPanel } from "./panels/conditions-panel";
import { CrossReferencesPanel } from "./panels/cross-references-panel";
import { HyperlinksPanel } from "./panels/hyperlinks-panel";
import { IndexPanel } from "./panels/index-panel";
import { InfoPanel } from "./panels/info-panel";
import { LinksPanel } from "./panels/links-panel";
import { EffectsPanel } from "./panels/effects-panel";
import { FrameFittingPanel } from "./panels/frame-fitting-panel";
import { GradientsPanel } from "./panels/gradients-panel";
import { ObjectStylesPanel } from "./panels/object-styles-panel";
import { ObjectTransformPanel } from "./panels/object-transform-panel";
import { AlignPanel } from "./panels/align-panel";
import { AttributesPanel } from "./panels/attributes-panel";
import { ControlPanel } from "./panels/control-panel";
import { PropertiesPanel } from "./panels/properties-panel";
import { PathfinderPanel } from "./panels/pathfinder-panel";
import { CellStylesPanel } from "./panels/cell-styles-panel";
import { ColorPanel } from "./panels/color-panel";
import { FontsPanel } from "./panels/fonts-panel";
import { MasterPagesPanel } from "./panels/master-pages-panel";
import { PagesListPanel } from "./panels/pages-list-panel";
import { SpreadsPanel } from "./panels/spreads-panel";
import { TableStylesPanel } from "./panels/table-styles-panel";
import { SwatchesPanel } from "./panels/swatches-panel";
import { TextFrameOptionsPanel } from "./panels/text-frame-options-panel";
import { TextWrapPanel } from "./panels/text-wrap-panel";
import { ToolsPanel } from "./panels/tools-panel";
import { ParagraphPanel } from "./panels/paragraph-panel";
import { ParagraphStylesPanel } from "./panels/paragraph-styles-panel";
import { StrokePanel } from "./panels/stroke-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { LayersPanel } from "./panels/layers-panel";
import { NavigatorPanel } from "./panels/navigator-panel";
import { OutlinePanel } from "./panels/outline-panel";
import { ReplPanel } from "./panels/repl-panel";
import { ScriptEditorPanel } from "./panels/script-editor";
import { TreePanel } from "./panels/tree-panel";
import { useAnimatedCamera } from "./ui/useAnimatedCamera";
import { useKeyboardShortcuts } from "./ui/useKeyboardShortcuts";
import { documentBounds, fitCamera, layoutPages } from "./ui/layout";
import { usePathEditMode } from "./ui/usePathEditMode";
import { useTextEditing } from "./ui/useTextEditing";
import { ZoomField } from "./ui/ZoomField";

// Default overlay contributions for the canvas app. Order is
// descriptive — actual paint order is determined by the
// contributions' `z` values inside OverlayHost.
const BUILT_IN_OVERLAYS: OverlayContribution[] = [
  pageDecorationsContribution,
  rulerGuidesContribution,
  hitMarkerContribution,
  selectionChromeContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  contentGrabberContribution,
  pathEditContribution,
  marqueeContribution,
  snapLinesContribution,
  caretContribution,
];

// The three built-in panels for the canvas app. Bundle authors
// register additional panels through the registry once Step 4's
// loader lands; for now these are the entire panel set.
const BUILT_IN_PANELS: PanelContribution[] = [
  {
    id: "verso.canvas",
    title: "Canvas",
    component: CanvasPanel,
    defaultDock: "center",
    defaultGroup: "center",
    closable: false,
    movable: false,
  },
  {
    id: "verso.pages",
    title: "Pages",
    component: NavigatorPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    // SDK Phase 5 (named sweep) — Tools palette. Expert leaf
    // wrapping useSelection's activeTool / setActiveTool pair.
    // Writes application state (`writes: ["selection"]` per the
    // §10 audit register), not document state.
    id: "verso.tools",
    title: "Tools",
    component: ToolsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    // SDK Phase 5 (named sweep) — Links list. Read-only expert
    // leaf consuming useCollection<LinkSummary>("links"). Per-row
    // relocate / update / break actions land with their
    // Operations.
    id: "verso.links",
    title: "Links",
    component: LinksPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    // SDK Phase 5 (v1 sweep) — Conditions list. Read-only expert
    // leaf consuming useCollection<ConditionSummary>("conditions").
    // Per-condition visibility toggle lands with
    // `Operation::SetConditionVisible`.
    id: "verso.conditions",
    title: "Conditions",
    component: ConditionsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.condition-sets",
    title: "Condition Sets",
    component: ConditionSetsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.color-groups",
    title: "Color Groups",
    component: ColorGroupsPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "verso.articles",
    title: "Articles",
    component: ArticlesPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.hyperlinks",
    title: "Hyperlinks",
    component: HyperlinksPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.bookmarks",
    title: "Bookmarks",
    component: BookmarksPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.cross-references",
    title: "Cross References",
    component: CrossReferencesPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.index",
    title: "Index",
    component: IndexPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  // ── SDK Phase 5 (v1 sweep) — Wave 1 structural-collection
  // panels. Each is a read-only list backed by the matching
  // documentCollection accessor.
  {
    id: "verso.pages-list",
    title: "Pages (list)",
    component: PagesListPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.spreads",
    title: "Spreads",
    component: SpreadsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.master-pages",
    title: "Master Pages",
    component: MasterPagesPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.cell-styles",
    title: "Cell Styles",
    component: CellStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "verso.table-styles",
    title: "Table Styles",
    component: TableStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    id: "verso.fonts",
    title: "Fonts",
    component: FontsPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    // SDK Phase 5 (v1 sweep) — Align palette. Reads element
    // selection + each frame's bounds, dispatches N SetProperty
    // mutations to align. v1 limitation: each frame is its own
    // undo entry (wire-level Batch lands as a follow-up).
    id: "verso.align",
    title: "Align",
    component: AlignPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Pathfinder. v1 ships Union via
    // BBox math; Subtract / Intersect / Exclude buttons exist
    // but are disabled (need Bezier CSG, v2).
    id: "verso.pathfinder",
    title: "Pathfinder",
    component: PathfinderPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    id: "verso.outline",
    title: "Outline",
    component: OutlinePanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.tree",
    title: "Tree",
    component: TreePanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.inspector",
    title: "Inspector",
    component: InspectorPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 3 — Character panel rendered as a declarative
    // composition over `@verso/catalog`. Bindings target content-
    // scope (the current text selection mapped to an
    // ElementId.storyRange); the apply arm at
    // (NodeId::StoryRange, Character*) commits each edit.
    id: "verso.character",
    title: "Character",
    component: CharacterPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 3 — Paragraph panel. Content-scope bindings;
    // apply layer rounds the range to whole paragraphs.
    id: "verso.paragraph",
    title: "Paragraph",
    component: ParagraphPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 — Paragraph Styles list (expert leaf, hybrid
    // candidate). Reads documentCollection:paragraphStyles;
    // applies via appliedParagraphStyle write. Per the
    // panel-catalog doc §5.3 + §5.5.
    id: "verso.paragraph-styles",
    title: "Paragraph Styles",
    component: ParagraphStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 — Character Styles. Direct twin of
    // Paragraph Styles using the same VERSO_INPUT_COLLECTION_SELECT
    // primitive with collectionName: "characterStyles" + a
    // content-scope binding to appliedCharacterStyle. Validates
    // the §9 ≥2-panels rule for the new primitive.
    id: "verso.character-styles",
    title: "Character Styles",
    component: CharacterStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 (v1 sweep) — Object Styles. Element-scope
    // binding to appliedObjectStyle (uses the apply arm shipped
    // with Track A's Task G). collectionName: "objectStyles"
    // routes through the new model accessor.
    id: "verso.object-styles",
    title: "Object Styles",
    component: ObjectStylesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 (named sweep) — Swatches. Validates the
    // `valueType: "colorRef"` extension to
    // VERSO_INPUT_COLLECTION_SELECT — same primitive that drives
    // Paragraph / Character / Object Styles, now writing a
    // Value::ColorRef payload. Element-scope binding to
    // frameFillColor.
    id: "verso.swatches",
    title: "Swatches",
    component: SwatchesPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 (v1 sweep) — Color editor. Fill swatch picker
    // + fill tint scrub. Complements Swatches (the palette
    // browser) per `panel-catalog-and-sdk-extension.md` §6
    // Tier 2b. CMYK/RGB sliders are v2.
    id: "verso.color",
    title: "Color",
    component: ColorPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 5 (v1 sweep) — Gradients. Direct twin of Swatches
    // but reading documentCollection:gradients. Both gradients
    // and swatches commit through the same FrameFillColor apply
    // arm (Value::ColorRef payload carrying either a Swatch or
    // Gradient self_id).
    id: "verso.gradients",
    title: "Gradients",
    component: GradientsPanel,
    defaultDock: "right",
    defaultGroup: "styles",
  },
  {
    // SDK Phase 3 — Stroke panel as a declarative composition.
    // Element-scope bindings over existing FrameStrokeWeight +
    // FrameStrokeColor apply arms.
    id: "verso.stroke",
    title: "Stroke",
    component: StrokePanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 3 — Object/Transform panel. Element-scope bindings
    // over FrameBounds + FrameOpacity.
    id: "verso.object-transform",
    title: "Object",
    component: ObjectTransformPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Text Frame Options. Element-scope
    // binding to frameInsetSpacing (the [top, left, bottom, right]
    // in pt). Vertical-justify + columns + auto-sizing rows join
    // as their apply arms ship.
    id: "verso.text-frame-options",
    title: "Text Frame",
    component: TextFrameOptionsPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Text Wrap. Element-scope bindings
    // to frameTextWrapMode (toggle-group) + frameTextWrapOffsets
    // (bounds). Both share the same Option<TextWrap> backing
    // field — the apply layer preserves the unset half.
    id: "verso.text-wrap",
    title: "Text Wrap",
    component: TextWrapPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Frame Fitting. Rectangle-only.
    // Two rows on the shared Option<FrameFittingOption> field
    // (type toggle-group + crops bounds). Apply arms preserve
    // the unset half.
    id: "verso.frame-fitting",
    title: "Frame Fitting",
    component: FrameFittingPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (named sweep) — Effects (v1 stub). Drop-shadow
    // enabled toggle only; the apply layer materialises a default
    // DropShadowSetting on true. Per-field editors (color,
    // offset, blur) land when their PropertyPaths ship.
    id: "verso.effects",
    title: "Effects",
    component: EffectsPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    id: "verso.layers",
    title: "Layers",
    component: LayersPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 5 (v1 sweep) — read-only document info. Expert
    // leaf wrapping `useDocumentMeta()`. Per the
    // `panel-catalog-and-sdk-extension.md` §6 Tier 5 + §5.6.
    id: "verso.info",
    title: "Info",
    component: InfoPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 5 (v1 sweep) — Attributes editor. v1 surface
    // is the Nonprinting toggle. Per `panel-catalog-and-sdk-
    // extension.md` §6 Tier 5.
    id: "verso.attributes",
    title: "Attributes",
    component: AttributesPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 5 (v1 sweep) — Properties context router. Per
    // `panel-catalog-and-sdk-extension.md` §6 Tier 6 — the
    // "Properties" idiom. Composes Object Transform + Stroke
    // (element scope) and Character + Paragraph (content scope)
    // conditionally on selection state.
    id: "verso.properties",
    title: "Properties",
    component: PropertiesPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 5 (v1 sweep) — Control bar. Horizontal-strip
    // variant of Properties (same compositions, scrollable row
    // layout). Per `panel-catalog-and-sdk-extension.md` §6
    // Tier 6.
    id: "verso.control",
    title: "Control",
    component: ControlPanel,
    defaultDock: "bottom",
    defaultGroup: "chrome",
  },
  {
    id: "verso.repl",
    title: "REPL",
    component: ReplPanel,
    defaultDock: "bottom",
    defaultGroup: "console",
  },
  {
    id: "verso.script-editor",
    title: "Script",
    component: ScriptEditorPanel,
    defaultDock: "bottom",
    defaultGroup: "console",
  },
];

/**
 * Canvas-app integration: legacy keyboard + camera + text-editing
 * hooks that read from the shell contexts but key off canvas
 * specifics (page rect math, IDML mutation API). Renders nothing —
 * mounted inside VersoShell as a side-effect-only child.
 */
function CanvasAppIntegration() {
  const client = useCanvasClient();
  const { camera, setCamera, viewportSize } = useCamera();
  const { handle } = useDocument();
  const { contentSelection, setContentSelection } = useContentSelection();
  const registries = useRegistries();

  const animateCamera = useAnimatedCamera(camera, setCamera);
  useKeyboardShortcuts({
    pageIds: handle?.pageIds ?? [],
    pageSizesPt: handle?.pageSizesPt ?? [],
    camera,
    viewportSize,
    animateCamera,
  });
  useTextEditing({
    client,
    selection: contentSelection,
    setSelection: setContentSelection,
  });
  usePathEditMode();

  // SDK Phase 4 — register canvas-app commands + menu items +
  // keybindings. Closures capture the *current* camera / handle /
  // viewportSize so the zoom commands see live values; dependency
  // array re-runs on each change. The registries' dedupe-by-id
  // contract means re-registration is safe (the dispose from the
  // previous run drops the stale handler before we add the new one).
  useEffect(() => {
    const [vw, vh] = viewportSize;
    const pageSizes = handle?.pageSizesPt ?? [];
    const rects = layoutPages(pageSizes);
    const commands = buildAppCommands({
      undo: () => {
        void client.undo();
      },
      redo: () => {
        void client.redo();
      },
      zoomIn: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        const newScale = camera.scale * 1.5;
        animateCamera({ scale: newScale, tx: cx - docX * newScale, ty: cy - docY * newScale });
      },
      zoomOut: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        const newScale = camera.scale / 1.5;
        animateCamera({ scale: newScale, tx: cx - docX * newScale, ty: cy - docY * newScale });
      },
      zoom100: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        animateCamera({ scale: 1, tx: cx - docX, ty: cy - docY });
      },
      zoomFit: () => {
        if (rects.length === 0) return;
        animateCamera(fitCamera(vw, vh, documentBounds(rects)));
      },
    });
    const cmdDisposables = commands.map((c) => registries.commands.register(c));
    const menuDisposables = APP_MENU_ITEMS.map((m) =>
      registries.menus.register(m),
    );
    const keyDisposables = APP_KEYBINDINGS.map((k) =>
      registries.keybindings.register(k),
    );
    return () => {
      for (const d of cmdDisposables) d.dispose();
      for (const d of menuDisposables) d.dispose();
      for (const d of keyDisposables) d.dispose();
    };
  }, [registries, client, camera, viewportSize, handle, animateCamera]);

  return null;
}

/**
 * Root: owns the CanvasClient lifecycle and hands it to VersoShell.
 */
function CanvasAppRoot() {
  const [client, setClient] = useState<CanvasClient | null>(null);

  useEffect(() => {
    // SDK Phase 1 — `@verso/client` is framework-agnostic, so the
    // worker URL is constructed in the app's module graph (where
    // `import.meta.url` resolves correctly + Vite's static worker
    // chunking can pick it up).
    const c = new CanvasClient({
      workerUrl: new URL("./worker/worker.ts", import.meta.url),
    });
    setClient(c);
    return () => {
      c.dispose();
      setClient(null);
    };
  }, []);

  if (!client) {
    return (
      <div
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
          padding: 16,
        }}
      >
        initialising worker…
      </div>
    );
  }

  return (
    <VersoShell
      client={client}
      panels={BUILT_IN_PANELS}
      overlays={BUILT_IN_OVERLAYS}
      headerExtras={<ZoomField />}
    >
      <CanvasAppIntegration />
    </VersoShell>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}
// StrictMode intentionally disabled: dockview-react's React-part
// lifecycle isn't StrictMode-safe — its components are disposed
// twice on dev double-mount and throw `resource already disposed`.
// Re-enable once dockview ships a StrictMode-aware fix.
createRoot(root).render(<CanvasAppRoot />);
