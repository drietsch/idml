# IDML viewer (web)

Side-by-side viewer for the IDML renderer:

- **left pane**: the InDesign-exported PDF (rasterised at build time
  via `pdftoppm`).
- **right pane**: our renderer's PNG output (from `idml-inspect`,
  same dpi).
- **header**: sample picker, page nav, zoom reset, heatmap overlay
  toggle, per-page ΔE / p99 / SSIM metrics from `report.json`.
- **upload mode**: drop an `.idml` onto the right pane and the
  browser renders it via the WASM build of `idml-wasm`.

The viewer is a Vite + React + TypeScript app under `web/`.

## One-time setup

1. Rust wasm32 target:

   ```bash
   rustup target add wasm32-unknown-unknown
   ```

2. `wasm-bindgen-cli` matching the version in `Cargo.lock`. The
   build script tells you the exact version on first run:

   ```bash
   cargo install wasm-bindgen-cli --version <version>
   ```

3. Optional but recommended: `binaryen` (provides `wasm-opt`) for a
   ~30% smaller bundle. macOS: `brew install binaryen`.

4. `pdftoppm` from poppler. macOS: `brew install poppler`.

5. Node + npm (any recent version works).

6. Frontend deps:

   ```bash
   cd web
   npm install
   ```

## Running

Two terminals:

```bash
# 1. Build (or rebuild) the wasm artefacts.
bash web/build-wasm.sh

# 2. Run any sample through the diff harness so the manifest +
#    cand/ref/heat PNGs land in /tmp/idml-diff and
#    corpus/samples/manifest.json picks up the entry.
bash corpus/samples/diff.sh Sample-3

# 3. Vite dev server.
cd web
npm run dev
```

Open the URL Vite prints (defaults to <http://localhost:5173/>).

The dev server maps two extra path prefixes so the viewer can fetch
fixtures without symlinks:

| URL prefix    | Maps to                |
| ------------- | ---------------------- |
| `/samples/*`  | `../corpus/samples/*`  |
| `/diff/*`     | `/tmp/idml-diff/*`     |

## How to use

- **Sample picker**: dropdown shows every sample listed in
  `corpus/samples/manifest.json`. The same entry appears every time
  you re-run `diff.sh <name>` for that sample.
- **Page nav**: ◀ / ▶ buttons or scroll the picker manually.
- **Zoom**: mouse wheel zooms around the cursor; click-and-drag
  pans. Both panes stay in lock-step.
- **Heatmap**: tick the box to overlay `heat-NNN.png` over the
  candidate pane at 60% opacity. Only available in corpus mode.
- **Upload mode**: drag an `.idml` onto the right pane. The
  browser renders every page through `idml-wasm`. Heatmap + ΔE
  metrics disable (no reference for ad-hoc uploads). Click
  "back to corpus" to return.

## Production build

```bash
cd web
npm run build
```

Outputs a static bundle to `web/dist/`. Note: production hosting
needs to serve `samples/` and `diff/` from somewhere — the Vite dev
middleware doesn't apply to a static deploy. For now this is a
dev-only tool.

## Layout

```
web/
├── package.json           npm scripts: wasm | dev | build
├── vite.config.ts         /samples + /diff middleware mappings
├── tsconfig.json
├── index.html
├── build-wasm.sh          cargo build + wasm-bindgen pipeline
├── README.md              you are here
└── src/
    ├── main.tsx           React entry
    ├── App.tsx            top-level component (header + panes)
    ├── PageView.tsx       canvas pane with shared zoom/pan
    ├── wasmClient.ts      lazy loader for the wasm-bindgen module
    ├── types.ts           manifest / report / RenderReport shapes
    ├── viewer.css         layout + styling
    └── wasm/              produced by build-wasm.sh (gitignored)
```

## Troubleshooting

**"wasm-bindgen schema mismatch"** — your installed `wasm-bindgen-cli`
version differs from the `wasm-bindgen` crate version in
`Cargo.lock`. Re-run with `--force`:

```bash
cargo install wasm-bindgen-cli --version <pinned> --force
```

**`/samples/manifest.json` returns 404** — the sample picker only
shows samples that have been run through `diff.sh`. Run
`bash corpus/samples/diff.sh <name>` first; the script appends to
`corpus/samples/manifest.json` automatically.

**`/diff/...` returns 404** — `diff.sh` writes to `/tmp/idml-diff`
by default. Make sure you ran the same sample on the same machine
and that `/tmp/idml-diff/cand-NNN.png` actually exists.

**Upload mode shows a blank candidate pane** — open devtools, look
at the console. The most common cause is that
`web/src/wasm/idml_wasm_bg.wasm` is missing (run `bash build-wasm.sh`
first) or that the version pinning above failed silently.
