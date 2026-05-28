// Wire-format types for the main↔worker message channel.
//
// Types live in Rust now. The generated `apps/canvas/src/wasm/
// idml_canvas_wasm.d.ts` (emitted by tsify-next + wasm-bindgen) is
// the source of truth; this file re-exports the boundary types so
// consumers don't have to learn the wasm import path. Don't
// hand-write interfaces here — add them in Rust under the relevant
// crate (`idml-canvas` for channel/UI-state types, `idml-mutate`
// for the Operation log) and rebuild WASM.
//
// `PROTOCOL_VERSION` stays a TS constant because the canvas
// outgoing messages need a value (not a type) at runtime; the
// matching Rust constant is in `idml-canvas/src/channel.rs` and
// must update in lockstep.

export const PROTOCOL_VERSION = 10 as const;

export type {
  AnchorId,
  AnchorPosition,
  AppliedOperation,
  ByteBuf,
  CaretGeometry,
  ContentSelection,
  DocumentHandle,
  DocumentStats,
  ElementGeometryItem,
  ElementId,
  FieldChange,
  FrameBounds,
  GestureAnchor,
  GestureFailure,
  GestureHandle,
  GestureModifiers,
  GestureType,
  HitFilter,
  HitResult,
  InvalidationHint,
  LayoutCacheStats,
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
} from "../wasm/idml_canvas_wasm";
