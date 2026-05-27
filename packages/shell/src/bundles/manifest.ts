// Bundle manifests + handle types. Bundles are loaded once at app
// startup (Step 4 ships first-party only); a manifest describes the
// kernel module URL + a static contribution announce-list so the
// shell can render loading affordances before activation.

export interface BundleManifest {
  /** Stable identifier. Format: `<namespace>.<bundle>`. */
  id: string;

  /** Human-readable name shown in diagnostic surfaces (logs, the
   * future bundle-manager panel). */
  name: string;

  /** Semver-style version string. The shell doesn't enforce a
   * format; bundles agree on what they want here. */
  version: string;

  /** URL (or `URL` object) pointing at the worker module that holds
   * the kernel + `activate()`. Resolved by the shell — relative
   * URLs are relative to the shell's runtime origin. */
  kernel: string | URL;

  /** Static contribution announce-list. Optional; included to let
   * the shell pre-render loading-state UI (menu placeholders,
   * disabled keybindings) before the kernel actually activates.
   * Not the canonical registration path — actual contributions
   * arrive over the message channel. */
  contributes?: {
    commands?: string[];
    keybindings?: string[];
    menus?: string[];
  };
}

/**
 * Handle returned by `loadBundle`. Owner of the worker + every
 * registry handle the bundle's kernel created. `dispose()` tears
 * down both: it posts a `deactivate` message to give the kernel a
 * chance to clean up, then drops every registry handle and
 * terminates the worker after a short grace window.
 */
export interface BundleHandle {
  manifest: BundleManifest;
  /** True after the kernel has signalled `ready`. */
  readonly active: boolean;
  /** Tear down: deactivate kernel, drop registry handles, terminate worker. */
  dispose(): void;
}
