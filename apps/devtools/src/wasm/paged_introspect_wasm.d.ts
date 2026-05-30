/* tslint:disable */
/* eslint-disable */
/**
 * Description of a node about to be inserted. Carries the minimal
 * Stage-1 supported field set — `RemoveNode` → undo → re-insertion
 * round-trips these reliably. Non-essential fields (item_transform,
 * drop_shadow, anchors, …) default on re-insertion; this is a known
 * Stage 1 limitation flagged in the plan and will tighten in later
 * stages.
 */
export type NodeSpec = { kind: "textFrame"; self_id: string; bounds: [number, number, number, number]; fill_color?: string | null } | { kind: "rectangle"; self_id: string; bounds: [number, number, number, number]; fill_color?: string | null } | { kind: "cloneTranslate"; self_id: string; source: NodeId; dx: number; dy: number; destination_spread_id?: string | null };

/**
 * Hint to downstream caches about what the apply touched. Lists
 * instead of a single enum so a Batch aggregates by union without
 * losing per-node detail. Consumers (renderer, glyph cache, layout
 * cache) decide which lists to honour. Stays advisory — nothing in
 * `paged-mutate` invalidates anything itself.
 */
export interface InvalidationHint {
    frameGeometry: NodeId[];
    frameStyle: NodeId[];
    textReflow: NodeId[];
    /**
     * Set when the tree shape changed (any Insert/Remove/Move).
     */
    structural: boolean;
}

/**
 * Phase H — address of one Bezier handle inside a `Polygon`\'s
 * `PathPointArray`. `index` is the flat anchor index across all
 * subpaths (compound polygons concatenate subpaths into one
 * `anchors` Vec; `subpath_starts` marks each contour\'s first
 * index).
 */
export interface PathPointAddress {
    index: number;
    role: PathPointRole;
}

/**
 * Phase H — which corner of a `PathAnchor` the path-point edit
 * targets: the anchor itself or one of its two Bezier handles.
 */
export type PathPointRole = "anchor" | "left" | "right";

/**
 * Result of a successful `apply`. Holds the original op, the
 * pre-computed inverse op (ready to push onto an undo stack), and
 * the invalidation hint.
 */
export interface AppliedOperation {
    op: Operation;
    inverse: Operation;
    invalidation: InvalidationHint;
}

/**
 * SDK Phase 5 (v1 sweep) — wire enum for Pathfinder ops. Mirrors
 * `pathfinder::PathfinderKind` (the internal enum used by the
 * flo_curves layer) — kept separate so the apply layer doesn\'t
 * leak `flo_curves` types onto the wire.
 */
export type PathfinderKind = "union" | "intersect" | "subtract" | "exclude";

/**
 * Stable identifier for a scene-graph node. The string payload is the
 * IDML `Self` attribute (e.g. `\"TextFrame/u14\"`) — stable for the
 * lifetime of the document. Operations reference nodes by ID, never
 * by path or index, so an Op generated on one client applies
 * meaningfully on another even after the tree has shuffled.
 *
 * Variants today cover the page-item kinds the inspector mutates plus
 * the structural containers an `InsertNode`/`MoveNode` Op can target
 * as a parent.
 */
export type NodeId = { kind: "TextFrame"; id: string } | { kind: "Rectangle"; id: string } | { kind: "Oval"; id: string } | { kind: "Polygon"; id: string } | { kind: "GraphicLine"; id: string } | { kind: "Group"; id: string } | { kind: "Spread"; id: string } | { kind: "Page"; id: string } | { kind: "Layer"; id: string } | { kind: "StoryRange"; id: { story_id: string; start: number; end: number } };

/**
 * Stable page identity, independent of position in the page vector.
 *
 * Derived from the IDML `<Page Self=\"...\">` attribute where present;
 * synthesised as `\"page-<spread_idx>-<local_idx>\"` when missing
 * (older / synthetic fixtures without `Self`). The canvas keys
 * display-list caches and LOD tiles by `PageId`, so the value must
 * stay stable across re-layouts — only document-structural edits
 * (insert/delete page) should ever change the set of `PageId`s.
 */
export type PageId = string;

/**
 * The canonical mutation primitive. Five variants, closed set,
 * extended only with deliberation.
 */
export type Operation = { kind: "SetProperty"; node: NodeId; path: PropertyPath; value: Value } | { kind: "InsertNode"; parent: NodeId; position: number; node: NodeSpec } | { kind: "RemoveNode"; node: NodeId } | { kind: "MoveNode"; node: NodeId; new_parent: NodeId; position: number } | { kind: "Batch"; ops: Operation[] } | { kind: "MoveLayer"; layer_id: string; new_index: number } | { kind: "InsertLayer"; position: number; name: string; self_id?: string | null } | { kind: "RemoveLayer"; layer_id: string } | { kind: "PathfinderBoolean"; kept: NodeId; others: NodeId[]; opKind: PathfinderKind };

