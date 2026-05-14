# IDML DevTools

A Chrome-DevTools-style inspector for IDML scene graphs. Three panes:

- **Tree** (left) — Spread → Page → Frame hierarchy.
- **Properties** (right) — typed property descriptors for the selected
  node, with authored vs. computed value distinction and per-kind
  widgets (Bounds inputs, Color picker, etc.). Editing a property
  fires a `Mutation` into `idml-introspect-wasm` → `idml-mutate` →
  the underlying `Document`.
- **Render** (center) — PNG of the selected page, re-rendered after
  every mutation.

This is the M0 scaffold of the inspector-first parallel track
(`docs/inspector.md`). Property coverage is intentionally narrow at
M0 — frame `Bounds` + `Fill color` for `TextFrame` — and expands as
`idml-mutate`/`idml-introspect` add support.

## One-time setup

1. Rust wasm32 target: `rustup target add wasm32-unknown-unknown`.
2. `wasm-bindgen-cli` matching `Cargo.lock`'s wasm-bindgen version
   (the build script prints the version on first run).
3. Optional: `binaryen` for `wasm-opt` size pass
   (`brew install binaryen`).
4. Node + npm/pnpm.

## Running

```bash
# 1. Build the WASM artefacts.
bash apps/devtools/build-wasm.sh

# 2. Install JS deps + start dev server.
cd apps/devtools
npm install
npm run dev
```

Open the URL Vite prints. Drag an IDML file onto the drop zone (or
use the file picker) to load it.

## Layout

```
apps/devtools/
├── package.json           npm scripts: wasm | dev | build | preview
├── vite.config.ts
├── tsconfig.json
├── index.html
├── build-wasm.sh          cargo build + wasm-bindgen pipeline
├── README.md
└── src/
    ├── main.tsx           React entry
    ├── App.tsx            three-pane root
    ├── Tree.tsx           Spread → Page → Frame tree
    ├── Properties.tsx     property descriptors + widgets
    ├── RenderPane.tsx     PNG render of the selected page
    ├── inspector.ts       typed wrapper over idml-introspect-wasm
    ├── styles.css         layout + widget styling
    └── wasm/              produced by build-wasm.sh (gitignored)
```

## Status

- ✅ Tree pane lists Spreads / Pages / TextFrames / Rectangles.
- ✅ Properties pane shows `Bounds` + `Fill color` for TextFrames.
- ✅ Render pane shows PNG of selected page.
- ✅ Property edit fires a Mutation, render re-renders.
- ⚠️ Mutation only covers TextFrame (Rectangle/Oval/Polygon/etc. need
  idml-mutate extension).
- ⚠️ "Live, not snapshot" (A1) is currently approximated by re-fetching
  on each mutation; a real change-subscription path lands when
  idml-mutate's Notifier surfaces through the WASM bridge.
- ❌ Computed-vs-authored split (A3) is a no-op today — every property
  surfaces both equal. Cascade-aware properties (e.g. paragraph font
  size) will exercise this once they land in `idml-introspect`.
- ❌ Diff view, command palette, history (A5/A6/A7) — stretch goals.
