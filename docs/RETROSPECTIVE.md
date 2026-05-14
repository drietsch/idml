# RETROSPECTIVE — idml-edit / idml-edit-wasm experiment

The `idml-edit` and `idml-edit-wasm` crates (plus the `web/src/EditorApp.tsx`
React app and its supporting modules) were an early editor experiment, deleted
when the project pivoted to an inspector-first parallel-track strategy (see
`docs/inspector.md`). This file captures what the experiment taught — patterns
worth reusing, patterns to avoid — so the lessons survive the code.

## What worked, would adopt again

### Operation-based mutation + Patch invalidation

`Command::MoveFrame { frame, dx_pt, dy_pt, transient } -> Patch` was a clean
shape. The `Command` enum (operations like `MoveFrame`, `SetFrameBounds`,
`BringFrameToFront`, `InsertText`, ...) is serde-serializable end-to-end, which
makes both undo journaling and wasm-bindgen plumbing simple. The returned
`Patch` carries `InvalidationKind` + `affected_frames` + `affected_stories`,
which is exactly what the cache layer needs to evict the right slice of work.

Adopt for idml-mutate. Rename the type if the new shape is narrower (the
inspector probably only needs a uniform `Mutation { node, property, value }`
rather than a wide command vocabulary).

### Transient-vs-commit flag

`Command::MoveFrame.transient` bypasses undo. The pointer-down → pointer-move →
pointer-up loop sends transients during drag and a single non-transient commit
on release. Good UX without per-frame undo entries.

Caveat: the impedance between "this is a transient" and "this is the commit of
the prior transients" leaked through the boundary. Next time, model it as
explicit session begin/end markers (`begin_session() -> SessionId`,
`commit_session(id)`, `abort_session(id)`).

### Epoch-cached BuiltDocument

`ProjectHandle` cached the `BuiltDocument` keyed on an integer epoch that
bumped on every successful `apply`. Lazy rebuild on next read; clean
invalidation. Worked perfectly for M0. M1 would have moved to incremental
build via `Patch.affected_*` driving partial display-list rebuilds — that next
step is the right one.

## What worked but needs a better abstraction

### `Face<'static>` over owned `Bytes`

The hand-rolled `unsafe` lifetime transmute in `FontTable::build`
(`bytes::Bytes` as the buffer owner, declaration order = drop order = safety
contract) worked correctly but the contract is fragile in review and easy to
break in a refactor. We now have multiple self-referential patterns
accumulating across crates.

Next time: use `self_cell` or `ouroboros` for any new self-referential cache.
The audit-burden delta is worth the ergonomic cost.

### JSON-string-over-wasm-bindgen wire

`apply_command(json: String) -> json`, `hit_test(...) -> JSON`,
`compute_snap_json(...) -> JSON`, `frame_bbox_page_pt(...) -> JSON`. Path of
least resistance, but the wire is stringly-typed and loses type safety at
exactly the boundary where TS could enforce it.

Next time: typed wasm-bindgen objects via `serde-wasm-bindgen` or explicit
`#[wasm_bindgen]` interface types. Pay the upfront ceremony for `tsc`-checked
boundaries.

### Vello `SurfacePresenter` ownership

The async-GPU-init + canvas-binding + adapter+device+queue+surface lifetimes
threaded through `Rc<RefCell<Editor>>` worked but the ownership graph was
non-obvious. Async-init was a `Promise` from JS side, post-init the presenter
had to be re-attached to a `ProjectHandle`.

For the new inspector: start with `idml-wasm::render_to_png` (PNG bytes
round-tripped through an `<img>`). Vello directly-to-canvas is a worthwhile
optimization but it's premature when the inspector's primary job is property
inspection, not 60fps interaction. Add it back when the renderer surface
becomes the bottleneck.

## What didn't work / would change

### NodeId only covered TextFrames

`idml-scene::Document::text_frame_index` provides O(1) `self_id → (spread, idx)`
lookup, but only for TextFrames. Rectangles, Ovals, Polygons, GraphicLines are
not globally indexed by their `Self="..."` ids. `idml-edit`'s `NodeId` wrapped
text-frame ids only; mutations to non-text shapes had to go through positional
references.

