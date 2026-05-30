# Paged: Technical Specification — Application Shell (Step 3 Substrate)

*Companion document to the Paged Editor Architecture briefing. The briefing defines the four-layer architecture (renderer → scripting → shell → bundles), the two mutation channels (Operations + Gestures), and the build sequence. This specification zooms in on Step 3 of that sequence: the empty application shell that hosts the existing IDML canvas, with a declarative panel registry, the dockview docking substrate, the shadcn UI foundation, the application-state context layer, and the tsify-generated WASM ↔ TypeScript type contract. The deliverable of Step 3 is a shell that can run with zero bundles loaded, into which the existing `CanvasApp` is decomposed and re-mounted as a configurable arrangement of panels, with all types crossing the WASM boundary derived from Rust as the single source of truth.*

*This is the spec, not the implementation plan. The implementation plan is the build sequence at the end.*

*Revision history: original draft covered shell decomposition, registries, dockview substrate, shadcn, theming, command palette, and persistence. This revision adds the WASM ↔ TypeScript contract layer using tsify to eliminate the type-drift class of bug between the Rust renderer and the TypeScript shell, removes the hand-written `protocol.ts` as the source of truth for shared types, and updates the migration path, build sequence, time budget, acceptance criteria, and what-not-to-do accordingly.*

---

## Scope

This spec covers:

- The decomposition of the existing `apps/canvas/src/ui/CanvasApp.tsx` into a shell + panels.
- The **WASM ↔ TypeScript type contract**, generated from Rust via `tsify`, replacing the hand-written `protocol.ts` as the source of truth for shared types.
- The Panel Manifest format and the `PanelRegistry`.
- The Application State context layer (camera, selection, content selection, document, client).
- The `DockingSubstrate` abstraction and the single `DockviewSubstrate` implementation.
- The `SemanticGroupRegistry` mapping semantic group names to dockview group IDs at runtime.
- The shadcn UI setup, the `@paged-media/ui` panel design system layered on top, and the substrate-isolation discipline that mirrors the dockview wrapping.
- The CSS-variable theme bridge between shadcn and dockview.
- The command palette built on shadcn's `Command` primitive, with an initially empty `CommandRegistry`.
- Layout auto-persistence to `localStorage`.
- The monorepo organization that supports the substrate-isolation discipline.
- The migration path from the current `CanvasApp.tsx` and `protocol.ts` to the shell+panels+generated-types structure.

Out of scope:

- The bundle loader and bundle activation lifecycle (Step 4 of the build sequence).
- The gesture pipeline, pointer event routing into the renderer, the overlay layer (Step 5).
- The refactor of the inspector into a bundle (Step 6).
- The specific visual design language — colors, typography, density (the design language brief, Step 1, is a separate artifact).
- The Phase 2 OffscreenCanvas + Vello live-tile renderer work, which is renderer-internal and orthogonal to the shell.

## Position in the Architecture

The shell sits on top of the renderer + scripting layer, beneath bundles. It is the empty container into which feature contributions are registered.

```
┌─────────────────────────────────────────────────┐
│  Bundles (future — Step 4+)                     │
│  Register: panels, tools, commands, menus       │
└─────────────────────────────────────────────────┘
                       ▲
                       │ Contribution API
                       ▼
┌─────────────────────────────────────────────────┐
│  Paged Application Shell                  ← Step 3 substrate
│  ┌───────────────────────────────────────────┐  │
│  │  Panel Registry                           │  │
│  │  Command Registry                         │  │
│  │  Semantic Group Registry                  │  │
│  │  Application State (contexts)             │  │
│  │  Docking Substrate (wraps dockview)       │  │
│  │  Theme bridge (shadcn ↔ dockview)         │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                       ▲
                       │ CanvasClient (worker bridge)
                       │ — types generated from Rust via tsify ─
                       ▼
┌─────────────────────────────────────────────────┐
│  IDML Renderer (existing — apps/canvas worker)  │
│  Scene graph, layout, snapshots, mutations      │
│  Rust types annotated #[derive(Tsify)] — source │
│  of truth for the WASM ↔ TypeScript boundary    │
└─────────────────────────────────────────────────┘
```

Step 3 produces the middle layer in this picture. Step 4 adds the contribution API and bundle loader on top. Steps 5+ build the gesture pipeline, the inspector-as-bundle, and the core editor bundles. The renderer beneath is unchanged.

## Current State (What's in `CanvasApp.tsx` Today)

The existing implementation is a single-component shell. Its responsibilities, as currently distributed:

**Application state held in `useState`:**
- `handle: DocumentHandle | null` — the loaded document.
- `snapshots: Map<PageId, string>` — per-page thumbnail data URLs.
- `camera: Camera` — viewport pan/zoom, mirrored to SAB on every change.
- `selection: SelectionState | null` — visual hit selection from the viewport.
- `contentSelection: ContentSelection | null` — text caret/range selection within a story.
- `caret: CaretGeometry | null` — derived from worker after selection/mutation.
- `selectionRects: SelectionRect[]` — derived from worker after selection/mutation.
- `resolution: ResolutionResult | null` — document structural resolution.
- `gpuActive: boolean | null` — renderer instrumentation.
- `loading: { name, bytes } | null` — file-loading UI state.
- `status: string`, `warnings: string[]` — user-facing status surface.
- `layoutCacheStats: LayoutCacheStats | null` — Phase 4 instrumentation.

**Document-loading orchestration:**
- Worker boot via `CanvasClient`.
- File drop / pick → byte read → `client.loadDocument()` → per-page snapshot fetching → status updates.
- Inter font fetch as a side-channel before document load.

**Subscriptions:**
- `client.subscribe()` for `warning`, `attachReady`, `resolutionDone`, `mutationApplied` / `undoApplied` / `redoApplied`.
- `ResizeObserver` on the viewport container for fit-to-page math.

**Layout (JSX):**
- Header with status, file picker.
- Left: `PageNavigator` (thumbnails).
- Left (when resolution available): `Outline` (structural).
- Center: `ViewportCanvas` (the renderer surface + HUD).
- Empty state when no document is loaded.
- Loading overlay during file parse.

**Hooks used:**
- `useAnimatedCamera` for discrete camera jumps.
- `useKeyboardShortcuts` for navigation.
- `useTextEditing` for keyboard input on selected text.
- `useFps` for HUD.

**Dev hook:**
- `window.__canvas` for Playwright + ad-hoc browser scripting.

The component is 513 lines, 17 KB, and is doing the work of what should be five or six smaller pieces. The Step 3 decomposition redistributes these responsibilities without changing any of the underlying behavior.

The hand-written `apps/canvas/src/channel/protocol.ts` is, similarly, doing the work of "shared type declarations across a language boundary" — a contract maintained in two places (Rust on one side, TypeScript on the other) with no enforced relationship between them. The Step 3 contract-layer work eliminates this duplication.

## The WASM ↔ TypeScript Contract

