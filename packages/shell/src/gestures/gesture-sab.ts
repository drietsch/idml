// SharedArrayBuffer contract for raw gesture updates.
//
// The only file in the shell that constructs / reads / writes a
// `SharedArrayBuffer` for gestures. Mirrors the camera SAB's
// single-writer (main thread) / single-reader (worker) pattern.
//
// Why a SAB instead of postMessage:
//   - A long drag fires `update_gesture` at pointer-event rate
//     (often well above the worker's tick rate).
//   - Posting every update through the typed channel pays the
//     structured-clone cost on each call.
//   - Only the LATEST delta per (handle, seq) matters; the worker
//     can coalesce stale updates without seeing them. The SAB
//     stores one slot — the most recent — and a generation counter
//     so the worker's tick knows whether to apply.
//
// SAB layout (little-endian, 32-byte buffer):
//
//   offset 0:  handle_lo     (u32)   — gesture handle low word
//   offset 4:  handle_hi     (u32)   — gesture handle high word
//   offset 8:  dx            (f32)   — pointer-delta x (page-local pt)
//   offset 12: dy            (f32)   — pointer-delta y (page-local pt)
//   offset 16: modifiers     (u32)   — bit 0 = shift, bit 1 = alt
//   offset 20: seq           (u32)   — bumps on every producer write
//   offset 24: generation_lo (u32)   — bumps on every write, atomic
//   offset 28: generation_hi (u32)   — generation high word
//
// Reads / writes that mutate the data block happen before the
// generation bump so the consumer sees a consistent record once
// it detects the generation change.

export const GESTURE_SAB_BYTES = 32;

const OFFSET_HANDLE_LO = 0;
const OFFSET_HANDLE_HI = 1; // u32 index
const OFFSET_DX = 2;
const OFFSET_DY = 3;
const OFFSET_MODIFIERS = 4;
const OFFSET_SEQ = 5;
const OFFSET_GEN_LO = 6;
const OFFSET_GEN_HI = 7;

export const GESTURE_MODIFIER_SHIFT = 1;
export const GESTURE_MODIFIER_ALT = 2;
/** Plan-2 §8.4 — Ctrl. Tells the snap pass to bypass entirely. */
export const GESTURE_MODIFIER_DISABLE_SNAP = 4;

export interface GestureUpdateRecord {
  /** Opaque gesture handle assigned by `begin_gesture`. */
  handle: bigint;
  /** Pointer delta in page-local pt. */
  dx: number;
  dy: number;
  modifiers: { shift: boolean; alt: boolean; disableSnap: boolean };
  /** Monotonic counter the producer bumps on every push. */
  seq: number;
}

/**
 * Wraps a SharedArrayBuffer (or ArrayBuffer fallback) holding one
 * gesture-update record + atomic generation counter. Constructed on
 * the main thread; the SAB is `postMessage`'d to the worker which
 * constructs its own `GestureBuffer` over the same memory.
 */
export class GestureBuffer {
  private readonly u32: Uint32Array;
  /** Float view over the same byte range. Required because
   *  `Atomics.store` rejects float typed arrays. */
  private readonly f32: Float32Array;
  /** Caches the last generation the consumer observed. */
  private lastGen = 0n;

  constructor(public readonly buffer: SharedArrayBuffer | ArrayBuffer) {
    if (buffer.byteLength < GESTURE_SAB_BYTES) {
      throw new RangeError(
        `gesture buffer must be ${GESTURE_SAB_BYTES} bytes, got ${buffer.byteLength}`,
      );
    }
    this.u32 = new Uint32Array(buffer, 0, 8);
    this.f32 = new Float32Array(buffer, 0, 8);
  }

  static allocate(): GestureBuffer {
    const isolated = supportsGestureSab();
    const sab = isolated
      ? new SharedArrayBuffer(GESTURE_SAB_BYTES)
      : new ArrayBuffer(GESTURE_SAB_BYTES);
    return new GestureBuffer(sab);
  }

