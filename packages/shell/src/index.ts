// @paged-media/shell — application-shell scaffolding for the canvas
// editor. Owns the React state contexts, registries, docking
// substrate, and command palette per
// `docs/paged/editor-architecture.md` §17.

// ── State contexts ─────────────────────────────────────────────
export {
  CanvasClientProvider,
  useCanvasClient,
  useOptionalCanvasClient,
} from "./state/canvas-client-context";

export {
  CameraProvider,
  useCamera,
  type ViewportSize,
} from "./state/camera-context";

export {
  DocumentProvider,
  useDocument,
  type LoadingState,
} from "./state/document-context";

export {
  SelectionProvider,
  useSelection,
  type ActiveTool,
} from "./state/selection-context";

export {
  ContentSelectionProvider,
  useContentSelection,
} from "./state/content-selection-context";

export {
  OverlaySignalsProvider,
  useOverlaySignals,
  useOptionalOverlaySignals,
  type MarqueeRectPageLocal,
  type SelectionState,
} from "./state/overlay-signals-context";

export {
  InstrumentationProvider,
  useInstrumentation,
} from "./state/instrumentation-context";

// ── Editor handle + registries provider ────────────────────────
export {
  PagedEditorProvider,
  usePaged,
  useOptionalPaged,
  type PagedEditor,
} from "./state/paged-editor";

export {
  RegistriesProvider,
  useRegistries,
  type ShellRegistries,
} from "./state/registries-context";

// ── Registry primitives ────────────────────────────────────────
export {
  type CommandContribution,
  type CommandRegistry,
  type DockEdge,
  type Disposable,
  type KeybindingContribution,
  type KeybindingRegistry,
  type MenuItemContribution,
  type MenuRegistry,
  type MenuRegistryEvent,
  type OverlayContribution,
  type OverlayPageRect,
  type OverlayProps,
  type OverlayRegistry,
  type OverlayRegistryEvent,
  type PanelApi,
  type PanelContribution,
  type PanelProps,
  type PanelRegistry,
  type PanelRegistryEvent,
  type SemanticGroupRegistry,
  type Tool,
  type ToolRegistry,
  type ToolRegistryEvent,
  type VisibilityPredicate,
  DEFAULT_TOOLS,
  createPanelRegistry,
  createCommandRegistry,
  createSemanticGroupRegistry,
  createKeybindingRegistry,
  createMenuRegistry,
  createOverlayRegistry,
  createToolRegistry,
} from "./registries";

// ── Built-in commands ──────────────────────────────────────────
export {
  buildOpenIdmlCommand,
  PAGED_FILE_OPEN_IDML,
} from "./state/commands/file-commands";

// ── Loaders ────────────────────────────────────────────────────
export {
  loadDocumentFile,
  type DocumentLoaderCallbacks,
} from "./state/document-loader";

// ── Shell root ─────────────────────────────────────────────────
export { PagedShell, type PagedShellProps } from "./PagedShell";

// ── Chrome ─────────────────────────────────────────────────────
export { CommandPalette } from "./chrome/CommandPalette";
export { MenuBar } from "./chrome/MenuBar";

// ── Persistence ────────────────────────────────────────────────
export {
  PERSPECTIVES_CHANGED_EVENT,
  clearStoredLayout,
  deletePerspective,
  exportPerspective,
  getPerspective,
  importPerspective,
  listPerspectives,
  restoreLayoutOrDefault,
  savePerspective,
  setupLayoutPersistence,
} from "./persistence/layout-persistence";

// ── Hooks ──────────────────────────────────────────────────────
export {
  useModifierState,
  type ModifierState,
} from "./hooks/useModifierState";

// ── Gestures ───────────────────────────────────────────────────
export {
  useScrubGesture,
  type ScrubGesture,
  type ScrubGestureOptions,
} from "./gestures/use-scrub-gesture";

// SDK Phase 1 — gesture SAB primitives moved to `@paged-media/client`
// alongside camera SAB and the framework-agnostic CanvasClient.
// Re-exported here so existing `@paged-media/shell` consumers keep
// working without an import-path change.
export {
  GestureBuffer,
  GESTURE_SAB_BYTES,
  GESTURE_MODIFIER_SHIFT,
  GESTURE_MODIFIER_ALT,
  supportsGestureSab,
  type GestureUpdateRecord,
} from "@paged-media/client";

// ── Overlay layer ──────────────────────────────────────────────
export {
  OverlayHost,
  caretContribution,
  contentGrabberContribution,
  elementSupportsPathEdit,
  hitMarkerContribution,
  marqueeContribution,
  pageDecorationsContribution,
  pathEditContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  rulerGuidesContribution,
  selectionChromeContribution,
  snapLinesContribution,
  applyAffine,
  type IdmlAffine,
  type OverlayHostProps,
} from "./overlays";

// ── Bundles ────────────────────────────────────────────────────
export {
  loadBundle,
  sampleBundleManifest,
  type BundleHandle,
  type BundleManifest,
  type BundleToShell,
  type ShellToBundle,
} from "./bundles";

// ── Docking substrate ──────────────────────────────────────────
export {
  DockviewSubstrate,
  DockviewRoot,
  DockingSubstrateProvider,
  PanelBridge,
  useDockingSubstrate,
  type DockingSubstrate,
  type LayoutSnapshot,
  type PanelHandle,
  type ResolvedPanelSpec,
  type SemanticLocation,
} from "./docking";

// ── SDK Phase 3 — declarative catalog renderer + primitive leaves
export {
  CompositionRenderer,
  CatalogRegistryProvider,
} from "./catalog/render";
export { useBindings, type ResolvedBinding } from "./catalog/binding-hook";
export { useCollection, useDocumentMeta } from "./catalog/use-collection";
export {
  registerBuiltInCatalogEntries,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_COLLECTION_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_SECTION,
  PAGED_LABEL,
} from "./catalog/built-in";
