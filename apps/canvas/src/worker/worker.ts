// Web Worker entry. The main thread spawns this with
// `new Worker(new URL('./worker/worker.ts', import.meta.url),
//             { type: 'module' })`.
//
// Responsibilities:
//   - Load the `paged-canvas-wasm` bundle.
//   - Accept the camera SAB and the OffscreenCanvas via side-channel
//     messages (transferables, outside the typed JSON envelope).
//   - Run the worker-side render loop (see `./render.ts`).
//   - Receive `MainToWorker` envelopes, forward them to the wasm
//     `CanvasWorker::handleMessage`, post the reply back.
//
// Phase 1 sub-phase A wires the render loop using the CPU
// (tiny-skia) snapshot tier. Later sub-phases add WebGPU + Vello.

/// <reference lib="webworker" />
import type {
  CameraSabLayout,
  GestureSabLayout,
  MainToWorker,
  SnapLine,
  WorkerToMain,
} from "@paged-media/client";
import { PROTOCOL_VERSION } from "@paged-media/client";
import { CameraBuffer, CAMERA_SAB_BYTES, OFFSET_GEN_LO as CAMERA_OFFSET_GEN_LO, OFFSET_GEN_HI as CAMERA_OFFSET_GEN_HI, OFFSET_SCALE as CAMERA_OFFSET_SCALE, OFFSET_TX as CAMERA_OFFSET_TX, OFFSET_TY as CAMERA_OFFSET_TY } from "@paged-media/client";
// `@paged-media/client` has no React; safe to import from the barrel.
// (Pre-Phase-1 this was a deep-import to bypass the @paged-media/shell
// barrel; after the package split that workaround is unnecessary
// because client's barrel is React-free by lint.)
import {
  GestureBuffer,
  GESTURE_SAB_BYTES,
  GESTURE_MODIFIER_SHIFT,
  GESTURE_MODIFIER_ALT,
  GESTURE_MODIFIER_DISABLE_SNAP,
  GESTURE_SAB_OFFSETS,
} from "@paged-media/client";
import { WorkerRenderer, type RendererWasm } from "./render";

interface CanvasWorkerInstance {
  protocolVersion: number;
  handleMessage(input: string): string;
  /**
   * Step 5d/5e — raw-arg updateGesture entry. Returns an empty string
   * on failure (no document loaded or gesture has gone stale). On
   * success returns a JSON string of `{ pageIds, snapLines }` so the
   * worker can post a `gestureSnapLines` notify + scope its dirty
   * invalidation without re-querying.
   */
  updateGestureRaw(
    handleLo: number,
    handleHi: number,
    dx: number,
    dy: number,
    modifierBits: number,
  ): string;
  pageCount(): number;
  pageInfo(index: number): unknown;
  renderTilePng(pageId: string, targetWidthPx: number): Uint8Array | undefined;
  runResolveJson(): string | undefined;
  free(): void;
  // GPU surface, only present when the `gpu` feature is enabled at
  // build time. The worker probes via `gpuReady` after `initGpu`.
  initGpu?(canvas: OffscreenCanvas, width: number, height: number): Promise<boolean>;
  resizeGpu?(width: number, height: number): void;
  presentFrame?(scale: number, tx: number, ty: number, dpr: number): boolean;
  gpuReady?(): boolean;
  /** Sub-phase D — Vello/GPU readback path for the fidelity suite. */
  renderPageVelloPng?(pageId: string, dpi: number): Promise<Uint8Array | undefined>;
  loadDocumentDirect(
    seq: number,
    bytes: Uint8Array,
    font?: Uint8Array,
    cmykIccProfile?: Uint8Array,
  ): string;
}

interface CanvasWasmModule {
  default: (input?: unknown) => Promise<unknown>;
  CanvasWorker: new () => CanvasWorkerInstance;
  /** SAB byte size + offsets — Rust is the single source of truth.
   *  TS-side mirrors get reconciled in `assertSabContract` below. */
  cameraSabBytes: () => number;
  cameraSabLayout: () => CameraSabLayout;
  gestureSabBytes: () => number;
  gestureSabLayout: () => GestureSabLayout;
}

let worker: CanvasWorkerInstance | null = null;
let cameraBuffer: CameraBuffer | null = null;
let gestureBuffer: GestureBuffer | null = null;
let gestureDrainHandle: ReturnType<typeof setTimeout> | null = null;
let renderer: WorkerRenderer | null = null;
/** Pending canvas attach that arrived before the wasm finished loading. */
let pendingAttach:
  | { canvas: OffscreenCanvas; dpr: number; cssWidth: number; cssHeight: number }
  | null = null;