  /** Producer (main thread). Writes the slot atomically and bumps
   *  the generation counter. The consumer's next drain observes the
   *  new record. */
  push(
    handle: bigint,
    dx: number,
    dy: number,
    modifiers: { shift: boolean; alt: boolean; disableSnap?: boolean },
  ): void {
    const handleLo = Number(handle & 0xffff_ffffn);
    const handleHi = Number((handle >> 32n) & 0xffff_ffffn);
    let modBits = 0;
    if (modifiers.shift) modBits |= GESTURE_MODIFIER_SHIFT;
    if (modifiers.alt) modBits |= GESTURE_MODIFIER_ALT;
    if (modifiers.disableSnap) modBits |= GESTURE_MODIFIER_DISABLE_SNAP;
    const seq = (this.u32[OFFSET_SEQ] + 1) >>> 0;
    if (this.buffer instanceof SharedArrayBuffer) {
      Atomics.store(this.u32, OFFSET_HANDLE_LO, handleLo);
      Atomics.store(this.u32, OFFSET_HANDLE_HI, handleHi);
      Atomics.store(this.u32, OFFSET_DX, floatBits(dx));
      Atomics.store(this.u32, OFFSET_DY, floatBits(dy));
      Atomics.store(this.u32, OFFSET_MODIFIERS, modBits >>> 0);
      Atomics.store(this.u32, OFFSET_SEQ, seq);
      Atomics.add(this.u32, OFFSET_GEN_LO, 1);
    } else {
      this.u32[OFFSET_HANDLE_LO] = handleLo;
      this.u32[OFFSET_HANDLE_HI] = handleHi;
      this.f32[OFFSET_DX] = dx;
      this.f32[OFFSET_DY] = dy;
      this.u32[OFFSET_MODIFIERS] = modBits >>> 0;
      this.u32[OFFSET_SEQ] = seq;
      this.u32[OFFSET_GEN_LO] = (this.u32[OFFSET_GEN_LO] + 1) >>> 0;
    }
  }

  /**
   * Consumer (worker). Returns the latest record if the generation
   * has advanced since the previous call; `null` when no new
   * updates have arrived. Coalescing: if the producer pushed N
   * times between drains, only the last one is observed.
   */
  drainLatest(): GestureUpdateRecord | null {
    const gen = this.generation();
    if (gen === this.lastGen) return null;
    this.lastGen = gen;
    const handleLo = BigInt(
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.u32, OFFSET_HANDLE_LO)
        : this.u32[OFFSET_HANDLE_LO],
    );
    const handleHi = BigInt(
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.u32, OFFSET_HANDLE_HI)
        : this.u32[OFFSET_HANDLE_HI],
    );
    const modBits =
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.u32, OFFSET_MODIFIERS)
        : this.u32[OFFSET_MODIFIERS];
    const seq =
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.u32, OFFSET_SEQ)
        : this.u32[OFFSET_SEQ];
    return {
      handle: (handleHi << 32n) | handleLo,
      dx: this.f32[OFFSET_DX],
      dy: this.f32[OFFSET_DY],
      modifiers: {
        shift: (modBits & GESTURE_MODIFIER_SHIFT) !== 0,
        alt: (modBits & GESTURE_MODIFIER_ALT) !== 0,
        disableSnap: (modBits & GESTURE_MODIFIER_DISABLE_SNAP) !== 0,
      },
      seq,
    };
  }

  /** 64-bit generation counter. */
  generation(): bigint {
    const lo = BigInt(
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.u32, OFFSET_GEN_LO)
        : this.u32[OFFSET_GEN_LO],
    );
    const hi = BigInt(
      this.buffer instanceof SharedArrayBuffer
        ? Atomics.load(this.u32, OFFSET_GEN_HI)
        : this.u32[OFFSET_GEN_HI],
    );
    return (hi << 32n) | lo;
  }
}

/**
 * Returns true when the runtime supports SharedArrayBuffer + the
 * cross-origin-isolated environment Atomics need. False on Safari
 * private mode + hosts that don't set COOP/COEP headers.
 */
export function supportsGestureSab(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof crossOriginIsolated !== "undefined" &&
    crossOriginIsolated
  );
}

// Helper to reinterpret a float as its u32 bit pattern. `Atomics.
// store` rejects float typed arrays, so for the SAB path we route
// through this scratch buffer.
const SCRATCH = new ArrayBuffer(4);
const SCRATCH_F32 = new Float32Array(SCRATCH);
const SCRATCH_U32 = new Uint32Array(SCRATCH);
function floatBits(v: number): number {
  SCRATCH_F32[0] = v;
  return SCRATCH_U32[0];
}
