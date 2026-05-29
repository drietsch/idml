// SharedArrayBuffer camera contract.
//
// Source of truth: `crates/idml-canvas/src/camera.rs` (constants
// `CAMERA_SAB_BYTES` + `OFFSET_*` + the `CameraSabLayout` tsify'd
// struct). The constants below MIRROR the Rust spec so a SAB allocation
// can run before wasm finishes loading; the worker reconciles via
// `assertSabContract` once wasm is up and posts a `protocolMismatch`
// warning on any drift.
//
// The main thread is the single writer; the worker is the single
// reader (per frame, at the start of the render loop).
//
// SAB layout (little-endian, 32-byte buffer):
//
//   offset 0:  scale       (f32)
//   offset 4:  tx          (f32)
//   offset 8:  ty          (f32)
//   offset 12: unused
//   offset 16: generationLo (u32)
//   offset 20: generationHi (u32)
//   offset 24: unused
//   offset 28: unused

export const CAMERA_SAB_BYTES = 32;

export const OFFSET_SCALE = 0;
export const OFFSET_TX = 4;
export const OFFSET_TY = 8;
export const OFFSET_GEN_LO = 16;
export const OFFSET_GEN_HI = 20;

export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export const IDENTITY_CAMERA: Camera = { scale: 1, tx: 0, ty: 0 };

/**
 * Wraps a SharedArrayBuffer-backed camera transform. Constructed
 * on the main thread; the SAB itself is `postMessage`'d to the
 * worker which constructs its own `CameraBuffer` over the same SAB.
 *
 * SharedArrayBuffer requires cross-origin isolation (COOP + COEP
 * headers). On hosts without that, callers can pass a regular
 * `ArrayBuffer` instead; reads will be torn occasionally, but
 * functionality is preserved (per canvas spec §12.4).
 */
export class CameraBuffer {
  private readonly f32: Float32Array;
  /**
   * `Uint32Array` view over the same byte range as `f32`. Required
   * because `Atomics.store` rejects float typed arrays — we
   * reinterpret the f32 bit pattern as u32 and store through this
   * view. Bytewise identical to writing the float directly.
   */
  private readonly f32AsU32: Uint32Array;
  private readonly genU32: Uint32Array;

  constructor(public readonly buffer: SharedArrayBuffer | ArrayBuffer) {
    if (buffer.byteLength < CAMERA_SAB_BYTES) {
      throw new RangeError(
        `camera buffer must be ${CAMERA_SAB_BYTES} bytes, got ${buffer.byteLength}`,
      );
    }
    this.f32 = new Float32Array(buffer, 0, 3);
    this.f32AsU32 = new Uint32Array(buffer, 0, 3);
    this.genU32 = new Uint32Array(buffer, OFFSET_GEN_LO, 2);
  }

  static allocate(): CameraBuffer {
    const sab = supportsSharedArrayBuffer()
      ? new SharedArrayBuffer(CAMERA_SAB_BYTES)
      : new ArrayBuffer(CAMERA_SAB_BYTES);
    return new CameraBuffer(sab);
  }

  /**
   * Read the current camera. Reader-side: called once per worker
   * render frame after `Atomics.load`ing the generation counter.
   */
  read(): Camera {
    return {
      scale: this.f32[0],
      tx: this.f32[1],
      ty: this.f32[2],
    };
  }

  /**
   * Write a new camera and bump the generation counter. Main-thread
   * only — called from input handlers, animation frames, and the
   * navigator's `goToPage`. Field writes happen before the generation
   * bump so the worker sees consistent state once it detects the
   * generation change.
   */
  write(cam: Camera): void {
    if (this.buffer instanceof SharedArrayBuffer) {
      // Real atomic path: field writes then a generation bump.
      // The race window for a torn read on the field block is the
      // few CPU cycles between these stores; the worker observes it
      // as a single-frame visual glitch and the next frame is clean.
      Atomics.store(this.f32AsU32, 0, floatBits(cam.scale));
      Atomics.store(this.f32AsU32, 1, floatBits(cam.tx));
      Atomics.store(this.f32AsU32, 2, floatBits(cam.ty));
      Atomics.add(this.genU32, 0, 1);
    } else {
      // Non-SAB fallback: plain stores, no atomics.
      this.f32[0] = cam.scale;
      this.f32[1] = cam.tx;
      this.f32[2] = cam.ty;
      this.genU32[0] = (this.genU32[0] + 1) >>> 0;
    }
  }

  /**
   * Read the 64-bit generation counter. The worker reads this at
   * the start of every frame; if the value changed since last
   * frame, the camera fields are re-read.
   */
  generation(): bigint {
    const lo = BigInt(
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.genU32, 0)
        : this.genU32[0],
    );
    const hi = BigInt(
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.genU32, 1)
        : this.genU32[1],
    );
    return (hi << 32n) | lo;
  }
}

export function supportsSharedArrayBuffer(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof crossOriginIsolated !== "undefined" &&
    crossOriginIsolated
  );
}

// Helper to reinterpret a float as a u32 bit pattern. Used because
// `Atomics.store` only accepts integer typed arrays.
const SCRATCH = new ArrayBuffer(4);
const SCRATCH_F32 = new Float32Array(SCRATCH);
const SCRATCH_U32 = new Uint32Array(SCRATCH);
function floatBits(v: number): number {
  SCRATCH_F32[0] = v;
  return SCRATCH_U32[0];
}

export function docToViewport(cam: Camera, x: number, y: number): [number, number] {
  return [x * cam.scale + cam.tx, y * cam.scale + cam.ty];
}

export function viewportToDoc(cam: Camera, x: number, y: number): [number, number] {
  const inv = 1 / cam.scale;
  return [(x - cam.tx) * inv, (y - cam.ty) * inv];
}