/**
 * SAB-contract reconciliation. Rust owns the canonical byte size +
 * offsets + modifier bit masks (see `crates/paged-canvas/src/camera.rs`
 * + `gesture.rs`). The TS-side mirrors live in `@paged-media/client`'s
 * `sab/camera.ts` + `sab/gesture.ts` modules — same values declared
 * inline so they can be used at module-load time (the SAB is
 * allocated before wasm has finished loading). This function runs
 * once wasm is up and asserts the two sides match — a Rust-side
 * change to the layout that ships without a TS-side update fires a
 * `protocolMismatch` warning here, the same shape the PROTOCOL_VERSION
 * reconciliation uses.
 */
function assertSabContract(mod: CanvasWasmModule): string | null {
  const cam = mod.cameraSabLayout();
  const ges = mod.gestureSabLayout();
  const drift: string[] = [];
  if (cam.bytes !== CAMERA_SAB_BYTES) {
    drift.push(`camera.bytes ${cam.bytes} != TS ${CAMERA_SAB_BYTES}`);
  }
  if (cam.offsetScale !== CAMERA_OFFSET_SCALE) {
    drift.push(`camera.offsetScale ${cam.offsetScale} != TS ${CAMERA_OFFSET_SCALE}`);
  }
  if (cam.offsetTx !== CAMERA_OFFSET_TX) {
    drift.push(`camera.offsetTx ${cam.offsetTx} != TS ${CAMERA_OFFSET_TX}`);
  }
  if (cam.offsetTy !== CAMERA_OFFSET_TY) {
    drift.push(`camera.offsetTy ${cam.offsetTy} != TS ${CAMERA_OFFSET_TY}`);
  }
  if (cam.offsetGenLo !== CAMERA_OFFSET_GEN_LO) {
    drift.push(`camera.offsetGenLo ${cam.offsetGenLo} != TS ${CAMERA_OFFSET_GEN_LO}`);
  }
  if (cam.offsetGenHi !== CAMERA_OFFSET_GEN_HI) {
    drift.push(`camera.offsetGenHi ${cam.offsetGenHi} != TS ${CAMERA_OFFSET_GEN_HI}`);
  }
  if (ges.bytes !== GESTURE_SAB_BYTES) {
    drift.push(`gesture.bytes ${ges.bytes} != TS ${GESTURE_SAB_BYTES}`);
  }
  if (ges.offsetHandleLo !== GESTURE_SAB_OFFSETS.handleLo) {
    drift.push(`gesture.offsetHandleLo ${ges.offsetHandleLo} != TS ${GESTURE_SAB_OFFSETS.handleLo}`);
  }
  if (ges.offsetHandleHi !== GESTURE_SAB_OFFSETS.handleHi) {
    drift.push(`gesture.offsetHandleHi ${ges.offsetHandleHi} != TS ${GESTURE_SAB_OFFSETS.handleHi}`);
  }
  if (ges.offsetDx !== GESTURE_SAB_OFFSETS.dx) {
    drift.push(`gesture.offsetDx ${ges.offsetDx} != TS ${GESTURE_SAB_OFFSETS.dx}`);
  }
  if (ges.offsetDy !== GESTURE_SAB_OFFSETS.dy) {
    drift.push(`gesture.offsetDy ${ges.offsetDy} != TS ${GESTURE_SAB_OFFSETS.dy}`);
  }
  if (ges.offsetModifiers !== GESTURE_SAB_OFFSETS.modifiers) {
    drift.push(`gesture.offsetModifiers ${ges.offsetModifiers} != TS ${GESTURE_SAB_OFFSETS.modifiers}`);
  }
  if (ges.offsetSeq !== GESTURE_SAB_OFFSETS.seq) {
    drift.push(`gesture.offsetSeq ${ges.offsetSeq} != TS ${GESTURE_SAB_OFFSETS.seq}`);
  }
  if (ges.offsetGenLo !== GESTURE_SAB_OFFSETS.genLo) {
    drift.push(`gesture.offsetGenLo ${ges.offsetGenLo} != TS ${GESTURE_SAB_OFFSETS.genLo}`);
  }
  if (ges.offsetGenHi !== GESTURE_SAB_OFFSETS.genHi) {
    drift.push(`gesture.offsetGenHi ${ges.offsetGenHi} != TS ${GESTURE_SAB_OFFSETS.genHi}`);
  }
  if (ges.modifierShift !== GESTURE_MODIFIER_SHIFT) {
    drift.push(`gesture.modifierShift ${ges.modifierShift} != TS ${GESTURE_MODIFIER_SHIFT}`);
  }
  if (ges.modifierAlt !== GESTURE_MODIFIER_ALT) {
    drift.push(`gesture.modifierAlt ${ges.modifierAlt} != TS ${GESTURE_MODIFIER_ALT}`);
  }
  if (ges.modifierDisableSnap !== GESTURE_MODIFIER_DISABLE_SNAP) {
    drift.push(
      `gesture.modifierDisableSnap ${ges.modifierDisableSnap} != TS ${GESTURE_MODIFIER_DISABLE_SNAP}`,
    );
  }
  return drift.length === 0 ? null : drift.join("; ");
}