The renderer is Rust compiled to WASM, hosted in a Web Worker, talking to the main thread via `postMessage` (and to the WASM module directly via `wasm-bindgen` calls). Both edges carry typed data: `DocumentHandle`, `ContentSelection`, `CaretGeometry`, `SelectionRect`, `WorkerToMain` discriminated unions, etc. Today these types exist in two places — as Rust structs/enums in the renderer crate, and as hand-written TypeScript interfaces in `apps/canvas/src/channel/protocol.ts`. Nothing prevents drift between them; drift becomes a runtime bug, often a subtle one (a renamed field becomes `undefined`, a re-shaped variant produces an unhandled case in a switch).

The Step 3 substrate fixes this by making Rust the source of truth and generating TypeScript from it via [`tsify`](https://github.com/madonoharu/tsify).

### Why tsify (and not the alternatives)

The alternatives considered:

- **Hand-written TypeScript matching Rust by convention** — the current state. Cheap, fragile, scales poorly with the number of types crossing the boundary. As the renderer grows toward Phase 2+ (live-tile rendering) and Step 5 (gesture pipeline), the protocol surface grows; manual maintenance becomes a tax.
- **`ts-rs`** — alternative derive macro, emits `.ts` files via test runs. Slightly more ceremony (separate test runner step, manually configured output paths). Strong fit for non-wasm-bindgen workflows; the integration with wasm-bindgen is less natural.
- **WIT + the Component Model** — the architecturally correct long-term answer. Not yet pragmatic for production browser apps in 2026; browser tooling is still maturing and would mean abandoning the wasm-bindgen workflow that's already working.
- **OpenAPI / JSON Schema / Protocol Buffers** — HTTP-shaped or RPC-shaped schema languages. Wrong vocabulary for an in-process WASM boundary; pay full tooling cost for one feature (schema-driven types) that tsify gives for free.

tsify is the right fit because it integrates directly with wasm-bindgen's `.d.ts` generation, requires no separate build step, supports the full Rust type system that matters here (structs, enums including tagged unions, generics, optional fields), and has a stable API at version 0.5.x.

### What moves to Rust as source of truth

Every type in `apps/canvas/src/channel/protocol.ts` that has a Rust counterpart on the renderer side. Concretely:

- `DocumentHandle`, `PageId`, page metadata.
- `ContentSelection`, `CaretGeometry`, `SelectionRect`.
- `ResolutionResult` and its substructures.
- `LayoutCacheStats`.
- `Camera` (already shared via SAB, but the struct itself is Rust-side).
- The `WorkerToMain` discriminated union and every variant's payload (`warning`, `attachReady`, `resolutionDone`, `mutationApplied`, `undoApplied`, `redoApplied`).
- The `MainToWorker` discriminated union (`hello`, `loadDocument`, `requestSnapshot`, `setCamera`, `setSelection`, `caretGeometry`, `selectionGeometry`, mutation/undo/redo commands).

After the migration, `protocol.ts` contains *only*:

- A re-export of the generated types from the Rust-emitted `.d.ts`.
- TypeScript-only types that have no Rust counterpart — primarily the `CanvasClient` class's request/reply correlation types and any UI-side helper types.

### Cargo setup

In the renderer crate's `Cargo.toml` (the crate that exports the WASM module):

```toml
[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde-wasm-bindgen = "0.6"
tsify = { version = "0.5", default-features = false, features = ["js"] }
```

The `js` feature is non-default and is the right choice for Paged. The default (`json`) routes Rust ↔ JS data through `serde_json` — fine for small messages, wasteful for large ones (the geometry payloads in `SelectionRect[]` or `CaretGeometry` are not small once a real document is loaded). The `js` feature uses `serde-wasm-bindgen` instead, marshaling directly into JS values without an intermediate JSON string. For a renderer that emits selection geometry on every keystroke and layout cache stats on every mutation, the difference matters.

### Type annotation pattern

Every Rust type that crosses the WASM boundary gets the `Tsify` derive plus the wasm-abi attribute:

```rust
// In the renderer crate, e.g. src/protocol.rs

use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ContentSelection {
    pub story_id: StoryId,
    pub start: u32,
    pub end: u32,
    pub affinity: bool,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CaretGeometry {
    pub page_id: PageId,
    pub x_pt: f64,
    pub y_pt: f64,
    pub height_pt: f64,
}

// Discriminated union — tsify generates a TypeScript tagged union.
#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(tag = "kind", content = "payload", rename_all = "camelCase")]
pub enum WorkerToMain {
    Warning(WorkerWarning),
    AttachReady(AttachReadyPayload),
    ResolutionDone(ResolutionResult),
    MutationApplied(MutationAppliedPayload),
    UndoApplied(MutationAppliedPayload),
    RedoApplied(MutationAppliedPayload),
}
```

This generates TypeScript equivalents that match the existing `protocol.ts` shape, with two specific advantages:

- **`#[serde(rename_all = "camelCase")]`** makes the TypeScript field names idiomatic (`storyId` not `story_id`) while Rust stays idiomatic (`story_id` not `storyId`). The serde rename does the work; tsify follows it.
- **Discriminated unions** with `#[serde(tag = "kind", content = "payload")]` produce TypeScript types that match the existing `WorkerToMain` shape exactly (`{ kind: "warning", payload: { ... } }` etc.). The `client.subscribe` handler's switch statement works unchanged.

### Build integration

tsify hooks into wasm-bindgen's existing `.d.ts` generation. The build pipeline becomes:

1. `cargo build --target wasm32-unknown-unknown --release` in the renderer crate.
2. `wasm-bindgen` post-processing emits `.wasm` + `.js` + `.d.ts`. The `.d.ts` includes the tsify-derived types automatically.
3. The output is consumed by `apps/canvas`'s Vite build like any other dependency.

No separate codegen step. No extra build tool. The TypeScript types are produced as a side-effect of the existing WASM build.

For local development, the workflow is `wasm-pack build` (or `cargo-make` running the equivalent) in the renderer crate, then standard Vite HMR on the TypeScript side. The generated `.d.ts` lives at the wasm-bindgen output path; `apps/canvas`'s `tsconfig.json` already has it in its module-resolution scope.

### What stays in TypeScript

Not everything in `protocol.ts` has a Rust counterpart, and not everything should:

- **The `CanvasClient` class itself.** The dispatch logic, request/reply correlation, `subscribe` mechanism. This is TypeScript orchestration over the `postMessage` channel, not a shared type.
- **Promise-resolver maps and pending-request bookkeeping.** Inherent to the JS side; no Rust analog.
- **UI-only types.** `SelectionState` (the union of visual selection + geometry that the React side composes), component prop types, hook return shapes. These never cross the WASM boundary.
- **The dev-hook shape on `window.__canvas`.** Pure debugging surface.

The discipline: if a type travels through `postMessage` or through a wasm-bindgen call, it's Rust-sourced via tsify. If it lives entirely in the TypeScript shell or the React tree, it's TypeScript-only.

### The hot-path exception

Not every wasm-bindgen call goes through tsify. The camera-update path — `client.setCamera(cam)` — writes to a `SharedArrayBuffer` in the current implementation; the worker reads on its next frame. This is the right design for a 60-Hz pan/zoom update: no message-passing overhead, no serialization. It stays as-is.

The pattern is: **discrete, structured, low-frequency events go through tsify-typed messages. High-frequency continuous updates go through SAB or direct numeric wasm-bindgen arguments.** Selection changes, mutations, document loads → tsify. Camera scrubbing, future gesture pipeline frame updates → SAB or raw numeric arguments.

This split happens to align with the Operations vs Gestures distinction from the parent briefing: Operations are tsify-typed (they're the discrete events of the document's history); the Gesture API in Step 5 will be raw and fast, exposing `beginGesture` / `updateGesture` / `commitGesture` with numeric arguments where it counts.

### Migration of `protocol.ts`

The existing `apps/canvas/src/channel/protocol.ts` is replaced in two passes:

**Pass 1 — additive.** Add tsify derives to the corresponding Rust types. Build the renderer; the generated `.d.ts` now contains TypeScript types that parallel `protocol.ts`. Verify the generated types are structurally identical to the hand-written ones (a one-time diff review). Both versions coexist.

**Pass 2 — replacement.** In `protocol.ts`, replace each hand-written interface with a re-export from the generated types. Update `CanvasClient` to import from the generated module. Delete the hand-written interfaces. The file shrinks from ~150 lines to ~30 lines plus the `CanvasClient` class.

Pass 1 is risk-free; pass 2 is mostly mechanical, and the type checker catches any discrepancies as compile errors.

### Versioning the contract

The protocol version is already wire-visible (the `hello` / `ready` handshake exchanges a `protocol` version number). With Rust-sourced types, the version is whatever the renderer crate's `Cargo.toml` says it is — single source of truth for the version too. Worth incrementing it whenever a tsify-derived type's shape changes incompatibly, and worth a CI check that the version increments when the generated `.d.ts` changes meaningfully. That CI check is a Step 4 concern, not Step 3 — for Step 3, hand-discipline is enough.

## The Four Registries

The shell maintains four registries as its core data model. All four are initially empty (no contributions); the built-in panels register themselves at shell startup, third-party bundles will register through the same APIs in Step 4+.

### 1. PanelRegistry

The declarative panel manifest is the central abstraction. A panel is data:

```typescript
// packages/shell/src/registries/panel.ts

import type { ComponentType } from "react";

export interface PanelProps {
  /** The Paged editor handle — context providers, registries, client. */
  paged: PagedEditor;
  /** Dockview-provided lifecycle. Bundles never read this directly. */
  api: PanelApi;
}

export interface PanelContribution {
  /** Stable identifier. Format: "<namespace>.<panel>". */
  id: string;

  /** Human-readable title shown in the tab header. */
  title: string;

  /** The React component to render inside the panel. */
  component: ComponentType<PanelProps>;

  /** Initial dock edge. Users may rearrange; this is initial placement only. */
  defaultDock?: DockEdge;

  /** Semantic group name. Panels declaring the same group land in the same dockview group. */
  defaultGroup?: string;

  /** Optional icon for the tab header. */
  icon?: string;

  /** Optional visibility predicate evaluated against application state. */
  when?: VisibilityPredicate;

  /** Whether the panel is closable. Defaults to true; false for the canvas. */
  closable?: boolean;

  /** Whether the panel can be moved. Defaults to true; false for the canvas. */
  movable?: boolean;
}

export type DockEdge = "left" | "right" | "top" | "bottom" | "center";

export type VisibilityPredicate =
  | string                                    // e.g. "selection.hasType('TextFrame')"
  | ((state: ApplicationState) => boolean);

export interface PanelRegistry {
  register(contribution: PanelContribution): Disposable;
  unregister(id: string): void;
  get(id: string): PanelContribution | undefined;
  list(): PanelContribution[];
  onChange(handler: (event: PanelRegistryEvent) => void): Disposable;
}

export type PanelRegistryEvent =
  | { kind: "registered"; contribution: PanelContribution }
  | { kind: "unregistered"; id: string };
```

The registry is a passive data store. The `DockingSubstrate` subscribes to its events and projects them into dockview operations. The registry itself knows nothing about dockview.

### 2. CommandRegistry

Commands are the canonical action primitive. Every menu item, every keybinding, every command-palette entry resolves to a command.

```typescript
// packages/shell/src/registries/command.ts

export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  icon?: string;
  /** The handler. Receives the editor and an optional payload. */
  handler: (paged: PagedEditor, payload?: unknown) => void | Promise<void>;
  /** Optional enablement predicate. Disabled commands appear greyed in UI. */
  when?: VisibilityPredicate;
}

export interface CommandRegistry {
  register(contribution: CommandContribution): Disposable;
  unregister(id: string): void;
  invoke(id: string, payload?: unknown): Promise<void>;
  get(id: string): CommandContribution | undefined;
  list(): CommandContribution[];
}
```

In Step 3, the only command registered is `paged.file.openIdml` — the existing file-picker functionality, lifted into a command so it's invocable from the palette. The header file picker becomes a UI element that invokes this command.

### 3. SemanticGroupRegistry

The bridge between bundle-declared semantic placement (`defaultGroup: "structure"`) and concrete dockview group IDs created at runtime.

```typescript
// packages/shell/src/docking/semantic-group.ts

export interface SemanticGroupRegistry {
  /** Get the dockview group ID for a semantic name, creating one if needed. */
  resolve(name: string, defaultDock: DockEdge): string;

  /** Look up without creating. */
  lookup(name: string): string | undefined;

  /** Called by the substrate when a dockview group is removed (user closed all tabs). */
  forget(name: string): void;
}
```

The resolution rule: if a semantic name has never been seen, create a new dockview group docked to `defaultDock`, register the mapping, return the new group's ID. If it has been seen and the group still exists in dockview, return its ID. If it has been seen but the group has been dissolved (user closed all its tabs), re-resolve as if new — this is the "third-party bundle registering against `'typography'` after the user has dissolved that group" case from the briefing.

### 4. KeybindingRegistry

Declared in the spec but with minimal implementation in Step 3. The existing `useKeyboardShortcuts` hook in `CanvasApp.tsx` is left in place during Step 3, hooked into the post-decomposition state contexts. Migrating to a true registry happens in Step 4 alongside the bundle loader.

```typescript
// packages/shell/src/registries/keybinding.ts (stub for Step 3)

export interface KeybindingContribution {
  key: string;                  // e.g. "cmd+t", "shift+escape"
  command: string;              // command id
  when?: VisibilityPredicate;
}

export interface KeybindingRegistry {
  register(contribution: KeybindingContribution): Disposable;
  // Full implementation deferred to Step 4.
}
```

## The Application State Contexts

The state currently held inside `CanvasApp` lifts into React contexts at the shell level. Panels read from contexts via hooks. This is the application-state-vs-document-state line from the briefing made structural.

### Context boundaries

Each piece of application state gets its own context provider. Combining them into one mega-context is tempting and wrong — it causes unnecessary re-renders when any field changes. Five focused providers, each with a narrow purpose:

```typescript
// packages/shell/src/state/contexts.tsx

// 1. The worker client — stable, set once on mount.
export const CanvasClientContext = createContext<CanvasClient | null>(null);

// 2. The document — changes on file load.
export const DocumentContext = createContext<DocumentState>({
  handle: null,
  snapshots: new Map(),
  resolution: null,
  loading: null,
  status: "initialising…",
  warnings: [],
});

// 3. The camera — changes on every pan/zoom.
export const CameraContext = createContext<CameraState>({
  camera: IDENTITY_CAMERA,
  setCamera: () => {},
  animateCamera: () => {},
  viewportSize: [0, 0],
});

// 4. Visual selection — changes on click.
export const SelectionContext = createContext<SelectionState>({
  selection: null,
  setSelection: () => {},
});

// 5. Content selection — changes on text-editing keystrokes.
export const ContentSelectionContext = createContext<ContentSelectionState>({
  contentSelection: null,
  setContentSelection: () => {},
  caret: null,
  selectionRects: [],
});
```

The corresponding hooks form the public API panels use:

```typescript
// packages/shell/src/state/hooks.ts

export function useCanvasClient(): CanvasClient { /* throws if not in provider */ }
export function useDocument(): DocumentState { /* ... */ }
export function useCamera(): CameraState { /* ... */ }
export function useSelection(): SelectionState { /* ... */ }
export function useContentSelection(): ContentSelectionState { /* ... */ }

// Composite — most panels want the whole editor handle.
export function usePaged(): PagedEditor { /* aggregates the above */ }
```

### The mutation subscription consolidation

In the current implementation, the `client.subscribe()` handler in `CanvasApp` listens for `mutationApplied` / `undoApplied` / `redoApplied` and, on receipt, re-queries caret + selection geometry from the worker. After the decomposition, this subscription moves into the `ContentSelectionProvider` — it is the natural owner of caret state.

The reason this matters: if every panel that cares about mutations subscribes independently to the client, you end up with N copies of the same handler, all firing on every mutation, all racing. One central subscription per concern, publishing into contexts, is the correct pattern.

### Application state vs document state — concrete table

Drawing the line explicitly for the current code:

| State | Classification | Notes |
|---|---|---|
| `handle` (DocumentHandle) | Document (read-only view) | Identifies the loaded document. Mutations go through `CanvasClient`, not React state. |
| `snapshots` | Application (cache) | Derived from document, but the cache is per-user/per-session. |
| `resolution` | Document (read-only view) | Same as handle. |
| `camera` | Application | Per-user viewport. Each collaborator has their own. |
| `viewportSize` | Application | Per-user container size. |
| `selection` (visual) | Application | Per-user; the briefing's canonical case. |
| `contentSelection` (text) | Application | Per-user. Two users can have different carets in the same story. |
| `caret`, `selectionRects` | Application (derived) | Worker-computed from contentSelection; cached. |
| `loading`, `status`, `warnings` | Application | UI affordance state. |
| `gpuActive`, `layoutCacheStats`, `fps` | Application (instrumentation) | HUD-only. |

The dev hook `window.__canvas` flattens these into a debugging-friendly snapshot. It stays during Step 3, with extended surface to expose the registries as well: `window.__canvas = { client, document, camera, selection, contentSelection, panels, commands }`.

## The Docking Substrate

The single architectural commitment that absolutely cannot leak: **no code outside `DockviewSubstrate` imports from `dockview-react`**. The substrate is the seam.

### Interface

```typescript
// packages/shell/src/docking/substrate.ts

export interface DockingSubstrate {
  /** Add a panel and return a handle. */
  addPanel(spec: ResolvedPanelSpec): PanelHandle;

  /** Remove a panel. */
  removePanel(handle: PanelHandle): void;

  /** Move a panel to a different semantic location. */
  movePanel(handle: PanelHandle, target: SemanticLocation): void;

  /** Serialize the entire layout for persistence. */
  serialize(): LayoutSnapshot;

  /** Restore a previously serialized layout. */
  restore(snapshot: LayoutSnapshot): void;

  /** Pop a group out into a separate browser window. */
  popoutGroup(groupId: string): void;

  /** Subscribe to layout changes (for auto-persistence). */
  onLayoutChange(handler: () => void): Disposable;

  /** Subscribe to group lifecycle (for SemanticGroupRegistry.forget). */
  onGroupRemoved(handler: (groupId: string) => void): Disposable;
}

export interface ResolvedPanelSpec {
  id: string;
  title: string;
  component: ComponentType<PanelProps>;
  groupId: string;            // resolved by SemanticGroupRegistry
  closable: boolean;
  movable: boolean;
  hideTabHeader?: boolean;    // true for the canvas
}

export interface PanelHandle {
  readonly id: string;
  readonly groupId: string;
}

export type LayoutSnapshot = unknown;   // opaque — depends on substrate
```

### DockviewSubstrate implementation

```typescript
// packages/shell/src/docking/dockview-substrate.ts

import { DockviewApi, IDockviewPanelProps } from "dockview-react";

export class DockviewSubstrate implements DockingSubstrate {
  constructor(
    private api: DockviewApi,
    private semanticGroups: SemanticGroupRegistry,
  ) {
    this.api.onDidLayoutChange(() => this.layoutChangeHandlers.forEach((h) => h()));
    this.api.onDidRemoveGroup((g) => this.groupRemovedHandlers.forEach((h) => h(g.id)));
  }

  addPanel(spec: ResolvedPanelSpec): PanelHandle {
    this.api.addPanel({
      id: spec.id,
      component: spec.id,             // we register components per panel id
      title: spec.title,
      tabComponent: spec.hideTabHeader ? "hidden" : undefined,
      params: { panelId: spec.id },
      position: { referenceGroup: spec.groupId },
    });

    const panel = this.api.getPanel(spec.id);
    if (!panel) throw new Error(`dockview did not add panel ${spec.id}`);

    // closable + movable handled via group constraints + tab component choices.
    if (!spec.closable) {
      // Suppress close button by using a custom tab component that omits it.
    }

    return { id: spec.id, groupId: spec.groupId };
  }

  // ... removePanel, movePanel, serialize, restore, popoutGroup, etc.
}
```

The substrate registers each panel's component under its own name in dockview's component map, rather than using a single generic component-resolver. This keeps the dockview-side mental model simple: one panel id = one component = one registered name.

### The wrapping discipline, restated

- `dockview-react` is imported in exactly one file: `dockview-substrate.ts`.
- Bundles never call `DockingSubstrate` methods directly either — they go through `PanelRegistry.register()`, which the substrate observes.
- The substrate's `LayoutSnapshot` type is `unknown` from the outside; only the substrate knows it's a dockview JSON blob.
- If dockview is ever swapped for `rc-dock`, `flexlayout-react`, or a future library, the only file that changes is `dockview-substrate.ts`. Plus, of course, the theme bridge — see below.

## The Panel Bridge

The connection between the declarative `PanelRegistry` and the imperative `DockingSubstrate` is a small piece of glue that watches the registry and applies changes to the substrate.

```typescript
// packages/shell/src/docking/panel-bridge.ts

export class PanelBridge {
  private handles = new Map<string, PanelHandle>();

  constructor(
    private panels: PanelRegistry,
    private substrate: DockingSubstrate,
    private semanticGroups: SemanticGroupRegistry,
  ) {
    // Register existing panels.
    for (const contribution of panels.list()) {
      this.add(contribution);
    }
    // Track future changes.
    panels.onChange((event) => {
      if (event.kind === "registered") this.add(event.contribution);
      if (event.kind === "unregistered") this.remove(event.id);
    });
  }

  private add(contribution: PanelContribution) {
    const groupId = this.semanticGroups.resolve(
      contribution.defaultGroup ?? contribution.id,
      contribution.defaultDock ?? "right",
    );
    const handle = this.substrate.addPanel({
      id: contribution.id,
      title: contribution.title,
      component: contribution.component,
      groupId,
      closable: contribution.closable ?? true,
      movable: contribution.movable ?? true,
      hideTabHeader: contribution.id === "paged.canvas",  // the only special case
    });
    this.handles.set(contribution.id, handle);
  }

  private remove(id: string) {
    const handle = this.handles.get(id);
    if (handle) {
      this.substrate.removePanel(handle);
      this.handles.delete(id);
    }
  }
}
```

This is the seam where declarative meets imperative. The registry is data; the substrate is operations; the bridge translates one to the other.

## The Canvas as Center Panel

The IDML viewport is a special panel: permanently present, non-closable, non-tab-grouped, occupying the center of the layout. It registers itself like any other panel, with three differences:

```typescript
// packages/shell/src/panels/canvas.ts

export const canvasContribution: PanelContribution = {
  id: "paged.canvas",
  title: "Canvas",
  component: CanvasPanel,
  defaultDock: "center",
  closable: false,
  movable: false,
};
```

`CanvasPanel` is essentially today's `ViewportCanvas`, with its props replaced by context hooks:

```typescript
// packages/shell/src/panels/canvas-panel.tsx

export function CanvasPanel(_: PanelProps) {
  const client = useCanvasClient();
  const { handle } = useDocument();
  const { camera, setCamera, viewportSize } = useCamera();
  const { selection, setSelection } = useSelection();
  const { contentSelection, setContentSelection, caret, selectionRects } =
    useContentSelection();
  const fps = useFps();
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // ResizeObserver wiring stays — same as in CanvasApp today.

  return (
    <div ref={viewportRef} className="relative h-full w-full">
      {handle && handle.pageCount > 0 ? (
        <ViewportCanvas
          client={client}
          pageIds={handle.pageIds}
          /* ... existing props, sourced from contexts ... */
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
```

The dockview center panel hides its tab header (via the `tabComponent: "hidden"` mechanism — a tab component that renders `null`) and disables close + move. The shell adds it first, before any other panel, so the layout always has a center.

## Built-in Panels: PageNavigator and Outline

The two existing panels in `CanvasApp.tsx` migrate to the registry as built-in contributions:

```typescript
// packages/shell/src/panels/pages.ts

export const pagesContribution: PanelContribution = {
  id: "paged.pages",
  title: "Pages",
  component: PagesPanel,           // wraps PageNavigator, sources from contexts
  defaultDock: "left",
  defaultGroup: "structure",
};

// packages/shell/src/panels/outline.ts

export const outlineContribution: PanelContribution = {
  id: "paged.outline",
  title: "Outline",
  component: OutlinePanel,         // wraps Outline, sources from contexts
  defaultDock: "left",
  defaultGroup: "structure",
};
```

Both declare `defaultGroup: "structure"`, so they land in the same dockview group as tabs on the left edge. The user can drag them apart, tab them with other panels, float them, pop them out.

`PagesPanel` and `OutlinePanel` are thin wrappers around the existing `PageNavigator` and `Outline` components, sourcing camera + viewportSize + handle from contexts instead of props. The existing components themselves are unchanged.

In Step 4+, these become bundle-contributed instead of shell-internal. The registration call is the same; only the source of the call changes.

## shadcn/ui Integration

shadcn is the foundation for the shell's chrome and the basis on which `@paged-media/ui` (the panel design system) is built. The substrate-isolation discipline mirrors dockview's: **no bundle code ever imports from `packages/shell/components/ui/*`**.

### Setup

```bash
cd packages/shell
pnpm dlx shadcn@latest init
```

Configuration choices for the init:

- **Style:** "new-york" (denser, more appropriate for a creative tool than "default").
- **Base color:** "neutral" — the actual Paged brand colors come later via CSS variable overrides.
- **CSS variables:** yes — this is the entire point.
- **Tailwind config:** customize `tailwind.config.ts` to extend the CSS-variable token set rather than hardcoding values.

### Initial component set

For Step 3, install:

```bash
pnpm dlx shadcn@latest add button command dialog dropdown-menu input \
  popover separator slider tabs tooltip
```

`command` is the highest-priority addition — the command palette is built on it.

### The @paged-media/ui boundary

The panel design system is a separate package:

```
packages/ui/                       # @paged-media/ui
├── package.json
├── src/
│   ├── layout/
│   │   ├── PanelLayout.tsx
│   │   ├── PropertyRow.tsx
│   │   ├── ToolbarRow.tsx
│   │   └── EmptyState.tsx
│   ├── inputs/
│   │   ├── NumberInput.tsx        # composite, scrub-aware in Step 5
│   │   ├── EnumSelector.tsx
│   │   └── (more, as needed)
│   ├── display/
│   │   ├── Thumbnail.tsx
│   │   └── Swatch.tsx
│   ├── hooks/
│   │   └── (scrub gesture hook lands in Step 5)
│   └── index.ts                   # public API surface
└── tsconfig.json
```

`@paged-media/ui` re-exports a curated subset of shadcn primitives plus its own composites. Bundles import from `@paged-media/ui`; the shell can import from both `@paged-media/ui` and `@/components/ui/*` (shadcn directly) for its own chrome.

In Step 3, `@paged-media/ui` is intentionally minimal — just enough to support the existing panels' visual needs. The scrub-aware inputs (`LengthInput`, `NumberInput` with scrub, `ColorInput`) are deferred to Step 5 when the gesture pipeline lands and there's something for them to scrub against.

### Why two layers (shadcn + @paged-media/ui)

Three reasons, same shape as the dockview wrapping:

1. **Curation.** Bundle authors should see a curated set of components designed for panel construction, not the full shadcn surface area. `PropertyRow` exists; `NavigationMenu` does not, because no panel needs it.
2. **Composition.** `LengthInput` is not a shadcn component and never will be — it's a DTP composite of `Input` + scrub handle + unit toggle. These composites are what `@paged-media/ui` adds on top of shadcn primitives.
3. **Substrate isolation.** If shadcn ever needs replacing (it won't, probably), or if the Paged visual language diverges far enough that components are rewritten from scratch, the bundle code is shielded.

## Theming: One Variable Set, Two Substrates

shadcn defines its tokens as CSS variables. Dockview supports CSS-variable theming. Both are themed by a single `theme.css` that maps the shared semantic tokens onto each substrate's expected variable names.

```css
/* packages/shell/src/styles/theme.css */

:root {
  /* The semantic token layer — single source of truth. */
  --paged-bg: 0 0% 100%;
  --paged-fg: 0 0% 9%;
  --paged-border: 0 0% 89%;
  --paged-accent: 263 73% 43%;        /* Pimcore Purple, eventually */
  --paged-muted: 0 0% 96%;
  /* ... */

  /* shadcn mapping. */
  --background: var(--paged-bg);
  --foreground: var(--paged-fg);
  --border: var(--paged-border);
  --primary: var(--paged-accent);
  --muted: var(--paged-muted);
  /* ... */

  /* dockview mapping. */
  --dv-background-color: hsl(var(--paged-bg));
  --dv-tabs-and-actions-container-background-color: hsl(var(--paged-muted));
  --dv-separator-border: hsl(var(--paged-border));
  --dv-activegroup-visiblepanel-tab-color: hsl(var(--paged-accent));
  /* ... */
}

.dark {
  --paged-bg: 0 0% 9%;
  --paged-fg: 0 0% 98%;
  /* ... etc. */
}
```

When the design language brief from Step 1 produces specific values, only the `--paged-*` tokens change. Both shadcn and dockview pick up the change automatically.

### Theming dockview specifically

Dockview ships with a few default themes (`dockview-theme-light`, `dockview-theme-abyss`, etc.). For Paged, write a custom theme class — `dockview-theme-paged` — that overrides dockview's CSS variables to read from `--paged-*` tokens. Apply this class to the `DockviewReact` root:

```tsx
<DockviewReact
  className="dockview-theme-paged"
  /* ... */
/>
```

The custom theme file is roughly 30–50 lines of CSS variable mappings. The dockview docs publish the full list of CSS variables it accepts; the work is mechanical.

## The Command Palette

The command palette is the shell's most important interaction surface and the first feature to build after the skeleton exists.

### Implementation

```tsx
// packages/shell/src/chrome/CommandPalette.tsx

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const commands = useCommandRegistry();
  const paged = usePaged();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {Object.entries(groupBy(commands.list(), (c) => c.category ?? "Other"))
          .map(([category, items]) => (
            <CommandGroup key={category} heading={category}>
              {items.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  onSelect={() => {
                    setOpen(false);
                    commands.invoke(cmd.id);
                  }}
                >
                  {cmd.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
      </CommandList>
    </CommandDialog>
  );
}
```

### Initial commands in Step 3

Just one, reflecting the existing file-picker functionality:

```typescript
const fileOpenCommand: CommandContribution = {
  id: "paged.file.openIdml",
  title: "Open IDML…",
  category: "File",
  handler: async (paged) => {
    const file = await pickFile({ accept: ".idml" });
    if (file) await loadIdmlDocument(paged, file);
  },
};
```

The shell registers this on startup. The existing header file-drop affordance is preserved; it now invokes the command rather than calling `onFile` directly. Cmd-K → "Open IDML" works.

In Step 4+, panel toggle commands (`Show: Pages`, `Hide: Outline`) are auto-generated from `PanelRegistry.list()`. In Step 5+, perspective switches and node-level navigation are added.

## Layout Persistence

Two storage scopes, distinct policies, both straightforward.

### Current layout — auto-persisted

```typescript
// packages/shell/src/persistence/layout-persistence.ts

const STORAGE_KEY = "paged.layout.current";
const DEBOUNCE_MS = 500;

export function setupLayoutPersistence(substrate: DockingSubstrate): Disposable {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sub = substrate.onLayoutChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const snapshot = substrate.serialize();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }, DEBOUNCE_MS);
  });

  return {
    dispose: () => {
      if (timer) clearTimeout(timer);
      sub.dispose();
    },
  };
}

export function restoreLayoutOrDefault(
  substrate: DockingSubstrate,
  defaultLayout: () => void,
): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    defaultLayout();
    return;
  }
  try {
    const snapshot = JSON.parse(raw) as LayoutSnapshot;
    substrate.restore(snapshot);
  } catch (err) {
    console.warn("paged: failed to restore layout, using default", err);
    defaultLayout();
  }
}
```

The defensive fallback to `defaultLayout()` matters: schema changes between Paged versions will eventually invalidate stored snapshots. Better to fall back than to crash on startup.

### Saved perspectives — deferred to Step 4+

The explicit perspective save/load story (named, exportable as JSON, switchable from the command palette) is part of the broader command + menu work in Step 4. The data layer is already there — perspectives are just labeled `LayoutSnapshot`s — but the UI surface waits.

## Monorepo Organization

The shell + UI + canvas split implies a workspace. Recommended structure:

```
idml/
├── apps/
│   └── canvas/                     # existing — minimal changes
│       ├── package.json
│       └── src/
│           ├── main.tsx            # mounts <PagedShell />, not <CanvasApp />
│           ├── channel/
│           │   ├── client.ts       # CanvasClient — unchanged orchestration
│           │   ├── protocol.ts     # SHRUNK — re-exports tsify-generated types
│           │   └── generated/      # tsify output, gitignored or vendored
│           │       └── index.d.ts  # produced by wasm-bindgen + tsify
│           └── ui/
│               ├── CanvasApp.tsx   # deleted by end of Step 3
│               ├── ViewportCanvas.tsx  # moved into shell/panels/
│               ├── Navigator.tsx   # moved into shell/panels/
│               ├── Outline.tsx     # moved into shell/panels/
│               └── …
├── crates/
│   └── renderer/                   # existing Rust renderer (path may differ)
│       ├── Cargo.toml              # tsify added as a dependency
│       └── src/
│           ├── protocol.rs         # all #[derive(Tsify)] types — source of truth
│           └── …
├── packages/
│   ├── shell/                      # NEW — @paged-media/shell
│   │   ├── package.json
│   │   ├── tailwind.config.ts
│   │   ├── components.json         # shadcn config
│   │   └── src/
│   │       ├── index.tsx           # <PagedShell /> root component
│   │       ├── components/ui/      # shadcn primitives
│   │       ├── chrome/
│   │       │   ├── CommandPalette.tsx
│   │       │   ├── Header.tsx
│   │       │   └── DockviewRoot.tsx
│   │       ├── docking/
│   │       │   ├── substrate.ts          # interface
│   │       │   ├── dockview-substrate.ts # impl — only file importing dockview
│   │       │   ├── panel-bridge.ts
│   │       │   └── semantic-group.ts
│   │       ├── panels/
│   │       │   ├── canvas-panel.tsx
│   │       │   ├── pages-panel.tsx
│   │       │   └── outline-panel.tsx
│   │       ├── registries/
│   │       │   ├── panel.ts
│   │       │   ├── command.ts
│   │       │   └── keybinding.ts
│   │       ├── state/
│   │       │   ├── contexts.tsx
│   │       │   ├── hooks.ts
│   │       │   └── document-loader.ts    # the file-load orchestration
│   │       ├── styles/
│   │       │   ├── theme.css
│   │       │   └── dockview-theme-paged.css
│   │       └── persistence/
│   │           └── layout-persistence.ts
│   └── ui/                         # NEW — @paged-media/ui
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── layout/
│           ├── inputs/
│           └── display/
├── package.json                    # workspace root
├── pnpm-workspace.yaml             # or yarn workspaces / npm workspaces
└── tsconfig.base.json
```

The reasoning for `packages/shell` vs `apps/canvas`:

- `apps/canvas` is the *application* — the deployable artifact. It mounts the shell, provides the worker client, points to a particular set of built-in panels.
- `packages/shell` is the *substrate* — the reusable bundle host. In principle it could host a different application some day (a different renderer, a different default panel set). In practice it never will, but the conceptual separation is what makes "the shell is its own first plugin" honest.

A second app at some point — `apps/paged` proper, with a different default panel set — would consume the same `@paged-media/shell` and `@paged-media/ui` packages.

## Migration Path from CanvasApp.tsx

The cleanest sequence for the actual code transformation:

### Step 3-pre: Migrate `protocol.ts` to tsify-generated types

Do this first, before any shell work. It's a self-contained refactor on the renderer + protocol layer that touches no React code.

1. Add `tsify`, `serde`, and `serde-wasm-bindgen` to the renderer crate's `Cargo.toml` (with the `js` feature on tsify).
2. Add `#[derive(Tsify, Serialize, Deserialize)]` plus `#[tsify(into_wasm_abi, from_wasm_abi)]` plus `#[serde(rename_all = "camelCase")]` to each Rust type that has a counterpart in the existing `protocol.ts`.
3. Build the renderer crate. Verify the generated `.d.ts` contains TypeScript types matching the hand-written ones structurally.
4. In `apps/canvas/src/channel/protocol.ts`, replace each hand-written interface with a re-export of the corresponding generated type.
5. Compile-check the whole app. Resolve any drift the migration surfaces (likely some field-rename mismatches where the hand-written types accidentally diverged from Rust — this is the bug class the migration is designed to eliminate).
6. Verify Playwright tests still pass.

Step 3-pre completes when `protocol.ts` is a thin re-export layer plus the `CanvasClient` class, and every shared type's source of truth is in the Rust renderer.

### Step 3a: Set up the workspace skeleton

Create `packages/shell` and `packages/ui` with their respective `package.json`, `tsconfig.json`, Tailwind config. Workspace tooling: pnpm workspaces, Turborepo or Nx if you want orchestrated builds (optional at this scale).

Update `apps/canvas/package.json` to depend on `@paged-media/shell` and `@paged-media/ui` as workspace packages.

### Step 3b: Lift state into contexts, no dockview yet

Inside `packages/shell/src/state/`, write the five context providers and their hooks. Inside `packages/shell/src/state/document-loader.ts`, lift the file-loading orchestration out of `CanvasApp` (the `onFile`, snapshot loop, font fetch, status updates).

Modify `apps/canvas/src/ui/CanvasApp.tsx` to wrap its existing JSX in the new providers, sourcing state from them. The component still uses flexbox; nothing visible has changed. This is the lowest-risk intermediate state.

Verify Playwright tests still pass against `window.__canvas`.

### Step 3c: Set up shadcn and the theme

Run `shadcn init` inside `packages/shell`. Add the initial component set. Create `theme.css` with the variable mappings. Apply the theme class at the shell root.

The flexbox layout in `CanvasApp` is unchanged but now uses Tailwind classes and reads colors from CSS variables. This is mostly mechanical and gives an early read on whether the visual direction works.

### Step 3d: Build the registries

`PanelRegistry`, `CommandRegistry`, `SemanticGroupRegistry`. Pure data layer, no rendering. Register the three built-in panels (canvas, pages, outline) and the one initial command (file open) as data.

### Step 3e: Build the DockingSubstrate

`DockingSubstrate` interface, `DockviewSubstrate` implementation. The substrate is *exercised* in tests at this stage but not yet mounted in `CanvasApp`.

### Step 3f: Build the PanelBridge and DockviewRoot

`PanelBridge` connects registry to substrate. `DockviewRoot` is the React component that mounts `DockviewReact`, instantiates the substrate, instantiates the bridge, restores persisted layout.

### Step 3g: The swap

Replace the flexbox layout in `CanvasApp` with `<DockviewRoot />`. `CanvasApp` is now ~50 lines: providers + header + dockview root. The three panels — canvas, pages, outline — appear via the registry-bridge-substrate path. Verify Playwright tests still pass.

### Step 3h: Command palette and persistence

Build `CommandPalette` and wire `Cmd+K`. Add layout auto-persistence. Add the file-open command. Verify the file picker works from both the header and the palette.

### Step 3i: Delete CanvasApp.tsx

Move `CanvasApp.tsx`'s remaining content into `packages/shell/src/index.tsx` as `<PagedShell />`. The `apps/canvas/src/main.tsx` now mounts `<PagedShell client={canvasClient}>...</PagedShell>` directly. `apps/canvas/src/ui/CanvasApp.tsx` is deleted.

## What Not to Do

- **Don't keep hand-written TypeScript interfaces for types that have a Rust counterpart.** Every shared type goes through tsify; the generated `.d.ts` is the source. Hand-writing "just this one" is how the drift class of bug re-establishes itself.
- **Don't use tsify's default `json` serialization backend.** Use the `js` feature. The JSON round-trip is wasteful for the geometry-heavy payloads this renderer emits.
- **Don't tsify the camera-update path or future gesture-pipeline frame updates.** High-frequency continuous updates stay on SAB or raw numeric wasm-bindgen arguments. tsify is for discrete structured messages.
- **Don't edit the tsify-generated `.d.ts` by hand.** If a type comes out wrong, fix the Rust side or use tsify's `#[tsify(type = "...")]` attribute to override.
- **Don't commit the generated `.d.ts` to source control without a clear convention.** Either gitignore it (build artifact, regenerated on every build) or vendor it intentionally (review-visible, drift-detectable in PRs). Don't do both. The default recommendation is to vendor: regeneration is non-trivial, drift is review-relevant, and the file is small.
- **Don't merge shadcn primitives and `@paged-media/ui` composites into one package.** The boundary is what protects bundle code from substrate churn. Even though `@paged-media/ui` will start out as a thin re-export layer, the indirection matters once composites accumulate.
- **Don't import from `dockview-react` outside `dockview-substrate.ts`.** Same discipline as the briefing's general rule. The CI lint rule that enforces this should be in place from day one.
- **Don't import from `@/components/ui/*` outside `packages/shell`.** Bundle code (eventually third-party) goes through `@paged-media/ui`.
- **Don't combine the five state contexts into one mega-context.** Re-render isolation matters; selection changes shouldn't cause the camera context to re-render every consumer.
- **Don't hardcode dockview group IDs anywhere.** All placement is by semantic group name.
- **Don't ship saved perspectives or per-document UI configuration in Step 3.** Auto-persistence of the current layout is enough.
- **Don't build the full KeybindingRegistry in Step 3.** Existing `useKeyboardShortcuts` is left in place; the registry comes with the bundle loader in Step 4.
- **Don't theme dockview by editing its source or maintaining a fork.** Use only CSS variables. If a dockview style proves uncustomizable via CSS, file an upstream issue rather than working around it.
- **Don't add a menu bar in Step 3.** The command palette covers Step 3's needs. Menus, contributed via the registry pattern, come in Step 4.
- **Don't optimize the document-loading path.** The existing sequential snapshot loop is correct given the single-threaded worker; lift it as-is.
- **Don't rename `window.__canvas` to `window.__paged` in Step 3.** Tests depend on the name. Renaming is free later if the name turns out to matter; renaming now while the surface is in flux is unnecessary churn.

## Time Budget

For solo or near-solo work:

- Step 3-pre (tsify migration of `protocol.ts`): 2–3 days.
- Step 3a (workspace skeleton, shadcn init, theme stub): 2 days.
- Step 3b (state contexts, document loader lift): 3 days.
- Step 3c (shadcn integration, theme bridge, Tailwind migration of existing JSX): 2 days.
- Step 3d (four registries as data layer): 2 days.
- Step 3e (DockingSubstrate + DockviewSubstrate): 3 days.
- Step 3f (PanelBridge, DockviewRoot, panel components wrapped): 3 days.
- Step 3g (the swap): 1 day, plus 1–2 days of stabilization and Playwright fixes.
- Step 3h (command palette, persistence, file-open command): 2 days.
- Step 3i (final cleanup, CanvasApp deletion): 1 day.

Total: roughly three and a half weeks of focused work. The tsify migration adds 2–3 days up front but is a one-time investment; subsequent additions to the WASM boundary are free (annotate the Rust type, rebuild).

## Acceptance Criteria

Step 3 is complete when all of the following hold:

1. `apps/canvas/src/ui/CanvasApp.tsx` no longer exists.
2. The application starts and shows the IDML canvas in the center of a dockview layout.
3. The Pages and Outline panels appear in the left dock group, as tabs, by default.
4. The user can drag panels to different positions, float them, pop them out into separate browser windows, and the new layout persists across reloads.
5. The canvas panel cannot be closed, cannot be moved, and has no tab header.
6. `Cmd+K` opens the command palette. The "Open IDML…" command is listed and works.
7. The header file picker still works.
8. Playwright tests against `window.__canvas` continue to pass.
9. Pan/zoom, text selection, text editing, undo/redo continue to work identically to the pre-decomposition behavior.
10. The codebase contains exactly one file that imports from `dockview-react`: `packages/shell/src/docking/dockview-substrate.ts`.
11. The codebase contains zero files outside `packages/shell` that import from `packages/shell/components/ui/*`.
12. A lint rule (custom ESLint, or import boundaries enforced by `eslint-plugin-import-x` or similar) enforces both isolation rules above.
13. Toggling a `.dark` class on the document root flips both shadcn and dockview into dark mode coherently.
14. `apps/canvas/src/channel/protocol.ts` contains no hand-written interface declarations for types that exist in the renderer crate. Every shared type is imported from the tsify-generated `.d.ts`.
15. Renaming a field on a Rust type that has `#[derive(Tsify)]` produces a TypeScript compile error on the consumer side after rebuild. (Verify with a deliberate temporary rename.)
16. The renderer crate builds with the `js` feature on tsify (not the `json` default).

## Decision Triggers

Four checkpoints to revisit this spec:

1. **After Step 3-pre (the tsify migration), before any shell work.** Pause and review the generated TypeScript types against the previous hand-written ones. If significant structural differences exist that aren't bug-fixes, the Rust types may need refactoring before they're a comfortable source of truth. Better to do that refactor here than after the shell depends on them.
2. **After Step 3g (the swap), before Step 3h.** Pause and review whether the registry → bridge → substrate chain feels right in practice. If it feels overengineered for three built-in panels, the answer is "no, this is the floor; it pays off at panel #6, not panel #3." If it feels under-engineered (you keep wanting to add fields to `PanelContribution`), that's the time to add them.
3. **When the first third-party-style bundle is being prototyped in Step 4.** This is the moment to assess whether the Contribution API surface is right. The shell's own panel registration is the rehearsal; the first external bundle is the real test.
4. **When the gesture pipeline lands in Step 5 and the scrub-aware inputs are added to `@paged-media/ui`.** Reassess whether `@paged-media/ui` has the right granularity. The DTP composites are the components that will most stress the design system; they're the right moment to revise its shape. Also revisit the tsify/SAB split here — Step 5 introduces a lot of high-frequency wire traffic, and the "raw numeric args for gestures" rule will be exercised for the first time.

## Summary in One Paragraph

The Step 3 shell decomposes the existing 513-line `CanvasApp.tsx` into a declarative, configurable substrate: the WASM ↔ TypeScript type contract is unified via tsify, with Rust types in the renderer crate as the single source of truth for everything crossing the boundary and `apps/canvas/src/channel/protocol.ts` shrunk to a re-export layer plus the `CanvasClient` dispatch class; four registries (panels, commands, semantic groups, keybindings) hold contribution data; five React contexts (client, document, camera, selection, content-selection) hold application state; a `DockingSubstrate` abstraction wraps dockview such that exactly one file in the codebase imports `dockview-react`; a `PanelBridge` projects registry contributions onto the substrate; the canvas, pages panel, and outline panel are registered as data, not hardcoded; shadcn/ui provides the chrome and a curated subset is re-exposed as `@paged-media/ui` for bundles, with a parallel substrate-isolation discipline; a single set of CSS variables themes both shadcn and dockview through a custom `dockview-theme-paged` class; the command palette built on shadcn's `Command` primitive opens with `Cmd+K` and dispatches against the command registry; layout state auto-persists to `localStorage` with a defensive fallback to the default layout if the snapshot fails to restore. The tsify migration uses the `js` serialization backend for efficient marshaling of geometry-heavy payloads, while the camera-update SAB path and the future Step 5 gesture pipeline stay on raw numeric arguments because high-frequency continuous updates have different needs than discrete structured messages. By the end of Step 3, adding a panel means registering a manifest entry; rearranging the layout means dragging; replacing the docking substrate or the design system is a contained refactor; renaming a field on a Rust type produces a TypeScript compile error rather than a runtime bug; and the bundle loader in Step 4 has a clean place to plug into because the registration path it will use is the same path the shell uses to register its own built-in panels.
