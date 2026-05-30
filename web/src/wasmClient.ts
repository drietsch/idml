// Lazy WASM loader. We don't import the bindings at module top so the
// initial bundle stays small until the user actually drops a file.
//
// Build the artefacts first:
//   bash web/build-wasm.sh
// which writes them to web/src/wasm/.

let modulePromise: Promise<typeof import("./wasm/paged_sdk")> | null = null;

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      // The wasm-bindgen --target web shim exports a default `init`
      // that takes the URL of the .wasm. Vite resolves the asset via
      // `new URL(...)` natively.
      const mod = await import("./wasm/paged_sdk");
      const init = mod.default as (url?: string | URL) => Promise<unknown>;
      await init();
      return mod;
    })();
  }
  return modulePromise;
}

/**
 * Render every page of an IDML to PNG bytes via the WASM renderer.
 * Mirrors `paged_sdk::render_pages(idml, font, dpi)` and copies each
 * page's bytes out of the WASM heap into a fresh `Uint8Array` so the
 * caller can wrap them as Blobs.
 */
export async function renderPagesUploaded(
  idml: Uint8Array,
  dpi = 144,
): Promise<Uint8Array[]> {
  const mod = await loadModule();
  const arr = mod.render_pages(idml, undefined, dpi) as ArrayLike<unknown>;
  const out: Uint8Array[] = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(new Uint8Array(arr[i] as ArrayBufferLike));
  }
  return out;
}

/**
 * Lightweight structural report (page sizes + pipeline stats) without
 * rasterising. Useful for the upload sidebar.
 */
export async function getRenderReport(idml: Uint8Array): Promise<unknown> {
  const mod = await loadModule();
  return JSON.parse(mod.render_report(idml));
}