async function init() {
  // SDK Phase 1 — the wasm-bindgen output lives in `@paged-media/client`
  // (see `apps/canvas/build-wasm.sh` OUT_DIR). Deep relative path
  // here so the dynamic import resolves through Vite's module graph
  // without going through any package barrel — the wasm loader
  // pulls itself in lazily and we don't want anything pre-evaluated.
  const mod = (await import(
    "../../../../packages/client/src/wasm/paged_canvas_wasm.js"
  )) as unknown as CanvasWasmModule;
  await mod.default();
  worker = new mod.CanvasWorker();
  if (worker.protocolVersion !== PROTOCOL_VERSION) {
    postBack({
      seq: null,
      protocol: worker.protocolVersion,
      kind: "warning",
      payload: {
        kind: "protocolMismatch",
        details: `worker WASM is v${worker.protocolVersion}, JS bundle is v${PROTOCOL_VERSION}`,
      },
    });
  }
  const sabDrift = assertSabContract(mod);
  if (sabDrift !== null) {
    postBack({
      seq: null,
      protocol: worker.protocolVersion,
      kind: "warning",
      payload: {
        kind: "protocolMismatch",
        details: `SAB layout drift between Rust and TS: ${sabDrift}`,
      },
    });
  }
  // Drain pending attach if the canvas arrived before the wasm.
  if (pendingAttach && cameraBuffer) {
    attachRenderer(
      pendingAttach.canvas,
      pendingAttach.dpr,
      pendingAttach.cssWidth,
      pendingAttach.cssHeight,
    );
    pendingAttach = null;
  }
}

const initPromise = init().catch((err) => {
  postBack({
    seq: null,
    protocol: PROTOCOL_VERSION,
    kind: "warning",
    payload: { kind: "initFailed", details: String(err) },
  });
});

// Incoming messages must be processed strictly in order. The wasm
// `handleMessage` call is synchronous and short, but `attachCanvas`'s
// `initGpu` is async — during its awaits the event loop is free to
// fire another `message` listener, which would re-enter wasm with a
// stale borrow. Rust panics with "recursive use of an object detected
// which would lead to unsafe aliasing in rust". Queue every event and
// drain via a single async pump.
type IncomingMessage =
  | { kind: "channel"; msg: MainToWorker }
  | { kind: "cameraSab"; buffer: SharedArrayBuffer | ArrayBuffer }
  | { kind: "gestureSab"; buffer: SharedArrayBuffer | ArrayBuffer }
  | {
      kind: "attachCanvas";
      canvas: OffscreenCanvas;
      dpr: number;
      cssWidth: number;
      cssHeight: number;
    }
  | { kind: "resizeCanvas"; dpr: number; cssWidth: number; cssHeight: number }
  | { kind: "renderPageVelloPng"; seq: number; pageId: string; dpi: number }
  | {
      kind: "loadDocumentBinary";
      seq: number;
      bytes: Uint8Array;
      font: Uint8Array | null;
      cmykIccProfile: Uint8Array | null;
    };

const messageQueue: IncomingMessage[] = [];
let pumping = false;

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (messageQueue.length > 0) {
      const data = messageQueue.shift()!;
      try {
        await dispatch(data);
      } catch (err) {
        // Surface the failure but keep draining — a hung pump strands
        // every subsequent message (e.g. a failing attachCanvas would
        // block every requestSnapshot behind it).
        postBack({
          seq: null,
          protocol: PROTOCOL_VERSION,
          kind: "warning",
          payload: {
            kind: "dispatchError",
            details: `${data.kind}: ${String(err)}`,
          },
        });
      }
    }
  } finally {
    pumping = false;
  }
}

