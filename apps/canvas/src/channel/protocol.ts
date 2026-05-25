// Wire-format types for the main↔worker message channel.
//
// These mirror `crates/idml-canvas/src/channel.rs`. If the Rust side
// bumps `PROTOCOL_VERSION`, this file must update in lockstep — the
// worker rejects messages whose protocol differs.

export const PROTOCOL_VERSION = 1 as const;

export type PageId = string;

export interface ProtocolVersion {
  readonly value: number;
}

// ── Main → Worker ────────────────────────────────────────────────────────

export type MainToWorker = {
  seq: number;
  protocol: number;
} & MainToWorkerKind;

export type MainToWorkerKind =
  | { kind: "hello" }
  | {
      kind: "loadDocument";
      payload: {
        bytes: number[];
        font?: number[] | null;
        cmykIccProfile?: number[] | null;
      };
    }
  | { kind: "mutate"; payload: Mutation }
  | {
      kind: "requestPage";
      payload: { pageId: PageId; lod: LodTier };
    }
  | {
      kind: "hitTest";
      payload: { pageId: PageId; docPoint: [number, number]; filter: HitFilter };
    }
  | {
      kind: "requestSnapshot";
      payload: { pageId: PageId; targetWidthPx: number };
    }
  | {
      kind: "setSelection";
      payload: { selection: ContentSelection | null };
    }
  | {
      kind: "requestSelectionGeometry";
      payload: { selection: ContentSelection };
    }
  | {
      kind: "requestCaretGeometry";
      payload: { selection: ContentSelection };
    }
  | { kind: "undo" }
  | { kind: "redo" };

export interface ContentSelection {
  storyId: string;
  start: number;
  end: number;
  affinity: boolean;
}

export interface CaretGeometry {
  pageId: PageId;
  frameId: string | null;
  xPt: number;
  topPt: number;
  heightPt: number;
}

export interface SelectionRect {
  pageId: PageId;
  frameId: string | null;
  leftPt: number;
  topPt: number;
  widthPt: number;
  heightPt: number;
}

export type LodTier = "snapshot" | "midRes" | "live";
export type HitFilter = "frame" | "text" | "any";

// ── Worker → Main ────────────────────────────────────────────────────────

export type WorkerToMain = {
  seq: number | null;
  protocol: number;
} & WorkerToMainKind;

export type WorkerToMainKind =
  | { kind: "ready"; payload: { protocol: number } }
  | { kind: "documentLoaded"; payload: DocumentHandle }
  | { kind: "loadFailed"; payload: { error: LoadError } }
  | { kind: "mutationFailed"; payload: { error: WorkerError } }
  | {
      kind: "displayListReady";
      payload: {
        pageId: PageId;
        lod: LodTier;
        commands: number;
        layoutGeneration: number;
        numberingGeneration: number;
      };
    }
  | { kind: "hitResult"; payload: HitResult }
  | { kind: "pagesDirty"; payload: { pageIds: PageId[] } }
  | { kind: "storyDirty"; payload: { storyId: string } }
  | { kind: "warning"; payload: { kind: string; details: string } }
  | { kind: "stats"; payload: DocumentStats }
  | { kind: "snapshotReady"; payload: SnapshotPng }
  | { kind: "snapshotFailed"; payload: { error: SnapshotError } }
  | {
      kind: "attachReady";
      payload: { gpuActive: boolean; sceneCacheBudget: number };
    }
  | { kind: "resolutionDone"; payload: ResolutionResult }
  | {
      kind: "mutationApplied";
      payload: {
        clientSeq: number;
        appliedSeq: number;
        pageIds: PageId[];
        cacheStats: LayoutCacheStats;
      };
    }
  | {
      kind: "selectionGeometry";
      payload: { rects: SelectionRect[] };
    }
  | {
      kind: "caretGeometry";
      payload: { caret: CaretGeometry | null };
    }
  | {
      kind: "undoApplied";
      payload: {
        undoneSeq: number;
        appliedSeq: number;
        pageIds: PageId[];
        cacheStats: LayoutCacheStats;
      };
    }
  | {
      kind: "redoApplied";
      payload: {
        redoneSeq: number;
        appliedSeq: number;
        pageIds: PageId[];
        cacheStats: LayoutCacheStats;
      };
    };

