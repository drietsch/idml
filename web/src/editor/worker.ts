/// <reference lib="webworker" />

// Editor worker stub.
//
// M0 scope: load idml-edit-wasm, post a "ready" message back to the
// main thread, prove the build chain works inside a Worker context.
// Real isolation of the model (ProjectHandle moves here, command bus
// flows over postMessage) lands in M1 with the first transient
// command — there's no benefit to splitting yet without commands
// where main-thread jitter would matter.

import init from "../wasm/idml_edit_wasm";

declare const self: DedicatedWorkerGlobalScope;

(async () => {
  try {
    await init();
    self.postMessage({ type: "ready" });
  } catch (e) {
    self.postMessage({
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }
})();

self.addEventListener("message", (ev) => {
  // M1: route command messages to the worker-side ProjectHandle here.
  // For now, echo unknown messages so the bridge contract is visible
  // during smoke testing.
  self.postMessage({ type: "echo", payload: ev.data });
});