self.addEventListener("message", (event: MessageEvent) => {
  messageQueue.push(event.data as IncomingMessage);
  void pump();
});

async function dispatch(data: IncomingMessage): Promise<void> {
  if (data.kind === "cameraSab") {
    cameraBuffer = new CameraBuffer(data.buffer);
    return;
  }
  if (data.kind === "gestureSab") {
    gestureBuffer = new GestureBuffer(data.buffer);
    startGestureDrain();
    return;
  }
  if (data.kind === "attachCanvas") {
    await initPromise;
    if (!cameraBuffer) {
      pendingAttach = data;
      return;
    }
    await attachRenderer(data.canvas, data.dpr, data.cssWidth, data.cssHeight);
    return;
  }
  if (data.kind === "loadDocumentBinary") {
    await initPromise;
    if (!worker) {
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({
        kind: "loadDocumentBinaryReply",
        seq: data.seq,
        replyJson: JSON.stringify({
          seq: data.seq,
          protocol: PROTOCOL_VERSION,
          kind: "loadFailed",
          payload: { error: { kind: "parse", message: "worker not initialised" } },
        }),
      });
      return;
    }
    const replyJson = worker.loadDocumentDirect(
      data.seq,
      data.bytes,
      data.font ?? undefined,
      data.cmykIccProfile ?? undefined,
    );
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      kind: "loadDocumentBinaryReply",
      seq: data.seq,
      replyJson,
    });
    // Mirror the post-load side-effects of the JSON channel:
    // refresh the renderer's page layout + run the Tier 3 resolver.
    try {
      const reply = JSON.parse(replyJson) as WorkerToMain;
      if (reply.kind === "documentLoaded") {
        if (renderer) renderer.refreshLayout();
        const resolutionJson = worker.runResolveJson();
        if (resolutionJson) {
          const payload = JSON.parse(resolutionJson);
          postBack({
            seq: null,
            protocol: PROTOCOL_VERSION,
            kind: "resolutionDone",
            payload,
          });
        }
      }
    } catch (e) {
      console.warn("loadDocumentBinary post-process:", e);
    }
    return;
  }
  if (data.kind === "renderPageVelloPng") {
    await initPromise;
    let pngBytes: Uint8Array | undefined;
    if (worker?.renderPageVelloPng) {
      try {
        pngBytes = await worker.renderPageVelloPng(data.pageId, data.dpi);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("renderPageVelloPng threw:", err);
      }
    }
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      kind: "velloPngReply",
      seq: data.seq,
      pngBytes: pngBytes ? Array.from(pngBytes) : null,
    });
    return;
  }
  if (data.kind === "resizeCanvas") {
    if (renderer) {
      renderer.applySize(data.dpr, data.cssWidth, data.cssHeight);
    }
    if (worker?.resizeGpu) {
      const w = Math.max(1, Math.round(data.cssWidth * data.dpr));
      const h = Math.max(1, Math.round(data.cssHeight * data.dpr));
      worker.resizeGpu(w, h);
    }
    return;
  }

  // Default: the typed JSON channel.
  await initPromise;
  if (!worker) {
    return;
  }
  const replyJson = worker.handleMessage(JSON.stringify(data.msg));
  if (replyJson) {
    const reply = JSON.parse(replyJson) as WorkerToMain;
    postBack(reply);
    // A successful DocumentLoaded means our model is fresh; the
    // renderer needs its page layout rebuilt, and the Tier 3
    // resolver should run once so the UI can show anchor + page-
    // number facts.
    if (reply.kind === "documentLoaded") {
      if (renderer) {
        renderer.refreshLayout();
      }
      const resolutionJson = worker.runResolveJson();
      if (resolutionJson) {
        try {
          const payload = JSON.parse(resolutionJson);
          postBack({
            seq: null,
            protocol: PROTOCOL_VERSION,
            kind: "resolutionDone",
            payload,
          });
        } catch (e) {
          console.warn("resolution JSON parse failed:", e);
        }
      }
    } else if (
      reply.kind === "mutationApplied" ||
      reply.kind === "undoApplied" ||
      reply.kind === "redoApplied"
    ) {
      // Model has changed — invalidate cached tiles for the
      // affected pages and let the render loop redraw on the next
      // tick. On the GPU path the worker already cleared its
      // scene_cache so presentFrame rebuilds.
      if (renderer) {
        renderer.markDirty(reply.payload?.pageIds ?? []);
      }
    }
  }
}

