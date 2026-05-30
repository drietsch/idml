// Main-thread client for the canvas worker.
//
// Owns the worker handle, the next outgoing seq, the reply
// pending-promise table, and the camera SAB. UI code sends typed
// messages and awaits typed replies; the protocol envelope shape
// stays internal.
//
// SDK Phase 1 — this lives in `@paged-media/client`, framework-agnostic.
// No React imports. The worker URL is injected by the consumer
// (the canvas app constructs it via `new URL("./worker/worker.ts",
// import.meta.url)`) because `import.meta.url` here would resolve
// against this file's location in the package, not the app's
// worker.

import {
  PROTOCOL_VERSION,
  type CaretGeometry,
  type CollectionName,
  type ColorPreview,
  type ContentSelection,
  type DocumentHandle,
  type DocumentMeta,
  type ElementGeometryItem,
  type ElementId,
  type GestureAnchor,
  type GestureHandle,
  type GestureModifiers,
  type ElementProperties,
  type GestureType,
  type LayerSummary,
  type LodTier,
  type SceneTreeNode,
  type MainToWorker,
  type MainToWorkerKind,
  type Mutation,
  type PageId,
  type PathAnchorsResult,
  type SelectionMode,
  type SelectionRect,
  type SnapLine,
  type SnapshotPng,
  type WorkerToMain,
} from "./protocol";
import { CameraBuffer, type Camera } from "./sab/camera";
import { GestureBuffer } from "./sab/gesture";

type PendingReply = (msg: WorkerToMain) => void;

/**
 * Construction options for `CanvasClient`. `workerUrl` must point at
 * the consumer's worker module — the canvas app builds it via
 * `new URL("./worker/worker.ts", import.meta.url)` so the resolution
 * happens in the *app's* module graph. Bundlers (Vite) walk these
 * URL constructors statically and emit the worker chunk; resolving
 * the URL here in `@paged-media/client` would point at a path inside the
 * package that doesn't have the worker code.
 */
export interface CanvasClientOptions {
  workerUrl: URL;
}

export class CanvasClient {
  private readonly worker: Worker;
  private nextSeq = 1;
  private readonly pending = new Map<number, PendingReply>();
  private readonly listeners = new Set<(msg: WorkerToMain) => void>();
  readonly camera: CameraBuffer;
  readonly gestureSab: GestureBuffer;

  constructor(options: CanvasClientOptions) {
    this.worker = new Worker(options.workerUrl, { type: "module" });
    this.worker.addEventListener("message", this.onMessage);
    this.camera = CameraBuffer.allocate();
    this.worker.postMessage({ kind: "cameraSab", buffer: this.camera.buffer });
    this.gestureSab = GestureBuffer.allocate();
    this.worker.postMessage({
      kind: "gestureSab",
      buffer: this.gestureSab.buffer,
    });
  }

  /**
   * Send a typed message and await the worker's reply. Replies are
   * matched on `seq`; messages with `seq === null` are unsolicited
   * notifications and flow through `subscribe(...)` instead.
   */
  async send(kind: MainToWorkerKind): Promise<WorkerToMain> {
    const seq = this.nextSeq++;
    const envelope: MainToWorker = {
      seq,
      protocol: PROTOCOL_VERSION,
      ...kind,
    };
    const promise = new Promise<WorkerToMain>((resolve) => {
      this.pending.set(seq, resolve);
    });
    this.worker.postMessage({ kind: "channel", msg: envelope });
    return promise;
  }