/**
 * Track J — wire-shape mirror of `paged_parse::PathAnchor`. The
 * parse-side type doesn\'t carry `Deserialize`/`PartialEq`/`Tsify`,
 * and the mutate API needs all three so this Op crosses the wasm
 * boundary. The field shapes match exactly: `anchor` is the
 * on-curve point, `left` / `right` are the incoming / outgoing
 * Bezier handles, all in the page item\'s inner coordinate system.
 */
export interface PathAnchorSpec {
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
}

/**
 * Typed payload for a `SetProperty` Op. Each variant carries a value
 * of a specific kind; the apply layer\'s `TypeMismatch` error fires if
 * the variant doesn\'t match what the path expects.
 */
export type Value = { type: "bounds"; value: [number, number, number, number] } | { type: "colorRef"; value: string | null } | { type: "length"; value: number | null } | { type: "transform"; value: [number, number, number, number, number, number] | null } | { type: "pathPoint"; value: { address: PathPointAddress; position: [number, number] } } | { type: "pathPointInsert"; value: { index: number; anchor: PathAnchorSpec; prevSubpathStarts?: number[] | null } } | { type: "pathPointRemove"; value: { index: number; prevSubpathStarts?: number[] | null } } | { type: "pathPointCurveType"; value: { index: number; smooth: boolean; prev?: PathAnchorSpec | null } } | { type: "bool"; value: boolean } | { type: "text"; value: string } | { type: "framePath"; value: { anchors: PathAnchorSpec[]; subpathStarts: number[] } };

/**
 * Typed property path for `SetProperty` Ops. A closed enum (rather
 * than free-form `Vec<String>`) preserves Rust\'s exhaustiveness
 * guarantee inside `apply`/`invert`, and the `serde` rename lets the
 * wire format read like the dotted path the briefing illustrates
 * (`\"fill.color\"`) — so JS callers don\'t need to learn the Rust
 * enum shape.
 */
export type PropertyPath = "frameBounds" | "frameFillColor" | "frameStrokeColor" | "frameStrokeWeight" | "frameOpacity" | "frameTransform" | "imageContentTransform" | "framePathPoint" | "pathPointInsert" | "pathPointRemove" | "pathPointCurveType" | "layerVisible" | "layerLocked" | "layerPrintable" | "layerName" | "characterFontSize" | "characterLeading" | "characterTracking" | "characterFillColor" | "paragraphSpaceBefore" | "paragraphSpaceAfter" | "paragraphFirstLineIndent" | "appliedParagraphStyle" | "appliedCharacterStyle" | "appliedObjectStyle" | "appliedCellStyle" | "appliedTableStyle" | "framePath" | "frameNonprinting" | "frameFillTint" | "frameDropShadowMode" | "frameDropShadowXOffset" | "frameDropShadowYOffset" | "frameDropShadowSize" | "frameDropShadowOpacity" | "frameDropShadowColor" | "frameDropShadow" | "frameFittingCrops" | "frameFittingType" | "frameTextWrapMode" | "frameTextWrapOffsets" | "paragraphJustification" | "frameStrokeEndCap" | "frameInsetSpacing" | "appliedConditions";


export class Inspector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply an Operation. `op_json` is the wire form of
     * `paged_mutate::Operation`. Returns the wire form of
     * `AppliedOperation` on success.
     */
    apply(op_json: string): string;
    /**
     * Open an IDML by bytes.
     */
    constructor(idml: Uint8Array);
    /**
     * Return property descriptors for a node. `node_json` matches
     * `NodeIdJson` (e.g. `{"kind":"TextFrame","id":"TextFrame/u1"}`).
     */
    properties(node_json: string): string;
    /**
     * Redo the most recently undone op. Symmetric to `undo`.
     */
    redo(): string;
    /**
     * Render a page as PNG bytes. Requires the `render` feature.
     */
    renderPage(page_index: number, dpi: number): Uint8Array;
    /**
     * Return the inspector tree as a JSON string.
     */
    tree(): string;
    /**
     * Undo the most recent op. Returns the resulting
     * `AppliedOperation` (whose `op` is the inverse that just
     * ran) as JSON, or the literal `"null"` when the undo stack
     * is empty.
     */
    undo(): string;
}

export function on_start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_inspector_free: (a: number, b: number) => void;
    readonly inspector_apply: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_new: (a: number, b: number) => [number, number, number];
    readonly inspector_properties: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_redo: (a: number) => [number, number, number, number];
    readonly inspector_renderPage: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_tree: (a: number) => [number, number, number, number];
    readonly inspector_undo: (a: number) => [number, number, number, number];
    readonly on_start: () => void;
    readonly lut_inverse_interp16: (a: number, b: number, c: number) => number;
    readonly qcms_profile_precache_output_transform: (a: number) => void;
    readonly qcms_white_point_sRGB: (a: number) => void;
    readonly qcms_transform_data_rgb_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgba_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_bgra_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgb_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgba_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_bgra_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly lut_interp_linear16: (a: number, b: number, c: number) => number;
    readonly qcms_enable_iccv4: () => void;
    readonly qcms_profile_is_bogus: (a: number) => number;
    readonly qcms_transform_release: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