async function attachRenderer(
  canvas: OffscreenCanvas,
  dpr: number,
  cssWidth: number,
  cssHeight: number,
): Promise<void> {
  if (!worker || !cameraBuffer) return;
  if (renderer) {
    renderer.stop();
  }

  // GPU-first attempt: a successful `initGpu` claims the
  // OffscreenCanvas's WebGPU context. If it fails, the canvas is
  // still virgin and we can still grab a 2D context for the CPU
  // path. The order matters — once `getContext("2d")` is called,
  // requesting WebGPU on the same canvas is illegal.
  let gpuActive = false;
  if (worker.initGpu) {
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    try {
      gpuActive = await worker.initGpu(canvas, w, h);
    } catch (err) {
      console.warn("initGpu threw:", err);
      gpuActive = false;
    }
  }

  const wasmShim: RendererWasm = {
    pageCount: () => worker!.pageCount(),
    pageInfo: (index) => {
      const arr = worker!.pageInfo(index) as unknown as
        | [string, number, number]
        | undefined;
      return arr;
    },
    renderTilePng: (pageId, widthPx) => worker!.renderTilePng(pageId, widthPx),
    presentFrame: gpuActive && worker.presentFrame
      ? (s, x, y, d) => worker!.presentFrame!(s, x, y, d)
      : undefined,
  };

  renderer = new WorkerRenderer(canvas, wasmShim, cameraBuffer, dpr, cssWidth, cssHeight, {
    gpuActive,
  });
  if (worker.pageCount() > 0) {
    renderer.refreshLayout();
  }
  renderer.start();
  // Notify the main thread so the HUD can show the GPU/CPU badge
  // and the developer console can confirm initGpu's outcome.
  postBack({
    seq: null,
    protocol: PROTOCOL_VERSION,
    kind: "attachReady",
    payload: { gpuActive, sceneCacheBudget: 200 },
  });
}

function postBack(msg: WorkerToMain) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

// Step 5d/5e — gesture SAB drain loop. Polls the gesture buffer
// every 8ms (~120 Hz so pointer-rate updates land in the next
// tick). On a fresh record the wasm `updateGestureRaw` applies
// the delta directly — no JSON envelope, no postMessage in. The
// returned JSON carries the dirty page set + the active snap
// guides; 5e surfaces those as an unsolicited
// `gestureSnapLines` notification so the overlay can still
// render guides while the gesture takes the SAB hot path.
const GESTURE_DRAIN_INTERVAL_MS = 8;

interface GestureRawOutcome {
  pageIds: string[];
  snapLines: SnapLine[];
}

function startGestureDrain() {
  if (gestureDrainHandle !== null) return;
  const tick = () => {
    gestureDrainHandle = setTimeout(tick, GESTURE_DRAIN_INTERVAL_MS);
    if (!worker || !gestureBuffer) return;
    const record = gestureBuffer.drainLatest();
    if (!record) return;
    const handleLo = Number(record.handle & 0xffff_ffffn);
    const handleHi = Number((record.handle >> 32n) & 0xffff_ffffn);
    let mods = 0;
    if (record.modifiers.shift) mods |= 0b001;
    if (record.modifiers.alt) mods |= 0b010;
    if (record.modifiers.disableSnap) mods |= 0b100;
    const outcomeJson = worker.updateGestureRaw(
      handleLo,
      handleHi,
      record.dx,
      record.dy,
      mods,
    );
    if (!outcomeJson) {
      // Stale handle or no document. The main thread's
      // `cancelGesture` path will clear the overlay separately.
      return;
    }
    let outcome: GestureRawOutcome;
    try {
      outcome = JSON.parse(outcomeJson) as GestureRawOutcome;
    } catch (e) {
      console.warn("updateGestureRaw outcome parse failed:", e);
      return;
    }
    renderer?.markDirty(outcome.pageIds);
    // Empty `snapLines` is meaningful — the gesture left a
    // previously-snapped axis and the overlay must clear its stale
    // guides. Post unconditionally so subscribers see every drain.
    postBack({
      seq: null,
      protocol: PROTOCOL_VERSION,
      kind: "gestureSnapLines",
      payload: { snapLines: outcome.snapLines },
    });
  };
  tick();
}
