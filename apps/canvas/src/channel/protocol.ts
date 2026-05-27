// Wire-format types for the main↔worker message channel.
//
// These mirror `crates/idml-canvas/src/channel.rs`. If the Rust side
// bumps `PROTOCOL_VERSION`, this file must update in lockstep — the
// worker rejects messages whose protocol differs.

export const PROTOCOL_VERSION = 2 as const;

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
      payload: { pageId: PageId; targetWidthPx: number; dpi?: number | null };
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
  | { kind: "redo" }
  | {
      kind: "registerFont";
      payload: {
        family: string;
        style?: string | null;
        bytes: number[];
      };
    }
  | { kind: "clearFontRegistry" }
  | {
      kind: "setElementSelection";
      payload: { ids: ElementId[]; mode: SelectionMode };
    }
  | {
      kind: "requestMarqueeHits";
      payload: { pageId: PageId; rect: [number, number, number, number] };
    }
  | {
      kind: "requestElementGeometry";
      payload: { ids: ElementId[] };
    }
  | {
      kind: "requestGroupLeaves";
      payload: { groupId: string };
    }
  | {
      kind: "beginGesture";
      payload: {
        nodes: ElementId[];
        gesture: GestureType;
        anchor?: GestureAnchor | null;
        /** Phase G — px/pt at gesture start. Lets the snap pass keep
         * its tolerance constant in screen px regardless of zoom. */
        cameraScale?: number | null;
      };
    }
  | {
      kind: "updateGesture";
      payload: {
        handle: GestureHandle;
        delta: [number, number];
        modifiers: GestureModifiers;
      };
    }
  | {
      kind: "commitGesture";
      payload: { handle: GestureHandle };
    }
  | {
      kind: "cancelGesture";
      payload: { handle: GestureHandle };
    };

/**
 * Phase B — opaque, monotone handle returned by `beginGesture` and
 * threaded through every subsequent update/commit/cancel. The wire
 * shape mirrors `gesture::GestureHandle(u64)`.
 */
export type GestureHandle = number;

/** Phase B/C/D/F/G/H — gesture kind discriminator. */
export type GestureType =
  | { kind: "translate" }
  | { kind: "resize"; handle: ResizeHandle }
  | { kind: "rotate" }
  | { kind: "scale" }
  | { kind: "translateContent" }
  | { kind: "rotateContent" }
  | { kind: "scaleContent" }
  | { kind: "pathEdit"; address: PathPointAddress };

/** Phase H — address of one Bezier handle inside a Polygon's
 * PathPointArray. `index` is the flat anchor index across all
 * subpaths (compound polygons concatenate subpaths into one array). */
export interface PathPointAddress {
  index: number;
  role: "anchor" | "left" | "right";
}

/** Phase C — one of the eight resize handles on a selection bounding
 * box. Cardinal handles move a single edge; diagonal handles move
 * two edges at once. */
export type ResizeHandle =
  | "north"
  | "south"
  | "east"
  | "west"
  | "northEast"
  | "northWest"
  | "southEast"
  | "southWest";

/** Phase D — pointer position at gesture start, in page-local coords
 * + the page id. Required for Rotate / Scale (the rotation pivot is
 * computed from the snapshot's centroid; the anchor is the second
 * point that fixes the initial angle). Optional for Translate /
 * Resize. */
export interface GestureAnchor {
  pageId: PageId;
  pointInPage: [number, number];
}

/** Phase B — modifier state captured on each pointer event. */
export interface GestureModifiers {
  shift: boolean;
  alt: boolean;
}

/**
 * Phase A — page item identifier the user can select. Mirrors the
 * Rust `ElementId` enum: a discriminated union over kind + raw id.
 */
export type ElementId =
  | { kind: "textFrame"; id: string }
  | { kind: "rectangle"; id: string }
  | { kind: "oval"; id: string }
  | { kind: "polygon"; id: string }
  | { kind: "graphicLine"; id: string }
  | { kind: "group"; id: string };

/**
 * Phase A — how a `setElementSelection` request combines with the
 * worker's current set. `replace` = plain click; `add` = Shift-click;
 * `toggle` = Cmd/Ctrl-click.
 */
export type SelectionMode = "replace" | "add" | "toggle";

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
    }
  | { kind: "fontRegistered"; payload: { family: string } }
  | { kind: "fontRegistryCleared" }
  | { kind: "elementSelectionApplied"; payload: { ids: ElementId[] } }
  | { kind: "marqueeHits"; payload: { ids: ElementId[] } }
  | { kind: "elementGeometry"; payload: { items: ElementGeometryItem[] } }
  | { kind: "groupLeaves"; payload: { ids: ElementId[] } }
  | { kind: "gestureBegun"; payload: { handle: GestureHandle } }
  | {
      kind: "gestureUpdated";
      payload: {
        handle: GestureHandle;
        pageIds: PageId[];
        /** Phase E — active snap guides for the overlay. */
        snapLines?: SnapLine[];
      };
    }
  | {
      kind: "gestureCommitted";
      payload: {
        handle: GestureHandle;
        appliedSeq: number;
        pageIds: PageId[];
        cacheStats: LayoutCacheStats;
      };
    }
  | {
      kind: "gestureCancelled";
      payload: { handle: GestureHandle; pageIds: PageId[] };
    }
  | { kind: "gestureFailed"; payload: { error: GestureFailure } };

/** Phase E — one active snap guide. `axis: "x"` is a vertical guide
 * (snaps the x coordinate); `"y"` is horizontal. `position` is in
 * page-local pt on `pageId`. */
export interface SnapLine {
  axis: "x" | "y";
  position: number;
  pageId: PageId;
}

/** Phase B/D — wire-format gesture lifecycle errors. */
export type GestureFailure =
  | { kind: "noDocument" }
  | { kind: "unsupportedGesture"; details: { reason: string } }
  | { kind: "alreadyActive"; details: { handle: GestureHandle } }
  | { kind: "handleMismatch" }
  | { kind: "elementNotFound"; details: { id: ElementId } }
  | { kind: "rotatedFrameUnsupported" }
  | { kind: "emptySelection" }
  | { kind: "missingAnchor" }
  | { kind: "unknownAnchorPage"; details: { pageId: PageId } }
  | { kind: "other"; details: { message: string } };

/**
 * Phase A — oriented geometry for one selected element. `bounds` is
 * raw `[top, left, bottom, right]` (content-box space) and
 * `itemTransform` is the composed `[a, b, c, d, tx, ty]` affine. The
 * overlay multiplies bounds corners by the transform to draw the
 * oriented selection chrome.
 */
export interface ElementGeometryItem {
  id: ElementId;
  pageId: PageId;
  bounds: [number, number, number, number];
  itemTransform: [number, number, number, number, number, number] | null;
  /** Phase F — true when the element hosts a placed image, so the
   * UI can route Cmd-body-drag to `TranslateContent`. Optional in
   * the wire shape because old workers don't emit it. */
  hasImage?: boolean;
}

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
  /** Phase A — typed element identifier, new canonical handle. */
  element: ElementId | null;
  /** Phase A — raw bounds `[top, left, bottom, right]` (content-box space). */
  bounds: [number, number, number, number] | null;
  /** Phase A — composed affine `[a, b, c, d, tx, ty]`. */
  itemTransform: [number, number, number, number, number, number] | null;
  /** Phase A — group ancestry, outer-most first. */
  groupChain: string[];
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