/**
 * Phase 4 Step 2 — layout-cache stats sent piggyback on each
 * mutation/undo/redo reply. `hits + misses` is the number of
 * paragraphs the rebuild evaluated; the ratio quantifies the
 * incremental-layout win.
 */
export interface LayoutCacheStats {
  hits: number;
  misses: number;
  len: number;
  capacity: number;
  /** Wall-clock ms of the rebuild that produced these stats. */
  rebuildMs: number;
}

export interface ResolutionResult {
  numbering: Record<string, AnchorPosition>;
  fieldDiff: FieldChange[];
  dirtyPages: PageId[];
  iterations: number;
  runningHeaders: RunningHeader[];
  toc: TocEntry[];
  footnoteCount: number;
}

export interface RunningHeader {
  pageId: PageId;
  pageNumber: number;
  text: string;
  level: number;
}

export interface TocEntry {
  level: number;
  text: string;
  pageNumber: number;
  includeStyle: string;
}

export interface AnchorPosition {
  pageNumber: number;
  pageId: PageId | null;
  counters: Record<string, number>;
  text: string;
  level: number;
}

export interface FieldChange {
  fieldId: string;
  storyId: string;
  oldText: string;
  newText: string;
}

export interface SnapshotPng {
  pageId: PageId;
  widthPx: number;
  heightPx: number;
  layoutGeneration: number;
  numberingGeneration: number;
  /**
   * PNG bytes. Wire form is a number array (serde Vec<u8> → JSON
   * array); the client converts to Uint8Array on receipt.
   */
  pngBytes: number[];
}

export type SnapshotError =
  | { kind: "unknownPage"; details: { pageId: PageId } }
  | { kind: "pngEncode"; details: string }
  | { kind: "invalidWidth"; details: number };

export interface DocumentHandle {
  docId: string;
  pageCount: number;
  pageIds: PageId[];
  pageSizesPt: [number, number][];
  stats: DocumentStats;
}

export interface DocumentStats {
  spreads: number;
  pages: number;
  frames: number;
  stories: number;
  paragraphs: number;
  runs: number;
  glyphs: number;
  lines: number;
}

export interface HitResult {
  frameId: string | null;
  storyId: string | null;
  offsetWithinStory: number | null;
  frameBounds: FrameBounds | null;
}

export interface FrameBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ── Mutations ────────────────────────────────────────────────────────────

export type Mutation =
  | { op: "insertText"; args: { storyId: string; offset: number; text: string } }
  | { op: "deleteRange"; args: { storyId: string; start: number; end: number } }
  | {
      op: "applyStyle";
      args: { storyId: string; start: number; end: number; attributes: unknown };
    }
  | {
      op: "insertField";
      args: { storyId: string; offset: number; fieldKind: string };
    }
  | { op: "moveFrame"; args: { frameId: string; transform: number[] } }
  | {
      op: "resizeFrame";
      args: { frameId: string; bounds: [number, number, number, number] };
    }
  | { op: "linkFrames"; args: { frameA: string; frameB: string } }
  | { op: "unlinkFrames"; args: { chainId: string; afterFrame: string } }
  | {
      op: "insertPage";
      args: { afterPageId?: PageId | null; masterId?: string | null };
    }
  | { op: "deletePage"; args: { pageId: PageId } }
  | {
      op: "insertFrame";
      args: { pageId: PageId; bounds: [number, number, number, number] };
    }
  | { op: "deleteFrame"; args: { frameId: string } };

// ── Errors ───────────────────────────────────────────────────────────────

export type LoadError =
  | { kind: "parse"; message: string }
  | { kind: "scene"; message: string }
  | { kind: "build"; message: string };

export type WorkerError =
  | { kind: "notImplemented"; details: { what: string } }
  | { kind: "unknownPage"; details: { pageId: PageId } }
  | { kind: "noDocument" };
