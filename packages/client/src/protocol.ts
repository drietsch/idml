// Wire-format types for the main↔worker message channel.
//
// Every type in this file is a re-export of a tsify-generated type
// from Rust. To add a new type, derive `Tsify` in
// `crates/idml-canvas/src/channel.rs` (or the appropriate crate),
// rebuild via `bash apps/canvas/build-wasm.sh`, then re-export here.
// Do not hand-write types in this file. The generated
// `packages/client/src/wasm/idml_canvas_wasm.d.ts` (emitted by
// tsify-next + wasm-bindgen) is the source of truth; this barrel
// exists so consumers don't have to learn the wasm import path.
//
// CI enforces this contract: `.github/workflows/protocol-version.yml`
// rebuilds the wasm, then `git diff --exit-code packages/client/src/wasm/`
// fails the run if the committed `.d.ts` is out of date relative to
// the current Rust source.
//
// `PROTOCOL_VERSION` stays a TS constant because the canvas
// outgoing messages need a value (not a type) at runtime; the
// matching Rust constant is in `idml-canvas/src/channel.rs` and
// must update in lockstep — `scripts/check-protocol-version.sh`
// catches drift on PRs that change the `.d.ts` structurally.

export const PROTOCOL_VERSION = 22 as const;

export type {
  AnchorId,
  AnchorPosition,
  AppliedOperation,
  ByteBuf,
  CameraSabLayout,
  CaretGeometry,
  CharacterStyleSummary,
  CollectionName,
  ContentSelection,
  DocumentHandle,
  DocumentMeta,
  DocumentStats,
  ElementGeometryItem,
  ElementId,
  FieldChange,
  FrameBounds,
  GestureAnchor,
  GestureFailure,
  GestureHandle,
  GestureModifiers,
  GestureSabLayout,
  GestureType,
  GradientSummary,
  HitFilter,
  HitResult,
  InvalidationHint,
  ElementProperties,
  LayerSummary,
  LayoutCacheStats,
  CellStyleSummary,
  ConditionSummary,
  FontSummary,
  LinkSummary,
  MasterPageSummary,
  PageSummary,
  PathfinderKind,
  SpreadSummary,
  TableStyleSummary,
  ParagraphStyleSummary,
  PropertyEntry,
  SceneTreeNode,
  StorySummary,
  SwatchSummary,
  LoadError,
  LodTier,
  MainToWorker,
  MainToWorkerKind,
  Mutation,
  NodeId,
  NodeSpec,
  NumberingMap,
  Operation,
  PageId,
  PathAnchorsResult,
  PathAnchorTriple,
  PathPointAddress,
  PathPointRole,
  ProtocolVersion,
  PropertyPath,
  ResizeHandle,
  ResolutionResult,
  RunningHeader,
  SelectionMode,
  SelectionRect,
  SnapAxis,
  SnapLine,
  SnapshotError,
  SnapshotPng,
  TocEntry,
  Value,
  WorkerError,
  WorkerToMain,
  WorkerToMainKind,
} from "./wasm/idml_canvas_wasm";
