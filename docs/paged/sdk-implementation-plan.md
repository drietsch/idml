# Paged SDK — Implementation Plan

**Status:** Draft v1.1 — Phases 0/1 (part 1)/2/3/4 shipped 2026-05-29; Phase 5 + Phase 1 part 2 remain.
**Companion:** `docs/paged/sdk.md` (the strategy doc this plan translates into tactical work)
**Companion specs:** `editor-architecture.md`, `canvas.md`, `scripting-layer.md`, `canvas-interaction-plan.md`, `canvas-interaction-plan-2.md`

This document translates the SDK strategy in `sdk.md` into a phase-by-phase tactical plan: critical files, code shapes, acceptance criteria, decisions. It is opinionated where `sdk.md` leaves open questions, and flags every place where the proposal is redirectable.

## Shipped surface (v1.1 update)

The mechanism described in Phases 0–4 below is live in main as of 2026-05-29:

- `@paged-media/client` package — framework-agnostic `CanvasClient`, wire protocol re-exports, camera + gesture SAB primitives, all wasm-bindgen output. No React imports.
- `@paged-media/catalog` package — `CatalogEntry` types + registry, `Binding` union with the §11.5 ceiling (literals + selectionProperty refs + unit coerce; no expressions).
- `packages/shell/src/catalog/` — `CompositionRenderer`, binding hook (resolves element-scope + content-scope), 6 primitive leaves (Length, ColorSwatch, NumericScrub, Bounds, LayoutSection, Label).
- Phase 3 addressing — `NodeId::StoryRange { story_id, start, end }` + 4 character `PropertyPath` variants + apply arms (whole-run-aligned, per-run Batch inverse) + `model.element_properties(StoryRange)` snapshot walk (uniform-collapse: `Some(v)` when runs agree, `None` for mixed). `ElementId::StoryRange` wire variant + script-side `storyRange:Story/u…@start..end` parser.
- 3 declarative panels live: **Character** (content-scope; FontSize / Leading / Tracking / FillColor), **Stroke** (element-scope; Weight + Color), **Object** (element-scope; Bounds + Opacity). All render from JSON compositions — no JSX written for any of the three.
- `paged.stories()` host fn — enumerates loaded stories (selfId + characterCount + paragraphCount) so scripts + tests can pick valid range addresses.
- Phase 4 menu commands — Edit/Undo+Redo + View/Zoom* + keybindings cmd+= / cmd+-, all `CommandContribution`s through the registry. Convergence test: shell's `paged.file.openIdml` registration projects into the same MenuBar.

PROTOCOL_VERSION is 17 in main. 85/85 editor Playwright tests + 14/14 idml-script + 95/95 idml-canvas + 68/68 idml-mutate native pass.