The new inspector wants unified `NodeId` across all frame kinds (and probably
runs, paragraphs, characters too). Extend the scene-graph indexing surface as
part of `idml-mutate` scaffold.

### Editor-shaped surface area on the WASM bridge

`hit_test`, `frame_bbox_page_pt`, `compute_snap_json`, the per-edge snap result
shapes — these were correctly built for an editor (drag-and-drop with snap
guides). They're the wrong primitives for an inspector, whose mental model is
DevTools-style "click a node, see its properties, modify a property, see the
re-render." Don't carry the editor-shaped API into idml-introspect-wasm.

### Document::open(zip) as the only Document constructor — constructible-but-unguarded

The picture turned out subtler than first reported. `Document::open(zip)` is
the only *named* entry point and `Container` is ZIP-coupled in spirit, but
every field on `Container`, `DesignMap`, and `Document` is `pub`. The C1
seam test (`crates/idml-renderer/tests/seam_hand_construct.rs`) passes today
— hand-construct empty + single-page documents and render them via
`pipeline::build_document` works.

What is missing is a *guarded* constructor. Every hand-construction site
must list every field, including future-added ones — so the seam is
constructible-but-brittle: adding a non-`pub` field, or splitting
`Container`'s payload across helper types, would silently break every
hand-construction site (and the seam test would catch it). That's the
discipline the test exists to preserve.

When the inspector grows past empty/blank scenes, the right step is to add
`Document::from_parts(...)` (or a typed builder) that documents the actual
public API for non-IDML construction. Defer until the need is concrete.

### Web app routing as path-based monkeypatch

`web/src/main.tsx` did `window.location.pathname.startsWith("/viewer") ? Viewer : Editor`.
Path-based routing with no router dep was fine for two routes but didn't scale
gracefully. The new inspector lives in its own app (`apps/devtools/`),
sidestepping this.

## What we still don't know

- **Live mutation propagation cost**: every property edit re-builds the entire
  `BuiltDocument` from scratch in the M0 epoch model. For the inspector's
  "live, not snapshot" requirement (every dependent property updates without
  refresh), incremental rebuild matters more than for M0 editor drag-and-drop
  (which already felt fast). Worth benchmarking before assuming epoch-rebuild
  scales.

- **Cascade re-resolution under mutation**: when a style attribute changes, the
  inspector wants to re-display every property in the cascade. Today
  `resolved_run_attrs` / `resolved_paragraph_attrs` recompute the cascade on
  every read; with the inspector subscribing to many descriptors, this becomes
  a hot path. Memoize at the resolution layer? Cache per-NodeId?

- **Color picker semantics**: A2's typed editing wants a real ICC-aware color
  widget. `idml-edit` never got past flat hex strings. The new inspector
  starts here — it's an architectural commitment to "the inspector teaches
  the scene graph what *kinds* of values it should be exposing."

## Specific code references that are gone

For posterity (so future grep doesn't come back empty):

- `Command` enum → was in `crates/idml-edit/src/command.rs`
- `Patch`, `InvalidationKind` → was in `crates/idml-edit/src/patch.rs`
- `Project::apply`, `Project::from_document` → was in `crates/idml-edit/src/project.rs`
- `ProjectHandle`, `Editor` (Vello presenter) → was in `crates/idml-edit-wasm/src/lib.rs`
- `hit_test`, `frame_bbox_page_pt`, `compute_snap_json`, `parent_story_of_frame`,
  `paragraph_text` → was in `crates/idml-edit-wasm/src/lib.rs`
- `seed_hello` integration tests → was in `crates/idml-edit/tests/seed_hello.rs`
- `EditorApp.tsx`, `Inspector.tsx`, `TextInspector.tsx`, `SelectionOverlay.tsx`,
  `Rulers.tsx`, `StylePanels.tsx`, `SidePanels.tsx`, `TextEditOverlay.tsx`,
  `ContextMenu.tsx`, `editor/{worker,EditorClient}.ts`, `persist/opfs.ts`,
  `tools/{tool,type,...}.ts` → all in `web/src/`

If any of this turns out to be reusable, rebuild it cleanly from this
retrospective. Do not resurrect the deleted files from git history — the
shape was right for an editor, and the inspector needs different shapes.
