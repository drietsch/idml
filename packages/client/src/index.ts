// @paged-media/client — the framework-agnostic canvas client.
//
// Public surface: CanvasClient + the wire types + SAB primitives.
// No React, no DOM dependencies beyond Worker + SharedArrayBuffer.
// The package is shared verbatim between the editor UI and the
// embedded Boa script bridge (which sees the same types via tsify).

export { CanvasClient, type CanvasClientOptions } from "./client";

// Wire-format types — re-exports of the tsify-generated types from
// `crates/paged-canvas/src/channel.rs`. See `./protocol.ts`.
export * from "./protocol";

// SAB primitives.
export {
  CameraBuffer,
  CAMERA_SAB_BYTES,
  OFFSET_SCALE,
  OFFSET_TX,
  OFFSET_TY,
  OFFSET_GEN_LO,
  OFFSET_GEN_HI,
  IDENTITY_CAMERA,
  supportsSharedArrayBuffer,
  docToViewport,
  viewportToDoc,
  type Camera,
} from "./sab/camera";
export {
  GestureBuffer,
  GESTURE_SAB_BYTES,
  GESTURE_SAB_OFFSETS,
  GESTURE_MODIFIER_SHIFT,
  GESTURE_MODIFIER_ALT,
  GESTURE_MODIFIER_DISABLE_SNAP,
  supportsGestureSab,
  type GestureUpdateRecord,
} from "./sab/gesture";