  /** Subscribe to unsolicited worker → main notifications. */
  subscribe(listener: (msg: WorkerToMain) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Convenience: type-narrow `documentLoaded` reply.
   *
   * Routes through a binary side-channel (transferable ArrayBuffers)
   * rather than the JSON envelope so multi-MB IDMLs don't pay the
   * ~8× cost of `Array.from(bytes)` → `JSON.stringify` →
   * `serde_json::from_str`. On wasm32 the JSON path trips a
   * `Vec::with_capacity` overflow above ~80 MB; the binary path is
   * effectively a memcpy.
   */
  async loadDocument(
    bytes: Uint8Array,
    font?: Uint8Array,
    cmykIccProfile?: Uint8Array,
  ): Promise<DocumentHandle> {
    const seq = this.nextSeq++;
    const promise = new Promise<DocumentHandle>((resolve, reject) => {
      this.loadDocPending.set(seq, { resolve, reject });
    });
    const transfer: Transferable[] = [bytes.buffer];
    if (font) transfer.push(font.buffer);
    if (cmykIccProfile) transfer.push(cmykIccProfile.buffer);
    this.worker.postMessage(
      {
        kind: "loadDocumentBinary",
        seq,
        bytes,
        font: font ?? null,
        cmykIccProfile: cmykIccProfile ?? null,
      },
      // Transfer ownership of the underlying buffers; the caller's
      // Uint8Array references become unusable after this. Saves a
      // copy in V8.
      transfer,
    );
    return promise;
  }

  private readonly loadDocPending = new Map<
    number,
    { resolve: (h: DocumentHandle) => void; reject: (e: Error) => void }
  >();

  async requestPage(pageId: PageId, lod: LodTier): Promise<WorkerToMain> {
    return this.send({ kind: "requestPage", payload: { pageId, lod } });
  }

  /**
   * Request a low-resolution snapshot for the navigator / overview.
   * Resolves to the PNG bytes; throws if the worker errors. When
   * `dpi` is provided it wins over `targetWidthPx` — useful for the
   * fidelity suite, which needs byte-exact dimensions vs `pdftoppm`.
   */
  async requestSnapshot(
    pageId: PageId,
    targetWidthPx: number,
    dpi?: number,
  ): Promise<SnapshotPng> {
    const reply = await this.send({
      kind: "requestSnapshot",
      payload: { pageId, targetWidthPx, dpi: dpi ?? null },
    });
    if (reply.kind === "snapshotReady") {
      return reply.payload;
    }
    if (reply.kind === "snapshotFailed") {
      const e = reply.payload.error;
      throw new Error(`snapshot failed (${e.kind})`);
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  async mutate(mutation: Mutation): Promise<WorkerToMain> {
    return this.send({ kind: "mutate", payload: mutation });
  }

  /** Phase 3 — replace the worker's selection state. */
  async setSelection(selection: ContentSelection | null): Promise<WorkerToMain> {
    return this.send({ kind: "setSelection", payload: { selection } });
  }

  /**
   * Phase A — apply an element-selection update with the given mode.
   * Resolves to the post-update set (which may differ from the
   * request when mode is `add`/`toggle`).
   */
  async setElementSelection(
    ids: ElementId[],
    mode: SelectionMode,
  ): Promise<ElementId[]> {
    const reply = await this.send({
      kind: "setElementSelection",
      payload: { ids, mode },
    });
    if (reply.kind === "elementSelectionApplied") return reply.payload.ids;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Phase A — return every selectable element whose oriented bounds
   * intersect `rect` (page-local `[top, left, bottom, right]`). Returns
   * ids in paint order, top-first.
   */
  async marqueeHits(
    pageId: PageId,
    rect: [number, number, number, number],
  ): Promise<ElementId[]> {
    const reply = await this.send({
      kind: "requestMarqueeHits",
      payload: { pageId, rect },
    });
    if (reply.kind === "marqueeHits") return reply.payload.ids;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Phase A — fetch oriented geometry (raw bounds + composed transform
   * + host page) for one or more elements. Used by the overlay to
   * draw selection chrome without re-deriving the affine math in TS.
   */
  async elementGeometry(ids: ElementId[]): Promise<ElementGeometryItem[]> {
    const reply = await this.send({
      kind: "requestElementGeometry",
      payload: { ids },
    });
    if (reply.kind === "elementGeometry") return reply.payload.items;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Phase H — return every leaf descendant of the named group (no
   * groups; nested groups are descended). The canvas selects this
   * list when the user double-clicks a frame whose hit `group_chain`
   * is non-empty.
   */
  async groupLeaves(groupId: string): Promise<ElementId[]> {
    const reply = await this.send({
      kind: "requestGroupLeaves",
      payload: { groupId },
    });
    if (reply.kind === "groupLeaves") return reply.payload.ids;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Step 5 — fetch the path-anchor table for an element so the
   * path-edit overlay can draw one dot per anchor + Bezier-handle
   * pair. Returns `null` when the element doesn't resolve or sits
   * on a non-body page; returns a result with an empty `anchors`
   * vector when the element carries no `<PathGeometry>` (e.g. a
   * Rectangle declared via `GeometricBounds` only).
   */
  async pathAnchors(id: ElementId): Promise<PathAnchorsResult | null> {
    const reply = await this.send({
      kind: "requestPathAnchors",
      payload: { id },
    });
    if (reply.kind === "pathAnchors") return reply.payload.result;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Track M — list every `<Layer>` from the loaded document. Used by
   * the Layers panel to seed its row list and re-query on every
   * `LayersChanged` notification. Returns an empty array when no
   * document is loaded.
   */
  async layers(): Promise<LayerSummary[]> {
    const reply = await this.send({
      kind: "requestLayers",
    });
    if (reply.kind === "layers") return reply.payload.items;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * SDK Phase 5 (D1) — typed read of any document collection per
   * `docs/paged/panel-catalog-and-sdk-extension.md` §5.1. Generic
   * over the consumer's expected summary shape — e.g.
   * `client.collection<SwatchSummary>("swatches")` or
   * `client.collection<ParagraphStyleSummary>("paragraphStyles")`.
   *
   * The worker's `CollectionReply.items` is typed as `any` on the
   * wire (one envelope handles every collection's typed shape), so
   * the cast here is the deliberate boundary where the consumer
   * commits to a specific `*Summary` type. tsc protects the
   * `name` arg via the closed `CollectionName` union — typos fail
   * at compile time, not at runtime.
   *
   * Empty array for unknown / unimplemented collections — never
   * null, so consumer hooks can rely on the array invariant.
   */
  async collection<T>(name: CollectionName): Promise<readonly T[]> {
    const reply = await this.send({
      kind: "requestCollection",
      payload: { name },
    });
    if (reply.kind === "collectionReply") {
      const items = reply.payload.items;
      if (Array.isArray(items)) return items as T[];
      return [];
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * SDK Phase 5 (D1) — singleton document-meta snapshot per
   * `docs/paged/panel-catalog-and-sdk-extension.md` §5.6. The
   * `documentMeta:<key>` ReadSpec form binds against fields of
   * this object. Re-fetch on `mutationApplied` / `undoApplied` /
   * `redoApplied` to keep the panel reactive — same snapshot-
   * discipline pattern the existing `useBindings` uses.
   */
  async documentMeta(): Promise<DocumentMeta> {
    const reply = await this.send({
      kind: "requestDocumentMeta",
    });
    if (reply.kind === "documentMetaReply") return reply.payload.meta;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * SDK Phase 5 (v1 sweep) — resolved colour readout for a single
   * swatch. Powers the Color panel's CMYK/RGB display. Returns
   * `null` when the swatch id doesn't resolve.
   */
  async colorPreview(swatchId: string): Promise<ColorPreview | null> {
    const reply = await this.send({
      kind: "requestColorPreview",
      payload: { swatchId },
    });
    if (reply.kind === "colorPreviewReply") return reply.payload.result;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Inspector P1 — typed property snapshot for the selected element.
   * The Inspector panel passes each entry's `path` + `value` directly
   * into the matching editor; on commit it dispatches a
   * `SetElementProperty` mutation carrying the edited value. `null`
   * when the id doesn't resolve.
   */
  async elementProperties(id: ElementId): Promise<ElementProperties | null> {
    const reply = await this.send({
      kind: "requestElementProperties",
      payload: { id },
    });
    if (reply.kind === "elementProperties") return reply.payload.result;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Inspector P1 — fetch the scene-tree outline (Spread → Page →
   * frame leaves). Lightweight; the Tree panel re-fetches on every
   * `mutationApplied` to stay in sync.
   */
  async sceneTree(): Promise<SceneTreeNode[]> {
    const reply = await this.send({
      kind: "requestSceneTree",
    });
    if (reply.kind === "sceneTree") return reply.payload.roots;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Scripting Stage 2 — run JS source against the loaded document.
   * The Paged JS API (paged.set / get / inspect / undo / redo,
   * frame Proxy, console.*) is available to the script; every
   * mutation routes through the standard Operation channel, so
   * undo/redo + the inspector + the canvas re-render all work
   * identically to UI-driven changes. Returns the captured
   * console.* output + any thrown error.
   */
  async executeScript(
    source: string,
  ): Promise<{ output: string[]; error: string | null }> {
    const reply = await this.send({
      kind: "executeScript",
      payload: { source },
    });
    if (reply.kind === "scriptResult") {
      return {
        output: reply.payload.output,
        error: reply.payload.error ?? null,
      };
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Phase B — begin a gesture against the listed elements. Resolves
   * to the worker's handle; pass it to subsequent
   * `updateGesture` / `commitGesture` / `cancelGesture` calls.
   * Rejects when the worker reports a `gestureFailed` envelope.
   */
  async beginGesture(
    nodes: ElementId[],
    gesture: GestureType,
    anchor: GestureAnchor | null = null,
  ): Promise<GestureHandle> {
    // Phase G — read the current camera scale from the SAB so the
    // snap pass can keep its tolerance constant in screen px. The
    // value is snapshot-locked for the gesture's lifetime (a mid-
    // gesture zoom doesn't retune snap tolerance — that's a
    // deliberate UX choice; consistency within a drag wins).
    const camera = this.camera.read();
    const cameraScale = camera.scale > 0 ? camera.scale : null;
    const reply = await this.send({
      kind: "beginGesture",
      payload: { nodes, gesture, anchor, cameraScale },
    });
    if (reply.kind === "gestureBegun") return reply.payload.handle;
    if (reply.kind === "gestureFailed") {
      throw new Error(`beginGesture failed: ${reply.payload.error.kind}`);
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Phase B — push a pointer delta into the active gesture. Worker
   * rewrites the preview + rebuilds. Phase E — the reply carries
   * the active snap lines so the overlay can render them.
   *
   * Step 5d — `mode: "sab"` routes the delta through the gesture
   * SAB instead of postMessage. Fire-and-forget (no reply): the
   * worker drains the SAB on its next tick and applies the latest
   * delta via `updateGestureRaw`. Returns an empty result —
   * callers that need snap-lines per update must stay on JSON.
   * SAB-mode requires `supportsGestureSab()` (crossOriginIsolated +
   * SharedArrayBuffer); the client silently falls back to JSON
   * otherwise so legacy environments stay correct.
   */
  async updateGesture(
    handle: GestureHandle,
    delta: [number, number],
    modifiers: GestureModifiers,
    mode: "json" | "sab" = "json",
  ): Promise<{ pageIds: PageId[]; snapLines: SnapLine[] }> {
    if (mode === "sab" && this.gestureSab.buffer instanceof SharedArrayBuffer) {
      this.gestureSab.push(BigInt(handle), delta[0], delta[1], modifiers);
      return { pageIds: [], snapLines: [] };
    }
    const reply = await this.send({
      kind: "updateGesture",
      payload: { handle, delta, modifiers },
    });
    if (reply.kind === "gestureUpdated") {
      return {
        pageIds: reply.payload.pageIds,
        snapLines: reply.payload.snapLines ?? [],
      };
    }
    if (reply.kind === "gestureFailed") {
      throw new Error(`updateGesture failed: ${reply.payload.error.kind}`);
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Phase B — commit the active gesture. Returns the new applied_seq
   * + dirty pages so the caller can update the HUD / undo state.
   */
  async commitGesture(handle: GestureHandle): Promise<{
    appliedSeq: number;
    pageIds: PageId[];
  }> {
    const reply = await this.send({
      kind: "commitGesture",
      payload: { handle },
    });
    if (reply.kind === "gestureCommitted") {
      return {
        appliedSeq: reply.payload.appliedSeq,
        pageIds: reply.payload.pageIds,
      };
    }
    if (reply.kind === "gestureFailed") {
      throw new Error(`commitGesture failed: ${reply.payload.error.kind}`);
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /**
   * Phase B — discard the active gesture. Worker reverts the preview;
   * resolves to the dirty pages set so the overlay can clear.
   */
  async cancelGesture(handle: GestureHandle): Promise<PageId[]> {
    const reply = await this.send({
      kind: "cancelGesture",
      payload: { handle },
    });
    if (reply.kind === "gestureCancelled") return reply.payload.pageIds;
    if (reply.kind === "gestureFailed") {
      throw new Error(`cancelGesture failed: ${reply.payload.error.kind}`);
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /** Phase 3 — fetch the caret rectangle for a selection. */
  async caretGeometry(selection: ContentSelection): Promise<CaretGeometry | null> {
    const reply = await this.send({
      kind: "requestCaretGeometry",
      payload: { selection },
    });
    if (reply.kind === "caretGeometry") return reply.payload.caret;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  /** Phase 3 — fetch rect-per-line selection geometry. */
  async selectionGeometry(selection: ContentSelection): Promise<SelectionRect[]> {
    const reply = await this.send({
      kind: "requestSelectionGeometry",
      payload: { selection },
    });
    if (reply.kind === "selectionGeometry") return reply.payload.rects;
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  async undo(): Promise<WorkerToMain> {
    return this.send({ kind: "undo" });
  }

  /**
   * Register a font in the worker's family resolver. Persists across
   * loadDocument calls; the renderer's `BytesResolver` will route any
   * `AppliedFont` matching `family` (+ optional `style`) to these
   * bytes. Mirrors `paged-inspect --font-family "Family=path"`.
   */
  async registerFont(
    family: string,
    bytes: Uint8Array,
    style: string | null = null,
  ): Promise<void> {
    const reply = await this.send({
      kind: "registerFont",
      payload: { family, style, bytes: Array.from(bytes) },
    });
    if (reply.kind !== "fontRegistered") {
      throw new Error(`unexpected reply: ${reply.kind}`);
    }
  }

  /** Drop every previously-registered font. */
  async clearFontRegistry(): Promise<void> {
    const reply = await this.send({ kind: "clearFontRegistry" });
    if (reply.kind !== "fontRegistryCleared") {
      throw new Error(`unexpected reply: ${reply.kind}`);
    }
  }

  /**
   * Sub-phase D — request a Vello/GPU readback PNG of one page.
   * Routes around the JSON channel because the underlying wasm
   * method is `Promise<Uint8Array>` and returning binary through
   * the seq-keyed envelope path serialises as a number array
   * (slow on large pages). Resolves to null when GPU is not
   * initialised (the caller falls back to `requestSnapshot`).
   */
  async requestVelloPng(pageId: PageId, dpi: number): Promise<Uint8Array | null> {
    const seq = this.nextVelloSeq++;
    const promise = new Promise<Uint8Array | null>((resolve) => {
      this.velloPending.set(seq, resolve);
    });
    this.worker.postMessage({ kind: "renderPageVelloPng", seq, pageId, dpi });
    return promise;
  }

  private nextVelloSeq = 1;
  private readonly velloPending = new Map<number, (bytes: Uint8Array | null) => void>();

  async redo(): Promise<WorkerToMain> {
    return this.send({ kind: "redo" });
  }

  /** Write the camera transform. Worker reads it on the next frame. */
  setCamera(cam: Camera): void {
    this.camera.write(cam);
  }

  /**
   * Transfer an OffscreenCanvas to the worker. The worker takes
   * ownership of the canvas's backing buffer and runs its render
   * loop against it. Call once per canvas; after the transfer the
   * main-thread `HTMLCanvasElement` cannot be drawn into directly.
   */
  attachCanvas(
    canvas: OffscreenCanvas,
    dpr: number,
    cssWidth: number,
    cssHeight: number,
  ): void {
    this.worker.postMessage(
      { kind: "attachCanvas", canvas, dpr, cssWidth, cssHeight },
      [canvas],
    );
  }

  /**
   * Notify the worker of a host canvas resize. Worker re-allocates
   * the OffscreenCanvas's backing pixel buffer to match.
   */
  resizeCanvas(dpr: number, cssWidth: number, cssHeight: number): void {
    this.worker.postMessage({ kind: "resizeCanvas", dpr, cssWidth, cssHeight });
  }

  dispose(): void {
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.terminate();
  }

  private readonly onMessage = (event: MessageEvent) => {
    // Side-channel: binary loadDocument reply (skip the JSON envelope
    // because the request payload was binary, see `loadDocument`).
    const raw = event.data as { kind?: string };
    if (raw && raw.kind === "loadDocumentBinaryReply") {
      const r = event.data as { seq: number; replyJson: string };
      const pending = this.loadDocPending.get(r.seq);
      if (!pending) return;
      this.loadDocPending.delete(r.seq);
      try {
        const reply = JSON.parse(r.replyJson) as WorkerToMain;
        if (reply.kind === "documentLoaded") {
          pending.resolve(reply.payload);
        } else if (reply.kind === "loadFailed") {
          const e = reply.payload.error;
          pending.reject(
            new Error(
              `load failed (${e.kind}): ${"message" in e ? e.message : ""}`,
            ),
          );
        } else {
          pending.reject(new Error(`unexpected reply kind: ${reply.kind}`));
        }
      } catch (err) {
        pending.reject(new Error(`malformed reply: ${String(err)}`));
      }
      // Fan out to listeners that care (e.g. the renderer's
      // documentLoaded → refreshLayout side-effect already runs on
      // the worker side; main-thread listeners that want to know
      // can subscribe).
      try {
        const parsed = JSON.parse(r.replyJson) as WorkerToMain;
        for (const l of this.listeners) l(parsed);
      } catch {
        // already handled
      }
      return;
    }
    // Sub-phase D side-channel: vello PNG readback replies bypass
    // the typed JSON envelope (transferable bytes ride directly).
    if (raw && raw.kind === "velloPngReply") {
      const reply = event.data as {
        kind: "velloPngReply";
        seq: number;
        pngBytes: number[] | null;
      };
      const cb = this.velloPending.get(reply.seq);
      if (cb) {
        this.velloPending.delete(reply.seq);
        cb(reply.pngBytes ? Uint8Array.from(reply.pngBytes) : null);
      }
      return;
    }
    const msg = event.data as WorkerToMain;
    // Resolve the matching `send(...)` promise first so the
    // request-reply path stays the lowest-latency one.
    if (msg.seq !== null) {
      const cb = this.pending.get(msg.seq);
      if (cb) {
        this.pending.delete(msg.seq);
        cb(msg);
      }
    }
    // Fan out to subscribers regardless of seq. Lets multiple parts
    // of the UI react to the same reply (e.g. CanvasApp updates the
    // cache-stats HUD on `mutationApplied` while the original
    // `client.mutate(...)` caller awaits the promise). Without this
    // broadcast, only the awaiter sees the reply.
    for (const l of this.listeners) {
      l(msg);
    }
  };
}