What's still open:
- **Phase 3.x — partial-range run-splitting** for character writes. Today the apply arm returns `OperationError::InvalidValue` when a range cuts inside a CharacterRun. Needs a story-snapshot inverse (clone affected paragraphs' run lists pre-mutation; restore via a new `Operation::RestoreParagraphRuns { story_id, paragraph_index, runs }` variant; requires `CharacterRun` to derive Deserialize/PartialEq/Tsify).
- **Phase 5 panel migration** — Outline, Tree, Layers, REPL, Script-Editor onto the catalog model. New compositions for Paragraph, Effects, Links, Articles, plus Pages (which also needs new structural ops: `MovePage` / `InsertPage` / `RemovePage`). Inspector retirement gated on the property-tier set being complete.
- **Phase 1 part 2** — framework-agnostic state observables in `@paged-media/client` + unified `paged` handle. Existing React contexts work fine; this is architectural cleanup.

---

## Executive summary

The SDK migration is **~80% drawing boundaries around mechanism that already exists, ~20% genuinely new mechanism**.

What's already in shape:

- tsify contract is essentially complete — `apps/canvas/src/channel/protocol.ts` is 100% re-exports of generated types.
- The four registries (`PanelRegistry`, `CommandRegistry`, `SemanticGroupRegistry`, `KeybindingRegistry`) exist in `packages/shell/src/registries/`.
- The dockview seam is already single-file (`packages/shell/src/docking/dockview-substrate.ts`).
- The five core state contexts exist with re-render isolation (Client / Camera / ContentSelection / Document / Selection).

What needs building:

- `@paged-media/client` as a separate, React-free package (today the client lives in the app).
- A small convergence patch on the script-side selection surface (scripts can't read the active selection today).
- The declarative **catalog + binding model** (`sdk.md` §6) — genuinely new mechanism, the load-bearing risk of the plan.
- First-party menu items routed through `CommandContribution`s.
- Generalization across the remaining panels.

Phase 6 (the A2UI / agentic adapter) is deferred per `sdk.md` §10.1 — gated on the catalog being proven by Phases 3–5.

**Migration commitment:** every existing panel in `BUILT_IN_PANELS` migrates to the catalog/binding model by end of Phase 5. The canvas (`paged.canvas`) is the one principled exception (`sdk.md` §5.1) but even it registers via the catalog. Nothing stays on direct-React. Phase 3 already begins this — it migrates `paged.pages` as part of the structural-tier proof.

---

## Current state vs the doc (gap analysis)

| `sdk.md` requirement | Code today | Gap |
|---|---|---|
| `@paged-media/client` package, no React | `CanvasClient` lives in `apps/canvas/src/channel/client.ts`; no separate package | **Extract (Phase 1)** |
| `@paged-media/react` adapter | `packages/shell/` exists; right shape, wrong name | Cosmetic rename, optional, post-Phase-5 |
| tsify contract complete | `protocol.ts` re-exports only generated types | **Add CI guard (Phase 0)** |
| Four registries | All present in `packages/shell/src/registries/` | None |
| Five core state contexts | Eight contexts (five core + three infrastructure); core five are isolated | None |
| One dockview seam | `dockview-substrate.ts` is the only importer | **Add lint rule (Phase 1)** |
| Single read surface for selection properties | Script `paged.inspect` and UI `client.elementProperties` both hit `model.element_properties`; two call paths, one Rust method | **Verify + give scripts access to current selection (Phase 2)** |
| Script can read current selection | `paged.selection()` does not exist | **New host function (Phase 2)** |
| Catalog + binding model | None | **New (Phase 3)** |
| Composition renderer | None | **New (Phase 3)** |
| Expert-leaf contract (declared bindings) | No panel declares bindings; all are opaque React | **New (Phase 3)** |
| Main menu via commands | `MenuRegistry` exists; no menu items registered | **New (Phase 4)** |
| Tool registry wired to active-tool state | Type stubs exist; `activeTool` is a string in `SelectionContext` | **Minor wire-up (Phase 1)** |
| A2UI / agentic adapter | None | **Deferred (Phase 6)** |

---

## Phase 0 — Codify the tsify contract (~1 day)

The current state is "all SDK-exposed types are tsify'd already." This phase only **adds the guard rails** so it stays that way.

### Work

1. CI step: run `apps/canvas/build-wasm.sh` and `git diff --exit-code apps/canvas/src/wasm/idml_canvas_wasm.d.ts`. A renamed Rust field can't ship without the regenerated `.d.ts` being committed. (Alternative: snapshot-test the `.d.ts` via Vitest. CI-diff is mechanical and preferred.)
2. SAB layout audit. Today `CameraBuffer` and `GestureBuffer` declare offsets in both Rust and TS. Confirm each has exactly one source of truth — Rust should expose byte sizes via a tsify'd `*Layout` struct. The existing `cameraSabBytes()` already does this for camera; verify or add the same for gesture.
3. Once `packages/client/` exists (Phase 1), add a `README.md` block documenting: every SDK-exposed type must derive `Tsify` and be re-exported from `packages/client/src/protocol.ts`.

### Critical files

- `.github/workflows/<existing>.yml` — add the wasm-diff CI step.
- `crates/idml-canvas/src/channel.rs` — add tsify'd `GestureLayout` if absent.
- `apps/canvas/src/channel/camera.ts`, `packages/shell/src/gestures/gesture-sab.ts` — consume the layout type instead of hardcoding offsets.

### Acceptance criteria

- **AC-0.1** CI fails when a Rust SDK-exposed type changes without the regenerated `.d.ts`.
- **AC-0.2** Renaming a `MainToWorkerKind` variant produces a TS compile error in the canvas app.
- **AC-0.3** Camera + gesture SAB offsets have exactly one source of truth (Rust).

---

## Phase 1 — Draw the package boundary (~3–5 days)

The biggest mechanical move. Creates `@paged-media/client`; relocates the framework-agnostic core out of `apps/canvas/` and out of `packages/shell/`.

### Package layout after Phase 1

```
packages/
  client/                      ← NEW. Framework-agnostic core. No React.
    package.json
    src/
      index.ts                 public exports
      client.ts                CanvasClient (moved from apps/canvas)
      protocol.ts              re-exports of generated types (moved)
      channel/
        camera.ts              CameraBuffer (moved)
        request.ts             request/reply correlation (moved)
      state/
        observable.ts          subscribable<T> primitive
        selection.ts           elementSelection observable
        content-selection.ts   contentSelection + caret + selectionRects
        document.ts            documentHandle observable
        active-tool.ts         activeTool observable (formalised)
        camera.ts              camera read handle (SAB-backed)
      paged-handle.ts          the `paged` object panels + scripts both receive
  ui/                          ← unchanged
  shell/                       ← unchanged name; depends on @paged-media/client
    src/
      hooks/                   useCanvasClient/useSelection/etc — re-implemented as useSyncExternalStore over @paged-media/client observables
      registries/              unchanged
      docking/                 unchanged
      state/                   thin React adapters over client observables
  catalog/                     ← Phase 3 adds
```

### Work

1. **Create `packages/client/`** with `package.json` (no React peer) and `tsconfig.json` (strict, no DOM types — only Workers + main-thread shared `lib` subset).
2. **Move `CanvasClient`** — `apps/canvas/src/channel/client.ts` → `packages/client/src/client.ts`. The worker URL becomes an injected ctor parameter:
   ```ts
   new CanvasClient({ workerUrl: new URL("./worker/worker.ts", import.meta.url) });
   ```
   `import.meta.url` must resolve in the **app's** module graph, not the extracted package's — that's why the URL is injected.
3. **Move protocol re-exports** — `apps/canvas/src/channel/protocol.ts` → `packages/client/src/protocol.ts`. The wasm `.d.ts` import path becomes an alias resolved by tsconfig paths.
4. **Move SAB primitives** — `apps/canvas/src/channel/camera.ts` → `packages/client/src/channel/camera.ts`.
5. **Extract framework-agnostic state primitives.** Each `packages/shell/src/state/*-context.tsx` splits into:
   - **Observable** (`packages/client/src/state/<name>.ts`) — pure TS; holds canonical data; `get()` / `set(v)` / `subscribe(fn)`. ~30 lines each.
   - **React adapter** (`packages/shell/src/state/<name>-context.tsx`) — `createContext` + `Provider` that mounts the observable + hook = `useSyncExternalStore(obs.subscribe, obs.get)`. ~20 lines each.

   The observable shape:
   ```ts
   export interface Observable<T> {
     get(): T;
     set(value: T): void;
     subscribe(fn: (value: T) => void): () => void;
   }
   ```
6. **Construct the `paged` handle** (`packages/client/src/paged-handle.ts`) — the single object the script's host functions and the panel's React components both receive. The "one door."
   ```ts
   export interface PagedHandle {
     readonly client: CanvasClient;
     readonly selection: Observable<ElementId[]>;
     readonly contentSelection: Observable<ContentSelection | null>;
     readonly camera: Observable<Camera>;
     readonly activeTool: Observable<ToolId>;
     readonly document: Observable<DocumentHandle | null>;
     mutate(op: Mutation): Promise<AppliedOperation>;
     request<R>(req: MainToWorker): Promise<R>;
   }
   ```
7. **Wire `@paged-media/client` into `apps/canvas`** — update imports across the app to point at `@paged-media/client`.
8. **Lint rules** (ESLint or workspace-level):
   - `packages/client/**` may not import `react` or `react-*`.
   - Only `packages/shell/src/docking/dockview-substrate.ts` may import `dockview-react`.
   - `packages/client/src/protocol.ts` may only contain `export type { ... } from ...` lines (no type declarations).

### Critical files

| File | Change |
|---|---|
| `packages/client/package.json` *(new)* | `@paged-media/client`, no React peer |
| `packages/client/src/client.ts` *(moved)* | from `apps/canvas/src/channel/client.ts` |
| `packages/client/src/protocol.ts` *(moved)* | from same |
| `packages/client/src/state/*.ts` *(new, 5 files)* | extracted from shell contexts |
| `packages/client/src/paged-handle.ts` *(new)* | the unified handle |
| `packages/shell/src/state/*-context.tsx` *(rewritten)* | `useSyncExternalStore` adapters |
| `apps/canvas/src/main.tsx` | imports from `@paged-media/client` |
| `eslint.config.js` (or similar) | the three lint rules |
| `packages/shell/package.json` | dependency on `@paged-media/client` |

### Acceptance criteria

- **AC-1.1** `tsc --noEmit` over `packages/client/` passes with zero React imports.
- **AC-1.2** Canvas app boots unchanged; all 71 existing Playwright tests still pass.
- **AC-1.3** Lint fails CI if a `react` import lands in `@paged-media/client`.
- **AC-1.4** Lint fails CI if a file other than `dockview-substrate.ts` imports `dockview-react`.
- **AC-1.5** The `paged` handle a script's host function receives is the same shape as the one a React panel receives — proved by a type assertion in a test.

---

## Phase 2 — Convergence diagnostic + script selection access (~1–2 days)

`sdk.md` §8 Step 2. The diagnostic is mostly passed (both consumers already hit `model.element_properties`). There's one real divergence — scripts can't read the active selection — and the doc's open questions §11.1 + §11.2 need closing.

### Work

1. **Verify the convergence.** Add a native test in `crates/idml-script/tests/` that asserts `paged.inspect(id)` returns JSON-identical output to what the channel's `RequestElementProperties` reply carries for the same id. Same Rust source data → same JSON shape.
2. **Add `paged.selection()`** — host function returning the current `ElementId[]`. The model already exposes selection state; the host function just routes through `with_model`.
3. **Add `paged.contentSelection()`** — analogous for the text-side caret.
4. **Resolve §11.1.** Document: **snapshot.** Both consumers already snapshot and re-fetch on `mutationApplied`. Update `sdk.md` §11.1 to closed.
5. **Resolve §11.2.** Document: **Rust is canonical owner of application state**, main-thread React state is a mirror updated via channel notifications, camera is SAB-mirrored. Update `sdk.md` §11.2 to closed.

### Critical files

| File | Change |
|---|---|
| `crates/idml-script/src/lib.rs` | add `paged_selection`, `paged_content_selection` host fns |
| `crates/idml-script/tests/script_basics.rs` | new test: parity of `paged.inspect` vs channel reply |
| `apps/canvas/tests/script-editor.spec.ts` | new AC-SCRIPT-7: `console.log(paged.selection())` matches the visually-selected IDs |
| `docs/paged/sdk.md` | mark §11.1, §11.2 resolved |

### Acceptance criteria

- **AC-2.1** Native test: same id → JSON-identical output from `paged.inspect(id)` and from the channel reply path.
- **AC-2.2** A script can call `paged.selection()` and the result matches what `useSelection()` reports in the UI.
- **AC-2.3** The single documented read API is `paged.inspect(id)` / `client.elementProperties(id)` — both returning `ElementProperties`. `sdk.md` §11.1 closed.
- **AC-2.4** `sdk.md` §11.2 documented as resolved.

---

## Phase 3 — Catalog + binding model + the proof slice (~2–3 weeks)

`sdk.md` §6 + §8 Step 3. The genuinely-new mechanism and the load-bearing phase. Three sub-deliverables in order: catalog package → primitive leaves → three proof panels.

### 3a. The catalog package (~3–5 days)

New package `packages/catalog/`.

```ts
// packages/catalog/src/types.ts

export type CatalogEntryKind = "composition" | "leaf";

export interface CatalogEntry {
  id: string;                       // e.g. "paged.input.numeric-scrub"
  kind: CatalogEntryKind;
  props: PropSchema;                // typed schema of accepted props
  bindings: BindingDeclaration;     // declared read/write surface
  leaf?: ComponentType<LeafProps>;  // when kind === "leaf"
  composition?: CompositionNode;    // when kind === "composition"
}

export interface BindingDeclaration {
  reads: ReadSpec[];   // ["selectionProperty:frameOpacity"]
  writes: WriteSpec[]; // ["selectionProperty:frameOpacity"]
}

export type Binding =
  | { kind: "literal"; value: JsonValue }
  | { kind: "selectionProperty"; path: PropertyPath;
      coerce?: "pt" | "px" | "%" };
  // No other kinds. See §11.5 ceiling.

export interface CompositionNode {
  catalogId: string;
  props: Record<string, JsonValue>;
  bindings: Record<string, Binding>;
  children?: CompositionNode[];
}
```

**Binding ceiling (§11.5 resolution, confirmed):** literals + selectionProperty refs + unit coerce. No computed values, no conditionals, no formatters. Anything richer is an expert leaf, not a richer binding language.

**Renderer:**

```tsx
// packages/catalog/src/render.tsx

export function CompositionRenderer({ composition }: { composition: CompositionNode }) {
  const paged = usePaged();
  return <NodeRenderer node={composition} paged={paged} />;
}
```

`NodeRenderer` resolves the entry from the catalog, evaluates each binding against the `paged` handle (subscribes to `selection` + `mutationApplied` for re-render), and renders the entry's `leaf` component or recursively renders if it's a composition.

### 3b. The primitive leaves (~3–5 days)

The catalog's starter vocabulary — wraps `@paged-media/ui` primitives with declared binding manifests.

| Catalog id | Underlying widget | Binds to | Notes |
|---|---|---|---|
| `paged.input.numeric-scrub` | `ScrubField` | one selection-property write | numeric values |
| `paged.input.length` | `LengthInput` | one write w/ unit coerce | pt/px/% |
| `paged.input.color-swatch` | `ColorPicker` | one write (color ref) | swatch popover |
| `paged.input.bounds` | `BoundsInput` | one write (4-tuple) | top/left/bottom/right |
| `paged.input.enum-select` | `Select` | one write (string ref) | discrete options |
| `paged.layout.row` | flex row | layout only | composition aid |
| `paged.layout.section` | titled section | layout only | composition aid |
| `paged.label` | text | literal-only | composition aid |

Each leaf ships with a sibling `*.bindings.ts` manifest declaring `reads` + `writes` — lint-enforced.

### 3c. The three proof panels (~1–2 weeks)

**Migration scope, stated explicitly:** every panel currently in `BUILT_IN_PANELS` migrates to the catalog/binding model by end of Phase 5 — nothing stays on direct-React forever. Phase 3 picks three panels that exercise all three proofs (binding model, the binding/imperative boundary, and the expert-leaf contract). Phase 5 then sweeps the remainder.

Phase 3's three:

1. **Character (new declarative composition)** — proves the binding model. Functionally supersedes part of the existing Inspector panel; Inspector stays around during Phase 3 as a parity reference and is retired in Phase 5 once the full property-panel set (Paragraph / Stroke / Effects / Object-Transform) ships.
2. **Pages (composition + expert thumbnail leaf)** — **migrates the existing `paged.pages` panel** (`apps/canvas/src/panels/navigator-panel.tsx`). After Phase 3, `paged.pages` is registered as a catalog reference, not a direct React component.
3. **Spread Mini-Map (new expert leaf)** — proves the expert-leaf contract. Net-new panel; no existing equivalent.

So Phase 3 touches two existing panels (`paged.pages` actively migrated, `paged.inspector` kept as parity reference) plus adds one new expert leaf. Phase 5 finishes the rest.

#### Panel 1 — Character (declarative composition)

The doc's example for the binding-shaped tier. Reads paragraph + character resolved properties for the current selection; each field is a leaf bound to one selection-property path.

```jsonc
// apps/canvas/src/panels/character.composition.json
{
  "catalogId": "paged.layout.section",
  "props": { "title": "Character" },
  "children": [
    { "catalogId": "paged.input.length",
      "props": { "label": "Font size", "min": 1, "max": 999 },
      "bindings": { "value": { "kind": "selectionProperty", "path": "characterFontSize" } } },
    { "catalogId": "paged.input.length",
      "props": { "label": "Leading" },
      "bindings": { "value": { "kind": "selectionProperty", "path": "characterLeading" } } },
    { "catalogId": "paged.input.numeric-scrub",
      "props": { "label": "Tracking" },
      "bindings": { "value": { "kind": "selectionProperty", "path": "characterTracking" } } },
    { "catalogId": "paged.input.color-swatch",
      "props": { "label": "Fill" },
      "bindings": { "value": { "kind": "selectionProperty", "path": "characterFillColor" } } }
  ]
}
```

The panel registration:

```ts
{
  id: "paged.character",
  title: "Character",
  component: CompositionRenderer,
  componentProps: { composition: characterComposition },
  defaultDock: "right",
  defaultGroup: "properties",
}
```

The `paged.character` panel file is **just registration + a JSON import** — no JSX written for it.

#### Panel 2 — Pages (composition + expert thumbnail leaf)

The structural-tier example. Tree of pages; drag-reorder fires `Operation::MovePage`; selecting a page drives camera + selection. Pages is the panel that **discovers the catalog boundary empirically** — build the chrome as a composition, the thumbnail strip as a sibling expert leaf, observe where the line falls.

If even the chrome resists the catalog vocabulary, note what's missing (e.g. a `list-with-reorder` primitive) and **add it to the catalog once, reviewed, before declaring the whole panel expert.** This is the discipline `sdk.md` §6.3 names.

#### Panel 3 — Spread Mini-Map (expert leaf, the bespoke proof)

A bespoke ~100×N canvas drawing thumbnails of every spread, click-to-jump-camera. Declares its bindings in a sibling manifest:

```ts
// apps/canvas/src/panels/spread-minimap.bindings.ts
export const spreadMiniMapBindings: BindingDeclaration = {
  reads: ["document.spreads", "camera"],
  writes: ["camera", "selection"],
};
```

Renders via opaque code (`<canvas>` + draw routine), but **mutates only through `paged.mutate(...)`** — never reaches past the door. This proves the doc's invariant 9: expert components get imperative *rendering*, not imperative *mutation*.

### 3c.1 ADR — Character / paragraph addressing model (RESOLVED)

**Status:** Resolved 2026-05-29. Prep work landed alongside this decision.
**Context:** the four named character paths (`CharacterFontSize/Leading/Tracking/FillColor` per §3d below) cannot be wired without choosing how a write addresses a character range. Three candidates were considered:

| | Approach A — `NodeId::StoryRange { story_id, start, end }` | Approach B — Frame-level lossy | Approach C — Hybrid: NodeId for elements, ContentSelection for text |
|---|---|---|---|
| Symmetric with existing model | yes (same shape as `TextFrame(_)`) | yes | no (two addressing schemes) |
| Multi-style preservation | yes | **no** (lossy on multi-style stories) | yes |
| Matches IDML serialization | yes (`<CharacterStyleRange>` has offsets) | no | partial |
| Binding model fit | clean — `selectionProperty` binds to any NodeId | trivial | branching — bindings know two scopes |
| New Rust variants | 1 NodeId + character paths | 0 + character paths | 0 + a new Mutation envelope variant |
| Snapshot complexity | mixed-value handling | none | mixed-value handling |
| Script ergonomics | `paged.set(rangeNodeId, "characterFontSize", 12)` | `paged.set("textFrame:X", ...)` (lossy) | different shape from element writes |

**Decision: Approach A — Range-as-NodeId.** New `NodeId::StoryRange { story_id, start, end }` (half-open, character-offset addressing matching IDML's native serialization). Character + paragraph `PropertyPath`s address this variant.

Reasoning:

1. **Lossy is a deal-breaker.** Approach B silently collapses every multi-style story on every Character edit. The whole reason this renderer exists is character-level IDML fidelity; the editor cannot disagree with the renderer about what a story can hold.
2. **Symmetry preserves the one-door thesis.** The Operation channel addresses nodes; a story range *is* a node. Same shape as `TextFrame(_)`, `Rectangle(_)`, `Layer(_)`. Approach C breaks this — it would split Operations into "addressed by NodeId" and "addressed by ContentSelection," with the binding model needing to know which.
3. **IDML's native serialization is already range-keyed.** `<CharacterStyleRange ...>` lives inside `<ParagraphStyleRange>` inside `<Story>`, all with character offsets. `StoryRange` is a thin wrapper over how IDML already addresses character properties.
4. **The binding ceiling holds.** A `selectionProperty` binding stays a `selectionProperty` binding; we give it an optional `scope: "element" | "content"` discriminator. Element bindings resolve against `useSelection()`; content bindings resolve against `useContentSelection()`. Both produce a `NodeId` for the `apply` call. No new binding *kind*.
5. **`paged.contentSelection()` becomes the natural address producer.** Phase 2 already exposes content selection to scripts. With Approach A: scripts write `paged.set(rangeNodeIdFromContentSelection(), "characterFontSize", 12)` — same pattern as element edits.

**Implementation status (this commit is Phase 3 *prep*):**

- ✅ `NodeId::StoryRange { story_id, start, end }` variant added with `self_id()` / `kind()` helpers (`crates/idml-mutate/src/operation.rs`).
- ✅ `PropertyPath::CharacterFontSize` / `CharacterLeading` / `CharacterTracking` / `CharacterFillColor` added with `label()` entries (same file).
- ✅ `PropertyEntry.value: Option<Value>` (`crates/idml-canvas/src/channel.rs` — was `Value`). `None` signals "mixed / indeterminate" — a `StoryRange` whose `CharacterRun`s carry conflicting values returns `None` so the binding renderer can show a placeholder (em-dash) rather than picking an arbitrary winner. `PROTOCOL_VERSION` bumped 14 → 15.
- ✅ Inspector panel handles null entries with an em-dash placeholder.
- ✅ Native serde round-trip test for `NodeId::StoryRange` + smoke test for the new character paths (`crates/idml-mutate/src/lib.rs`).
- ⏳ Apply arms for `(StoryRange, Character*)` — **Phase 3 proper.** Today a `SetProperty` against `(StoryRange, CharacterFontSize)` returns `OperationError::UnsupportedProperty`; the test pins this. Phase 3's first work after the catalog package is built is the run-walking apply layer: walk paragraphs + runs covering `[start, end)`, split runs at boundaries, set the new property per affected run, return a `Batch` inverse of per-run restorations.
- ⏳ `model.element_properties(StoryRange { ... })` snapshot — **Phase 3 proper.** Walks the story's runs within `[start, end)`, collapses uniform values, emits `None` for mixed.
- ⏳ Catalog binding extension (`selectionProperty.scope: "element" | "content"`) — **Phase 3 proper** (lands with the catalog package itself).
- ⏳ Fallback rule when element-selected TextFrame has no content selection: synthesize a "whole-story" range — **Phase 3 proper.**

**Paragraph paths follow the same model.** Paragraph writes round the addressed range to paragraph boundaries before applying (paragraphs are atomic in IDML; you can't half-apply `ParagraphJustification` to the middle of a paragraph). The range-walking helper Phase 3 builds handles this rounding centrally.

### 3d. Operation-layer findings (anticipated, ship inside Phase 3)

`sdk.md` is categorical: "panel friction is specification" (invariant 8). Phase 3 will surface gaps:

- `Operation::SetProperty{CharacterFontSize | CharacterLeading | CharacterTracking | CharacterFillColor}` — verify in `idml-mutate`. If only frame-level paths exist, the gap is in the Operation set, not the panel.
- `Operation::MovePage` — verify; if absent, add it before Pages reorder ships.
- Layer-write Ops are already shipped per Track M; no work there.

Each gap is Phase 3 work. Phase 3 does not close while any panel papers over a missing Operation.

### Critical files

| File | Change |
|---|---|
| `packages/catalog/package.json` *(new)* | `@paged-media/catalog` |
| `packages/catalog/src/types.ts` *(new)* | catalog + binding types |
| `packages/catalog/src/registry.ts` *(new)* | the catalog map |
| `packages/catalog/src/render.tsx` *(new)* | `CompositionRenderer` + `NodeRenderer` |
| `packages/catalog/src/binding.ts` *(new)* | binding resolver against `paged` handle |
| `packages/catalog/src/leaves/*.tsx` *(new, ~8 files)* | primitive leaves wrapping `@paged-media/ui` |
| `packages/catalog/src/leaves/*.bindings.ts` *(new, ~8 files)* | declared bindings per leaf |
| `apps/canvas/src/panels/character.composition.json` *(new)* | declarative Character |
| `apps/canvas/src/panels/pages.composition.json` *(new)* | declarative Pages chrome |
| `apps/canvas/src/panels/spread-thumbnail-strip.tsx` *(new)* | expert leaf used inside Pages |
| `apps/canvas/src/panels/spread-thumbnail-strip.bindings.ts` *(new)* | declared bindings |
| `apps/canvas/src/panels/spread-minimap.tsx` *(new)* | independent expert leaf panel |
| `apps/canvas/src/panels/spread-minimap.bindings.ts` *(new)* | declared bindings |
| `apps/canvas/src/main.tsx` | register all three (and any Operation-set additions) |
| `apps/canvas/tests/character-panel.spec.ts` *(new)* | Playwright |
| `apps/canvas/tests/pages-panel.spec.ts` *(new)* | Playwright |
| `apps/canvas/tests/spread-minimap.spec.ts` *(new)* | Playwright |
| `crates/idml-mutate/src/operation.rs` | new SetProperty paths if surfaced |
| `crates/idml-mutate/src/apply.rs` | apply arms + inverses for the new paths |

### Acceptance criteria

- **AC-3.1** Character panel renders entirely from its JSON composition; the panel `.ts` file contains only `{ component: CompositionRenderer, componentProps: { composition } }` — no JSX.
- **AC-3.2** Editing a character field in the composition writes through `paged.mutate(...)`. The canvas re-paints. Undo restores. **The same edit succeeds from a script:** `paged.set(id, "characterFontSize", 12)`.
- **AC-3.3** Pages panel re-renders on tree mutations (subscribes to `mutationApplied`) and drives camera/selection through the `paged` handle's application-state observables.
- **AC-3.4** The expert leaves (`spread-thumbnail-strip`, `spread-minimap`) each have a sibling `*.bindings.ts` manifest. A lint rule asserts every leaf in the catalog has a declared binding manifest.
- **AC-3.5** Changing the Character composition JSON changes the panel at next reload with no recompile of catalog code.
- **AC-3.6** Each Operation-layer gap surfaced during Phase 3 ships before Phase 3 closes.
- **AC-3.7** `paged.pages` is migrated to a catalog composition during Phase 3 (its `navigator-panel.tsx` becomes a `pages.composition.json` + a `spread-thumbnail-strip` expert leaf). The Inspector remains running unchanged during Phase 3 as a parity reference; the other existing panels (Outline, Tree, Layers, REPL, Script-Editor) remain functional on their current React paths and are queued for Phase 5 migration.
- **AC-3.8** No panel ends Phase 5 on direct-React. Every entry in `BUILT_IN_PANELS` (except the canvas itself, per `sdk.md` §5.1) is a catalog reference by Phase 5 close. The migration table in Phase 5 below is exhaustive.

### Decisions confirmed by the user

| Question | Decision |
|---|---|
| Plan as a doc? | **Yes** — this file (`docs/paged/sdk-implementation-plan.md`). |
| Phase 3 panels? | **Character (new), Pages (migrates existing `paged.pages`), Spread Mini-Map (new expert leaf).** Every other existing panel migrates in Phase 5 — none stays on direct-React. |
| Binding ceiling (§11.5)? | **Literals + selectionProperty refs + unit coerce only.** |
| Catalog as a new package? | `packages/catalog/`. |
| Composition format? | JSON files imported at build time. |
| Inspector during Phase 3? | Coexists. Retired in Phase 5 when Character/Paragraph/Stroke compositions reach parity. |

---

## Phase 4 — Main menu via commands (~2–3 days)

`sdk.md` §8 Step 4. The `MenuRegistry` exists; the canvas app registers zero menu items today. Phase 4 lifts the implicit chrome onto the registry.

### Work

1. Identify the actions today's UI exposes via direct buttons / shortcuts. Likely set:
   - File → Open IDML (today: header file-picker button)
   - File → Save layout (today: dockview auto-persist; expose as menu)
   - Edit → Undo / Redo (today: Cmd-Z / Cmd-Shift-Z direct binding)
   - View → Zoom in / out / fit to page (today: zoom field)
   - View → Show grid / guides toggle
   - Window → Reset layout / Show: Layers / Show: Pages / Show: Character …
2. Each becomes one `CommandContribution` + one `MenuItemContribution`. Both live in `apps/canvas/src/main.tsx` as `BUILT_IN_COMMANDS` and `BUILT_IN_MENU_ITEMS` arrays.
3. The header file-picker becomes `commands.invoke("file.open")` — the header is a thin button firing the command.
4. Cmd-Z keybinding becomes a `KeybindingContribution` pointing at `editor.undo`.

### Critical files

| File | Change |
|---|---|
| `apps/canvas/src/main.tsx` | `BUILT_IN_COMMANDS` (~15 commands) + `BUILT_IN_MENU_ITEMS` |
| `apps/canvas/src/chrome/Header.tsx` (or equivalent) | replace direct file-picker with `commands.invoke("file.open")` |
| `apps/canvas/tests/menu.spec.ts` *(new)* | Playwright: open menu, click item, command fires |

### Acceptance criteria

- **AC-4.1** Every action previously a hand-wired button or keybind is a registered `CommandContribution`.
- **AC-4.2** The menu bar renders from the registry with no hardcoded items in the chrome.
- **AC-4.3** Removing a single command + menu-item pair makes that menu entry disappear with no other code change.
- **AC-4.4** A Playwright test invokes File → Open from the menu and an IDML loads — mechanically identical to the previous file-picker flow.
- **AC-4.5** The same command (`file.open`) can be invoked from a script via `paged.client.commands.invoke("file.open")` — convergence test for the command surface.

---

## Phase 5 — Generalize across the remaining panels (~1–2 weeks)

`sdk.md` §8 Step 5. With the catalog + binding model + expert-leaf contract proven, the rest becomes variations. **Phase 5 is exhaustive — by its close, no panel in `BUILT_IN_PANELS` is on direct-React (except the canvas itself, per `sdk.md` §5.1).** Migrates every remaining existing panel and adds the doc's named-but-not-yet-built ones.

### Existing panels — migration plan (exhaustive)

| Panel id | File today | Phase 5 disposition |
|---|---|---|
| `paged.canvas` | `canvas-panel.tsx` | **Unchanged.** The one principled exception (`sdk.md` §5.1). Registers via the catalog as an expert leaf (declared bindings: `reads: camera, document; writes: ø` — it doesn't write through any panel-level API; gesture spine handles that). |
| `paged.pages` | `navigator-panel.tsx` | **Already migrated in Phase 3** (composition + `spread-thumbnail-strip` expert leaf). |
| `paged.outline` | `outline-panel.tsx` | **Migrate as composition.** Document outline = nested structural list; fits the structural binding model. May reuse a `paged.layout.tree-list` primitive added once the binding shape is clear. |
| `paged.tree` | `tree-panel.tsx` | **Migrate as composition.** Scene tree = structural panel; reuses Pages-style chrome + possibly the `paged.layout.tree-list` primitive. |
| `paged.inspector` | `inspector-panel.tsx` | **Retire.** Character + Paragraph + Stroke + Effects + Object/Transform compositions cover everything Inspector exposed. Delete the file in this phase. |
| `paged.layers` | `layers-panel.tsx` | **Migrate as composition + expert row.** Layer rows have custom drag affordance → row is an expert leaf; chrome is composition. Use the structural ops already shipped per Track M (rename/move/insert/remove). |
| `paged.repl` | `repl-panel.tsx` | **Migrate as expert leaf** (not unchanged). The REPL stays imperative-rendering (text input + output log), but its registration becomes a catalog entry with declared bindings (`reads: nothing structural; writes: any Operation via parsed text`). |
| `paged.script-editor` | `script-editor.tsx` | **Migrate as expert leaf.** Same shape as REPL — imperative-rendering, declared bindings (`writes: any Mutation via paged.set + Operation via paged.mutate`). |

### New panels — declarative compositions (following Character)

| Panel | Reads | Writes |
|---|---|---|
| Paragraph | resolved paragraph properties | `SetProperty{Paragraph*}` |
| Stroke | resolved stroke properties | `SetProperty{FrameStrokeWeight/Color/Dash}` |
| Effects | resolved effect properties | `SetProperty{FrameOpacity/DropShadow}` |
| Object / Transform | resolved bounds + transform | `SetProperty{FrameBounds/FrameTransform}` |
| Links | image-link list | relink / embed Operations |
| Articles | article + threading | threading Operations |

### New panels — expert leaves (following spread-minimap)

| Panel | Why expert |
|---|---|
| Tools | Bespoke geometry + gesture-spine coupling. Wires the (already-extracted) `activeTool` observable in `@paged-media/client` through the registry. |
| Path-edit toolbar | Gesture-adjacent; resists declarative model. |

### Work

1. For each composition panel: one JSON composition file + register through `CompositionRenderer`. Delete the previous React panel file once parity tests pass.
2. For each expert leaf: confirm its `*.bindings.ts` sibling exists; lint rule passes.
3. `BUILT_IN_PANELS` becomes a list of `{ id, catalogRef }` shapes — no direct React component imports in the app's main entry except for the registration table itself.

### Acceptance criteria

- **AC-5.1** Every panel in `BUILT_IN_PANELS` references a catalog entry (or registers a composition); no panel imports React directly outside the catalog system.
- **AC-5.2** Deleting a panel JSON file (or expert-leaf `.tsx` + `.bindings.ts` pair) removes the panel from the app with no other code change.
- **AC-5.3** The catalog has a documented vocabulary of ~10–15 primitive leaves; new entries land only when ≥2 panels would use them.
- **AC-5.4** All Operation-layer gaps surfaced during Phase 5 ship before Phase 5 closes.
- **AC-5.5** The Inspector panel is retired (deleted) by Phase 5 close, unless an explicit decision keeps it as a debug-only surface.

---

## Phase 6 — DEFERRED: A2UI / agentic adapter (gated)

`sdk.md` §8 Step 6 + §10.1. Do not start until:

- The catalog has ≥2 months of first-party mileage (Phases 3–5 closed).
- The binding model is stable enough that the catalog vocabulary section in `sdk.md` can be written as reference rather than as proposal.
- The decision triggers in `sdk.md` §10 fire (a concrete external-bundle story exists).

Scoping reminder: when this eventually lands, the adapter is **one file** (`packages/catalog/src/adapters/a2ui.ts`) that maps A2UI component refs → Paged catalog IDs and A2UI bindings → Paged `Binding`s. Anything in the adapter that references a component not in the catalog is rejected. **Nothing else in the codebase knows A2UI exists** — invariant 11.

---

## Open questions — proposed resolutions (all redirectable)

| § | Question | Proposal | Status after this plan |
|---|---|---|---|
| 11.1 | Selection-property shape — snapshot vs live Proxy | **Snapshot.** Both consumers already do this. | Closed in Phase 2 |
| 11.2 | Application-state ownership | **Rust is canonical owner; main-thread state is a mirror.** | Closed in Phase 2 |
| 11.3 | Tool registry timing | **Lands in Phase 1**; `activeTool` becomes an observable in `@paged-media/client`. | Closed in Phase 1 |
| 11.4 | `@paged-media/ui` granularity vs catalog vocabulary | **Defer to Phase 3 empirically.** Catalog primitives are a curated subset of `@paged-media/ui` with declared binding points. | Closed in Phase 3 |
| 11.5 | Binding expressiveness ceiling | **Literals + selectionProperty refs + unit coerce only.** Anything richer is an expert leaf. | Closed (user-confirmed) |
| 11.6 | Configurable persistence storage | **localStorage layout only** (dockview auto-persist). Saved perspectives + per-document UI out of scope. | Closed |

---

## Cross-phase items

### Lint rules to add in Phase 1, hold throughout

1. `packages/client/**` may not import `react` / `react-*`.
2. Only `packages/shell/src/docking/dockview-substrate.ts` may import `dockview-react`.
3. `packages/client/src/protocol.ts` may only contain `export type { ... } from ...` lines.
4. *(Phase 3)* Every leaf in `packages/catalog/src/leaves/**/*.tsx` must have a sibling `*.bindings.ts` declaring `reads` + `writes`.
5. *(Phase 3)* Every expert-leaf panel under `apps/canvas/src/panels/**/*.tsx` must have a sibling `*.bindings.ts`. (Catalog leaves and expert panels share the same declaration discipline.)

### Test infrastructure additions

- **Phase 0:** CI step rebuilds wasm and `git diff --exit-code` the `.d.ts`.
- **Phase 2:** Native parity test — `paged.inspect` JSON ≡ channel reply JSON.
- **Phase 3:** Composition golden tests — render Character with a known fixture, assert the DOM tree.
- **Phase 3:** Expert-leaf binding-manifest lint.
- **Phase 5:** "No React panel file" lint — every panel registration in `BUILT_IN_PANELS` must reference a catalog entry or an expert-leaf manifest.

### Naming / repo evolution

- **Do not rename** `packages/shell/` → `packages/react/` during Phases 0–5. The rename is cosmetic and would conflict with every in-flight branch. Land it as a mechanical commit post-Phase-5 if at all.
- New package names use the existing `@paged-media/*` scope: `@paged-media/client`, `@paged-media/catalog`.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Package extraction breaks worker spawn (URL resolution) | High | Inject `workerUrl` as a `CanvasClient` ctor option; no `import.meta.url` inside the moved code. |
| Binding model drifts toward "JSON React" (§11.5 ceiling slips) | Medium | Hard rule: no expressions in binding values. Any panel that wants more becomes an expert leaf — enforce at PR review. |
| Declarative Character feels worse than the existing Inspector | Medium | Build Character first; compare side-by-side; if worse, the catalog primitives need work — fix the catalog, not by going imperative. |
| Catalog primitive surface explodes | Medium | Rule: new primitive needs ≥2 panel use cases. Documented in catalog README. |
| Rust Operation set incomplete for character/paragraph/swatch edits | High | Treat each gap as Phase 3 work, not Phase 5. Phase 3 ships only when all gaps are filled. |
| Re-render isolation drifts during context extraction | Low | The five core contexts are already isolated; Phase 1 preserves this via per-observable `useSyncExternalStore`. |
| Expert-leaf authors bypass `apply` over time | High (cumulative) | Lint rule + code review. Invariant 9 is explicit. Pair an audit pass into each release. |
| A2UI adapter pulled in early to "validate the catalog" | Medium | Gate explicitly: Phase 6 only after Phases 3–5 close. Documented in the catalog README. |
| The existing panels (Inspector etc.) break during Phase 1's context refactor | Medium | Lift the data; keep the React adapter shape identical. The existing panels see no change in the hooks they consume. |

---

## Estimated calendar

| Phase | Effort | Cumulative |
|---|---|---|
| 0 | 1 day | 1 day |
| 1 | 3–5 days | ~1 week |
| 2 | 1–2 days | ~1.5 weeks |
| 3 | 2–3 weeks | ~4 weeks |
| 4 | 2–3 days | ~4.5 weeks |
| 5 | 1–2 weeks | ~6 weeks |
| 6 | Deferred | — |

**Critical-path single risk:** Phase 3, specifically the catalog primitive design. If Character or Pages needs richer primitives than sketched here, the calendar slips on primitive design, not on Pages or the expert leaf.

---

## Sequencing rationale, in one sentence

Finish the contract (Phase 0) → draw the boundary (Phase 1) → close the convergence gap before building on it (Phase 2) → prove the binding model, the boundary, and the expert-leaf contract against three real panels while leaving the existing panels untouched (Phase 3) → retire the menu (Phase 4) → generalize the existing panels and add the doc's named ones cheaply (Phase 5) → only then admit an external producer (Phase 6).

This sequence is deliberately not breadth-first: a breadth-first sweep would design the catalog against the easy panels and discover the hard requirements halfway through.

---

## What this plan does **not** cover

- The renderer / canvas pipeline. Outside the SDK boundary by design.
- Untrusted scripting / sandboxing. Deferred per `scripting-layer.md`.
- Third-party bundle distribution (marketplace, signed bundles). Deferred per `sdk.md` §10.
- Per-document UI configuration. Out of scope per §11.6.
- Saved layout perspectives beyond the dockview auto-persist. Out of scope per §11.6.
- Internationalisation of UI strings. Worth a parallel plan once the catalog vocabulary stabilises.
