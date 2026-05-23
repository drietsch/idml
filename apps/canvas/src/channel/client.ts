// Main-thread client for the canvas worker.
//
// Owns the worker handle, the next outgoing seq, the reply
// pending-promise table, and the camera SAB. UI code sends typed
// messages and awaits typed replies; the protocol envelope shape
// stays internal.

import {
  PROTOCOL_VERSION,
  type DocumentHandle,
  type LodTier,
  type MainToWorker,
  type MainToWorkerKind,
  type Mutation,
  type PageId,
  type SnapshotPng,
  type WorkerToMain,
} from "./protocol";
import { CameraBuffer, type Camera } from "./camera";

type PendingReply = (msg: WorkerToMain) => void;

export class CanvasClient {
  private readonly worker: Worker;
  private nextSeq = 1;
  private readonly pending = new Map<number, PendingReply>();
  private readonly listeners = new Set<(msg: WorkerToMain) => void>();
  readonly camera: CameraBuffer;

  constructor() {
    this.worker = new Worker(new URL("../worker/worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.onMessage);
    this.camera = CameraBuffer.allocate();
    this.worker.postMessage({ kind: "cameraSab", buffer: this.camera.buffer });
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

  /** Convenience: type-narrow `documentLoaded` reply. */
  async loadDocument(
    bytes: Uint8Array,
    font?: Uint8Array,
    cmykIccProfile?: Uint8Array,
  ): Promise<DocumentHandle> {
    const reply = await this.send({
      kind: "loadDocument",
      payload: {
        bytes: Array.from(bytes),
        font: font ? Array.from(font) : null,
        cmykIccProfile: cmykIccProfile ? Array.from(cmykIccProfile) : null,
      },
    });
    if (reply.kind === "documentLoaded") {
      return reply.payload;
    }
    if (reply.kind === "loadFailed") {
      throw new Error(
        `load failed (${reply.payload.error.kind}): ${
          "message" in reply.payload.error ? reply.payload.error.message : ""
        }`,
      );
    }
    throw new Error(`unexpected reply: ${reply.kind}`);
  }

  async requestPage(pageId: PageId, lod: LodTier): Promise<WorkerToMain> {
    return this.send({ kind: "requestPage", payload: { pageId, lod } });
  }

  /**
   * Request a low-resolution snapshot for the navigator / overview.
   * Resolves to the PNG bytes; throws if the worker errors.
   */
  async requestSnapshot(pageId: PageId, targetWidthPx: number): Promise<SnapshotPng> {
    const reply = await this.send({
      kind: "requestSnapshot",
      payload: { pageId, targetWidthPx },
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
    const msg = event.data as WorkerToMain;
    if (msg.seq !== null) {
      const cb = this.pending.get(msg.seq);
      if (cb) {
        this.pending.delete(msg.seq);
        cb(msg);
        return;
      }
    }
    for (const l of this.listeners) {
      l(msg);
    }
  };
}
