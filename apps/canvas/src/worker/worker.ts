// Web Worker entry. The main thread spawns this with
// `new Worker(new URL('./worker/worker.ts', import.meta.url),
//             { type: 'module' })`.
//
// Responsibilities:
//   - Load the `idml-canvas-wasm` bundle.
//   - Accept the camera SAB and the OffscreenCanvas via side-channel
//     messages (transferables, outside the typed JSON envelope).
//   - Run the worker-side render loop (see `./render.ts`).
//   - Receive `MainToWorker` envelopes, forward them to the wasm
//     `CanvasWorker::handleMessage`, post the reply back.
//
// Phase 1 sub-phase A wires the render loop using the CPU
// (tiny-skia) snapshot tier. Later sub-phases add WebGPU + Vello.

/// <reference lib="webworker" />
import type { MainToWorker, WorkerToMain } from "../channel/protocol";
import { PROTOCOL_VERSION } from "../channel/protocol";
import { CameraBuffer } from "../channel/camera";
import { WorkerRenderer, type RendererWasm } from "./render";

interface CanvasWorkerInstance {
  protocolVersion: number;
  handleMessage(input: string): string;
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
}

interface CanvasWasmModule {
  default: (input?: unknown) => Promise<unknown>;
  CanvasWorker: new () => CanvasWorkerInstance;
  cameraSabBytes: () => number;
}

let worker: CanvasWorkerInstance | null = null;
let cameraBuffer: CameraBuffer | null = null;
let renderer: WorkerRenderer | null = null;
/** Pending canvas attach that arrived before the wasm finished loading. */
let pendingAttach:
  | { canvas: OffscreenCanvas; dpr: number; cssWidth: number; cssHeight: number }
  | null = null;

async function init() {
  const mod = (await import("../wasm/idml_canvas_wasm.js")) as unknown as CanvasWasmModule;
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

self.addEventListener("message", async (event: MessageEvent) => {
  const data = event.data as
    | { kind: "channel"; msg: MainToWorker }
    | { kind: "cameraSab"; buffer: SharedArrayBuffer | ArrayBuffer }
    | {
        kind: "attachCanvas";
        canvas: OffscreenCanvas;
        dpr: number;
        cssWidth: number;
        cssHeight: number;
      }
    | { kind: "resizeCanvas"; dpr: number; cssWidth: number; cssHeight: number };

  if (data.kind === "cameraSab") {
    cameraBuffer = new CameraBuffer(data.buffer);
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
});

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
