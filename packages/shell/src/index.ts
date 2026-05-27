// @verso/shell — application-shell scaffolding for the canvas
// editor. Owns the React state contexts, registries, docking
// substrate, and command palette per
// `docs/verso/editor-architecture.md` §17.

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
  loadDocumentFile,
  type DocumentLoaderCallbacks,
} from "./state/document-loader";
