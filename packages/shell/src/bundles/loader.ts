// The ONLY file in the shell that constructs `new Worker(...)`.
// Same isolation discipline as `dockview-substrate.ts` — bundles
// talk to the shell exclusively through `BundleHandle`; the worker
// primitive doesn't leak.

import type { BundleHandle, BundleManifest } from "./manifest";
import type { BundleToShell, ShellToBundle } from "./protocol";
import type { ShellRegistries } from "../state/registries-context";
import type { Disposable } from "../registries/types";

const READY_TIMEOUT_MS = 5_000;
const TERMINATE_GRACE_MS = 200;

/**
 * Spawn a Web Worker from the manifest's kernel URL, install a
 * message router, send `activate`, await `ready`. Every contribution
 * the kernel posts back installs in the appropriate shell registry;
 * the loader retains the resulting `Disposable`s so `dispose()` can
 * unwind them.
 *
 * Bundles register commands, keybindings, menu items, and semantic
 * groups in Step 4. Panel contributions are deferred — panels need
 * React, and a worker can't ship one. Future panel-sandbox work
 * (iframe / shadow-DOM render channel) widens the surface.
 */
export async function loadBundle(
  manifest: BundleManifest,
  registries: ShellRegistries,
): Promise<BundleHandle> {
  const worker = new Worker(manifest.kernel, { type: "module" });
  const disposables: Disposable[] = [];
  const pendingInvokes = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  let nextRequestId = 0;
  let active = false;

  const send = (msg: ShellToBundle) => {
    worker.postMessage(msg);
  };

  const handleRegister = (msg: BundleToShell) => {
    switch (msg.kind) {
      case "registerCommand": {
        const commandId = msg.id;
        const handle = registries.commands.register({
          id: commandId,
          title: msg.title,
          category: msg.category,
          handler: () => {
            const requestId = String(nextRequestId++);
            return new Promise<unknown>((resolve, reject) => {
              pendingInvokes.set(requestId, { resolve, reject });
              send({ kind: "invoke", requestId, commandId });
            });
          },
        });
        disposables.push(handle);
        break;
      }
      case "registerKeybinding": {
        try {
          const handle = registries.keybindings.register({
            key: msg.key,
            command: msg.commandId,
          });
          disposables.push(handle);
        } catch (err) {
          // Malformed key string — log and continue. The shell
          // shouldn't crash because a bundle has a bad manifest.
          // eslint-disable-next-line no-console
          console.warn(
            `[bundle:${manifest.id}] keybinding "${msg.key}" rejected:`,
            err,
          );
        }
        break;
      }
      case "registerMenuItem": {
        const handle = registries.menus.register({
          path: msg.path,
          command: msg.commandId,
          order: msg.order,
          group: msg.group,
        });
        disposables.push(handle);
        break;
      }
      case "registerSemanticGroup": {
        // Semantic group registry hands runtime IDs out via its
        // `resolve` callback. Bundles don't create groups in Step 4
        // (panels are out of scope); this message is reserved for
        // when bundles can contribute panels.
        break;
      }
      case "invokeResult": {
        const pending = pendingInvokes.get(msg.requestId);
        if (pending) {
          pendingInvokes.delete(msg.requestId);
          if (msg.ok) pending.resolve(msg.value);
          else pending.reject(new Error(msg.error ?? "bundle invocation failed"));
        }
        break;
      }
      case "log": {
        // eslint-disable-next-line no-console
        console[msg.level](`[bundle:${manifest.id}] ${msg.message}`);
        break;
      }
      case "ready": {
        // Handled by the ready-promise below.
        break;
      }
    }
  };

  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          `loadBundle("${manifest.id}"): kernel did not signal ready within ${READY_TIMEOUT_MS}ms`,
        ),
      );
    }, READY_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as BundleToShell;
      if (msg.kind === "ready") {
        window.clearTimeout(timeout);
        active = true;
        resolve();
        return;
      }
      handleRegister(msg);
    };

    worker.onerror = (err) => {
      window.clearTimeout(timeout);
      reject(
        new Error(
          `loadBundle("${manifest.id}"): worker error: ${err.message}`,
        ),
      );
    };
  });

  send({
    kind: "activate",
    bundleId: manifest.id,
    capabilities: [],
  });

  try {
    await readyPromise;
  } catch (err) {
    // Mounting failed; tear down anything that already registered.
    for (const d of disposables) d.dispose();
    worker.terminate();
    throw err;
  }

  return {
    manifest,
    get active() {
      return active;
    },
    dispose() {
      if (!active) return;
      active = false;
      send({ kind: "deactivate" });
      for (const d of disposables) d.dispose();
      disposables.length = 0;
      // Reject any in-flight invocations so callers don't hang.
      for (const pending of pendingInvokes.values()) {
        pending.reject(new Error(`bundle "${manifest.id}" disposed`));
      }
      pendingInvokes.clear();
      // Short grace window so the kernel's `deactivate` handler can
      // finish before the runtime goes away.
      window.setTimeout(() => worker.terminate(), TERMINATE_GRACE_MS);
    },
  };
}
