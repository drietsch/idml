// @verso/shell — application-shell scaffolding for the canvas
// editor. Owns the React state contexts, registries, docking
// substrate, and command palette per
// `docs/verso/editor-architecture.md` §17.

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
  InstrumentationProvider,
  useInstrumentation,
} from "./state/instrumentation-context";

// ── Editor handle + registries provider ────────────────────────
export {
  VersoEditorProvider,
  useVerso,
  useOptionalVerso,
  type VersoEditor,
} from "./state/verso-editor";

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
  type PanelApi,
  type PanelContribution,
  type PanelProps,
  type PanelRegistry,
  type PanelRegistryEvent,
  type SemanticGroupRegistry,
  type VisibilityPredicate,
  createPanelRegistry,
  createCommandRegistry,
  createSemanticGroupRegistry,
  createKeybindingRegistry,
} from "./registries";

// ── Built-in commands ──────────────────────────────────────────
export {
  buildOpenIdmlCommand,
  VERSO_FILE_OPEN_IDML,
} from "./state/commands/file-commands";

// ── Loaders ────────────────────────────────────────────────────
export {
  loadDocumentFile,
  type DocumentLoaderCallbacks,
} from "./state/document-loader";

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
