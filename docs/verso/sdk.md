# Verso SDK — Technical Concept & First-Steps Plan

**Project:** Verso SDK (the configurable-frontend layer of the IDML editor)
**Document status:** Draft v1.1
**Owner:** Dietz Rietsch
**Repository:** `github.com/drietsch/idml`
**Companion specs:** `editor-architecture.md`, `canvas.md`, `scripting-layer.md`, `canvas-interaction-plan.md`, `canvas-interaction-plan-2.md`
**Audience:** Engineering, architecture

*Revision history: v1.0 covered the SDK boundary, the `@verso/client` / `@verso/react` split, the contribution model, the convergence requirement, and the first-steps plan. v1.1 adds the declarative component layer (the catalog + binding model with the composition-vs-leaf distinction), reframes agentic UI generation (A2UI and others) as adapters over an internal declarative layer rather than an integration, rewrites Step 3 around a three-panel slice that proves the binding model, the declarative/imperative boundary, and the expert-leaf contract, and adds the invariants that keep the expert-component escape hatch from becoming a parallel mutation path.*

---

## 1. Purpose and thesis

The Verso SDK is the framework-agnostic public surface through which *every* piece of the editor's user interface is built. The goal is a frontend that is configurable end to end — menus, panels, the dockview arrangement, tools, commands, the whole UX — because all of it is expressed as contributions against one SDK rather than hard-wired into application code.

The thesis of this document is deliberately narrow and load-bearing:

> The SDK is not a new system. It is the public boundary drawn around systems the Verso doc set already designed — the four registries, the state contexts, the docking substrate, the `CanvasClient` bridge, the Operation/Gesture channels, and the QuickJS scripting surface. Building the SDK is a *contract-extraction and convergence* exercise, not a greenfield build. The one genuinely new requirement is that the UI and the script engine must consume **the same surface through the same door**, with no privileged path for first-party code.

Everything below follows from that. If at any point the work starts inventing new mechanism rather than drawing a boundary around existing mechanism, that is the signal to stop and re-check against this thesis.

### 1.1 What "100% configurable" means here

It means three concrete things, and explicitly does *not* mean a fourth:

- Every panel, menu item, command, and tool is **declared as data** (a contribution) and mounted by the SDK, not instantiated directly by app code.
- The arrangement — which panels are docked where, what the menus contain, which tools exist — is **swappable without touching the renderer or the core client**.
- First-party UI is built **as if it were a third-party bundle**: it goes through the same registration path a future external bundle would use, with no shortcut.
- It does **not** yet mean third-party or marketplace bundles ship now. Third-party is a future goal (Section 10). The SDK is built *structurally* for it but *committed* only to first-party use, which means **zero API-stability guarantees** during the period this document covers.

### 1.2 Why now, and why the scripting layer makes this the right moment

A live QuickJS scripting layer already exists. That is the single most important fact shaping this design, because it provides an *independent second consumer* of the document surface. The scripting briefing's central claim is that scripting, the inspector, undo/redo, the editor, and collaboration are all the same `Operation`-based pipe through one `apply` door. A configurable UI is simply one more consumer of that same pipe.

This gives the SDK a built-in correctness test that does not depend on opinion:

> **Could a script do everything a panel does?**

If a Pages panel can reorder pages but a script cannot express the same reorder as Operations, the panel reached past the SDK through a side channel and the boundary is fiction. Held rigorously, this test makes the fundamentals correct *by construction* rather than by inspection.

---

## 2. Current state and the real starting condition

The capabilities the SDK needs largely **already exist**, but not in the SDK's intended shape. Specifically:

- A **read surface** exists — scripts can read the document tree, selection, and geometry.
- A **selection-property query** exists — the editor can ask for the resolved properties of the current selection (the `caretGeometry` / `selectionGeometry` pattern is the text-side precedent; element-selection property reads exist too).
- A few **UI components** exist built the traditional way — a main menu, some panels — instantiated directly rather than through a contribution registry.
- The **tsify WASM↔TypeScript contract is partially in place** — some shared types are generated from Rust, some are still hand-written in `protocol.ts`.

The starting condition is therefore **refactoring existing capability behind a boundary**, not building new capability. This is lower-risk than greenfield and carries a free correctness check: a correct migration should not change observable behavior. If moving a read or query onto the SDK changes what a panel displays, more than the boundary moved.

It also carries a specific trap, named here so it can be watched for throughout (Invariant 4, Section 9): **wrapping is not converging.** Re-exporting an existing client method through `@verso/client` does not put a capability "on the SDK" if scripts still reach it by a different path. The job is to collapse the script path and the UI path into one surface, not to give the UI a parallel door that happens to live in an SDK package.

---

## 3. Architectural position

The SDK sits between the renderer/scripting layer below and the contributed UI above. It is the middle of the four-layer architecture (renderer → scripting → shell → bundles), promoted from "shell internals" to a first-class, documented, framework-aware-but-not-framework-bound package set.

```
┌───────────────────────────────────────────────────────────┐
│  Producers:  hand-authored · declarative compositions ·    │
│              agentic (A2UI & others, via one adapter)      │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  emit / reference catalog entries
                          ▼
┌───────────────────────────────────────────────────────────┐
│  Catalog  (finite, curated)                                │
│  entries = compositions (declarative) | leaves (primitive  │
│  @verso/ui widgets | expert code) — all with declared      │
│  binding points; all mutate only through the one door      │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│  Contributed UI (first-party now; bundles later)           │
│  Panels · menus · commands · tools — all declared as data  │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  Contribution API  (register a manifest)
                          ▼
┌───────────────────────────────────────────────────────────┐
│  @verso/react   — React adapter                            │
│  Hooks · registries · dockview substrate · theming bridge  │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  depends on (one direction only)
                          ▼
┌───────────────────────────────────────────────────────────┐
│  @verso/client  — framework-agnostic core (NO React)       │
│  CanvasClient · Operation channel · Gesture API · queries  │
│  ── the SAME surface the QuickJS script engine consumes ── │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │  CanvasClient bridge — tsify'd contract
                          ▼
┌───────────────────────────────────────────────────────────┐
│  Rust renderer + worker (existing)                         │
│  Scene graph · four-tier pipeline · idml-mutate · gesture  │
└───────────────────────────────────────────────────────────┘
```

The single most consequential structural rule is the **package split between `@verso/client` and `@verso/react`**, addressed next.

---

## 4. The two-SDK split (the load-bearing decision)

"The SDK touches React and talks to Rust" hides two SDKs with different stability and dependency requirements. Conflating them quietly breaks the scripting briefing's one-door thesis. They must be separate packages with a one-directional dependency.

### 4.1 `@verso/client` — the framework-agnostic core

Contains everything that crosses the boundary to Rust or expresses document/canvas capability:

- The `CanvasClient` dispatch class (worker bridge, request/reply correlation).
- The **Operation channel**: construct and apply `Operation` / `Batch`; receive `AppliedOperation` (inverse + invalidation); subscribe to `mutationApplied` / `undoApplied` / `redoApplied`.
- The **Gesture API**: `begin` / `update` / `commit` / `cancel`, plus the gesture types from the interaction plans.
- **Read queries**: document tree, page/story metadata, structural resolution.
- **Selection + geometry queries**: visual selection, content selection, caret geometry, selection rects, and resolved-property reads for the current selection.
- **Application-state primitives** that are not view glue: the selection set, the active tool, the camera (via the SAB contract). These are state the canvas, the gesture spine, *and* the script engine all read.

**This package has no React dependency, on purpose.** It is the exact surface the QuickJS script engine consumes. Binding it to React would fork the document surface into "the script one" and "the React one," which is precisely the divergence this design exists to prevent. Keeping it framework-free is what lets one mutation surface serve the inspector, scripts, the UI, and eventually collaboration without parallel APIs.

### 4.2 `@verso/react` — the React adapter

Depends on `@verso/client`, never the reverse. Contains:

- The **hooks**: `useCanvasClient`, `useDocument`, `useCamera`, `useSelection`, `useContentSelection`, and the composite `useVerso`. These are thin adapters that subscribe to the core client and expose its state to the React tree with correct re-render isolation.
- The **four registries** as a React-mountable data layer: `PanelRegistry`, `CommandRegistry`, `SemanticGroupRegistry`, `KeybindingRegistry`.
- The **state contexts** (five focused providers, not one mega-context — re-render isolation matters: a selection change must not re-render every camera consumer).
- The **`DockingSubstrate`** wrapping dockview such that exactly one file in the entire codebase imports `dockview-react`.
- The **theming bridge** (one CSS-variable set themes both shadcn and dockview) and the `@verso/ui` design-system boundary (no contributed UI imports shadcn primitives directly).

### 4.3 The dependency rule, stated once

`@verso/react` → depends on → `@verso/client` → depends on → the tsify'd Rust contract. Never upward. A lint rule should enforce that `@verso/client` has no React import from day one; it is cheap now and a painful retrofit later.

---

## 5. The contribution model

A panel, command, menu item, or tool is **data**, registered against a registry. The registries are passive stores; bridges project their contents onto the imperative substrates (dockview for panels, the menu chrome for commands/menus, the tool layer for tools). The shapes are carried forward from `editor-architecture.md` essentially unchanged — they are already the SDK's specification:

- **`PanelContribution`** — `id`, `title`, `component`, `defaultDock`, `defaultGroup` (semantic group name), `icon`, `when` (visibility predicate), `closable`, `movable`. The component receives a `verso` handle (the editor surface) and a `PanelApi` (lifecycle). It reads everything it needs from the handle; it is a thin renderer.
- **`CommandContribution`** — `id`, `title`, `category`, `icon`, `handler(verso, payload)`, `when` (enablement predicate). Every menu item and keybinding resolves to a command. Commands are the canonical action primitive.
- **`SemanticGroupRegistry`** — maps semantic placement names (`"structure"`, `"properties"`) to concrete dockview group IDs at runtime, so contributions never hardcode group IDs and survive the user dissolving a group.
- **`KeybindingContribution`** — `key`, `command`, `when`. Minimal now; the full registry can wait.

### 5.1 The one principled exception: the canvas panel

Everything in the registries is free-floating, declarative, and swappable — **except the WebGPU canvas**, which is bound to an `OffscreenCanvas`, a worker, and the camera SAB. It registers like any other panel but is non-closable, non-movable, and has no tab header. As *everything* becomes configurable the temptation is to make the canvas "just another panel" for symmetry. It must remain the single special case. A configurable shell that can accidentally unmount its own renderer is a regression, not a feature.

### 5.2 First-party as the rehearsal

First-party UI registers through the same path a bundle eventually will. There is no first-party shortcut. This is the rehearsal the editor-architecture spec describes — the shell's own panel registration is the dress rehearsal; the first external bundle is the real performance. Building it this way now costs only discipline and means the future third-party step is an *unlock*, not a rewrite.

---

## 6. The declarative component layer (catalog + bindings)

The contribution model in Section 5 makes *registration* declarative — a panel is data: id, title, placement, predicates. But its `component` field is an opaque React `ComponentType`; the registry declares *that* a panel exists and *where* it goes, while the panel's *interior* is imperative React code. The declarative component layer extends declarativeness to the second axis: a description of a panel's **interior** — its widgets, layout, and data bindings — as data, so the component becomes a tree of catalog references with bindings, rendered by the SDK, rather than a hand-written function.

This is a genuine, larger addition than registration-as-data, and it is worth building for two reasons that are already true of Verso rather than speculative:

- **The selection-property tier is a binding problem by nature.** Character, Paragraph, Stroke, Swatches, Effects, Object are sets of fields, each bound to a resolved property of the current selection, each writing back a `SetProperty`. A binding primitive for this tier is owed by Step 3 regardless (it is the same thing as open question §11.1, snapshot-vs-live selection-property reads). The only choice is whether to make it *special* (a property-panel helper) or *general* (a component/binding model). Compatibility with external declarative-UI producers (Section 10.1) is what tips it to general.
- **The one-door invariant makes bindings sound.** A declarative binding that writes `leading = 14` is safe only because "write `leading`" means "construct a `SetProperty` Operation and call `apply`." That door already exists, so a binding is just a declarative spelling of an Operation. The hard part — a single mutation surface — is done.

So the declarative layer is not new risk piled on; it is the convergence of the binding primitive the property tier already needs with the Operation door already built.

### 6.1 The catalog is the bright line

The catalog is an explicit registry mapping stable string IDs → renderable components, each with declared props and binding points. It is simultaneously: what declarative panels reference, what an external agentic producer is allowed to emit (Section 10.1), and what a future third-party bundle is constrained to. **One object, multiple consumers** — the same collapse the contribution registry uses for first-party-now / bundles-later. The catalog is the single auditable definition of "what UI is allowed to exist," which is exactly the trust boundary the deferred third-party work (Section 10) needs.

The catalog is **finite and curated, not extensible by the document**. The moment a declarative panel can define *new* component types inline, you have reinvented code execution and lost the security property. Custom components are added to the catalog deliberately, in code, reviewed — never emitted by an agent or a document.

### 6.2 Two kinds of catalog entry: compositions and leaves

Every catalog entry is one of two kinds, and the distinction is **purely how the leaf is implemented** — never how it is registered, referenced, bound, or how it touches the document:

- **Compositions** — declarative. A tree of references to other catalog entries, with bindings. This is what the property/structural panels are made of, and what an external producer emits. No code; pure data.
- **Leaves** — either a primitive `@verso/ui` widget (label, number field, color swatch, scrubbable input) or an **expert component**: hand-written React with custom geometry, canvas interaction, or a bespoke visualization the catalog vocabulary cannot express.

The critical property: an **expert component is a catalog leaf**, not an escape from the catalog. It declares its binding points — *what it reads, what Operations it writes* — exactly as a composition does. It renders its interior however it likes (custom canvas, WebGL, whatever), but its *relationship to the document* is still declared and still goes through `apply`. The expert component gets imperative **rendering**; it does not get imperative **mutation**. That asymmetry is the whole point: the author of a leaf writes code, the author of a composition writes data, but the *system* treats both as a catalog reference with declared props and bindings, and a producer (declarative layer or agent) can compose with either without knowing which kind it is.

### 6.3 The boundary: which kind is a given panel?

This must not be a per-panel taste decision, or "expert" drifts to become the default "to be safe." The boundary is objective and is the binding-shaped-vs-imperative-shaped line:

- **Binding-shaped → composition (declarative).** Fields bound to selection properties writing Operations: Character, Paragraph, Stroke, Swatches, Effects, Object/Transform, and the property bits of structural panels. These have no reason to be code; making them code reproduces the failure of a hundred near-identical hand-written property panels that should have been one binding model.
- **Imperative-shaped → expert leaf.** Custom geometry, canvas interaction, a gesture relationship, or a bespoke visualization the catalog cannot describe: the Tools panel, path-edit-mode chrome, a glyph/kerning visual editor, a 2D-gamut color picker.

The test when unsure: *can this panel's interior be expressed as catalog components bound to the selection-property surface?* If yes, it is a composition and making it expert is over-engineering. If no, it is an expert leaf. And crucially — **a panel that fails the declarative test is first a finding about the catalog, not a license to go imperative.** Maybe three panels want a `scrubbable-numeric` or `color-swatch-grid` the catalog lacks; add it to the catalog once, reviewed, before declaring any panel expert. Only genuinely bespoke interiors become expert leaves. This keeps the imperative set *small* — the same discipline as the canvas being *the one* special panel (Section 5.1). Expert components should be the *few* genuinely-bespoke panels, not the default.

### 6.4 The internal model is yours; external formats are adapters

The catalog + composition + binding model is **Verso's own**, designed against Verso's panels. It is *not* any external producer's format. Compatibility with A2UI and others is achieved by an **adapter** that translates external descriptions in and Verso compositions out (and back) — and that adapter is the *only* place in the codebase that knows the external format exists, exactly as `dockview-substrate.ts` is the only file that knows dockview exists. This is what keeps "and others" cheap: A2UI, AG-UI, a future format, or hand-authored JSON are all adapters over one internal tree. Adopting any external format *as* the internal model would turn every other producer into a translation-through-that-format tax forever.

---

## 7. The convergence requirement (the actual hard part)

The SDK's correctness does not come from "the UI calls a client method." It comes from the UI and the script engine calling **the same** method with **no privileged path** for either. With QuickJS already live, this is testable today rather than aspirational.

The panels are not homogeneous; they exercise different parts of the surface, and they reveal divergence in different places:

| Tier | Example panels | What it demands of the SDK | Re-render trigger |
|---|---|---|---|
| **Read-mostly structural** | Pages, Layers, Links, Articles | Query the tree; subscribe to structure mutations; apply node Operations; **drive selection + camera** (application state the canvas also consumes) | Structure mutation |
| **Selection-driven property** | Character, Paragraph, Stroke, Color/Swatches, Effects, Object/Transform | Read the **current selection's resolved properties**; render editors; write `SetProperty` | Selection change *and* mutation |
| **Tool / gesture** | Tools panel, tool switchers | Touch the **tool registry** and the **Gesture API**, not Operations directly | Active-tool change |

The structural tier's interesting demand is that it *pushes* application state (selection, camera) that the canvas and gesture spine consume — it makes the document-vs-application-state line concrete. The property tier's shared hard problem is "what is selected and what are its resolved properties right now," which all six panels in that row need; designing the contribution API against only a structural panel would miss that this tier needs a **selection-property-binding** primitive (or it gets reinvented six times).

This is why the first slice (Step 3, Section 8) must span both binding-shaped tiers *and* one expert leaf — a declarative property composition, a structural panel, and an imperative leaf — rather than a breadth-first sweep of all panels. The selection-property-binding primitive this tier needs is the same binding model the declarative layer (Section 6) is built on; the property panel is where both are proven at once.

---

## 8. First-steps plan

The plan is sequenced to *probe the most-likely-broken thing first*, validate the boundary against genuinely different consumers, and only then generalize. It deliberately resists the breadth-first instinct.

### Step 0 — Finish the tsify contract for everything the SDK exposes (prerequisite)

The SDK's Rust-facing half is only as stable as the generated contract beneath it. Anything `@verso/client` exposes across the boundary — `DocumentHandle`, selection types, caret/selection geometry, the resolved-property read shape, the `Operation` and `Gesture` payloads, the `WorkerToMain` / `MainToWorker` unions — must be **generated from Rust via tsify**, not hand-written. Internal-only TypeScript types may lag. This goes first because it is cheap to state and annoying to retrofit, and because freezing an SDK surface on a half-generated contract reintroduces exactly the drift class the tsify migration exists to kill.

*Done when:* renaming a field on a Rust type that the SDK exposes produces a TypeScript compile error on the consumer side after rebuild. Use the `js` serialization backend (not the `json` default) for the geometry-heavy payloads. Keep the high-frequency camera path on the SAB / raw numeric arguments — it does **not** go through tsify.

### Step 1 — Stand up the package skeleton and the dependency boundary

Create `@verso/client` (no React) and `@verso/react` (depends on client). Move the existing `CanvasClient` and the boundary types into `@verso/client` as-is. Add the lint rule forbidding React imports in `@verso/client` and forbidding `dockview-react` imports outside the one substrate file. No behavior change; this is pure relocation plus a guardrail.

*Done when:* the existing app still runs, unchanged, but now imports its client from `@verso/client`; CI fails if a React import lands in the core.

### Step 2 — Probe the convergence on the selection-property query (the diagnostic)

Before building any panel, run the diagnostic the live script engine makes possible. Compare, directly:

- How a **script** asks "what are the resolved properties of the current selection?"
- How the **existing** Character/Swatches UI asks the same thing.

Two outcomes, both informative:

- **Same call** → the fundamental is already right here; the SDK work for this tier is packaging. Be suspicious it was this easy and move on to verify the structural tier.
- **Different call** (different entry point, different return shape, one through the inspector/Operation channel and one reaching into worker state) → **that gap is the SDK's first real specification.** Collapse the two into one script-facing surface in `@verso/client`. The property panel rebuilt on that surface is the fix.

Probe the property/mutation surface *before* the read surface, because reads are simpler and more likely to already coincide — a clean result on the easy surface would falsely suggest the fundamentals are fine while divergence hides one tier over. Probe the place most likely to be broken first.

*Done when:* there is exactly one documented way, in `@verso/client`, to read the current selection's resolved properties, and the script engine uses it.

### Step 3 — Build the vertical slice: a declarative property panel, a structural panel, and one expert leaf

This is the slice that proves three things at once: the binding model, the declarative/imperative boundary, and the expert-leaf contract. Build all three end to end through the full path: `@verso/client` → catalog/registry → `@verso/react` adapter/hooks → dockview substrate → rendered panel.

1. **A property panel as a declarative composition** — Character or Swatches, built as a *catalog composition* (a tree of catalog references bound to the selection-property surface), **not** as hand-written React. This is what validates the catalog + binding model. It forces the selection-property read shape (open question §11.1), the `SetProperty` write-through-binding path, and re-render on both selection change and mutation.

2. **A structural panel** — Pages (tree query + node Operations + drives camera/selection). Build it as a composition *if it fits*; hand-author it as an expert leaf *if it resists*. **That divergence is data**: where Pages does or doesn't fit the composition model is the empirical location of the binding/imperative boundary (Section 6.3), discovered from a real panel rather than designed in the abstract.

3. **One expert leaf** — the cheapest genuinely-bespoke panel available (a small gesture- or canvas-adjacent one). This proves the expert-leaf contract: it registers like any catalog entry, **declares its binding points**, renders opaque code, and writes through the Operation door — never a parallel path. Proving this now, on the easiest expert panel, is what keeps the later hard expert panels (Tools, path-edit chrome) honest.

Three panels, three proofs: the binding model (1), the boundary (2), the expert-leaf contract (3). When a declarative composition, a possibly-divergent structural panel, and an imperative leaf all sit on the same catalog and the same one door, the fundamentals are validated by use rather than by argument.

Hold the line during this step: if `@verso/client` cannot yet express, say, a swatch edit as an Operation, that is a **finding about the client surface (or the Rust Operation set)**, not a license to special-case the panel. If a panel wants a widget the catalog lacks, that is a **finding about the catalog** — add the widget once, reviewed, before reaching for an expert leaf. The panel's friction *is* the spec being written. (Color/swatch editing in particular may surface gaps in the Operation layer — treat them as Operation-layer work, the same way Track M still owes the *write* side of layer visibility/lock.)

*Done when:* a script and each panel perform their reads and writes through the same `@verso/client` surface; the property panel is a declarative composition over the catalog; the expert leaf declares its bindings and mutates only through `apply`; Pages drives a camera jump and selection through application-state primitives the canvas also consumes; all panels re-render correctly on their respective triggers; behavior matches the pre-migration UI exactly.

### Step 4 — Migrate the main menu and commands onto the registries

Lift the existing main menu into `CommandContribution`s and a menu projection. The header file-picker becomes a command invoked from both the header and (optionally) a command palette. This exercises the command/keybinding path that the property and structural panels did not, and retires a chunk of the traditionally-built UI.

*Done when:* every existing menu action is a registered command with no privileged invocation path; first-party menu items are indistinguishable, mechanically, from how a bundle would contribute one.

### Step 5 — Generalize across the remaining panels

With the binding model, the boundary, and the expert-leaf contract proven, the rest of the InDesign-style panels become *variations* on a proven path: Paragraph, Stroke, Effects, Object/Transform are declarative compositions following the property panel; Layers, Links, Articles follow the structural panel; the genuinely-bespoke ones (Tools, path-edit chrome) are expert leaves following the Step 3 leaf. The tool tier is stubbed against the tool-registry foundation and wired when the gesture-driven work needs it.

*Done when:* no panel is instantiated outside the catalog/registry; the dockview arrangement is fully data-driven; removing or rearranging panels requires no renderer or core-client change; binding-shaped panels are compositions and only genuinely-bespoke ones are expert leaves.

### Step 6 — The agentic / external-producer adapter (gated)

Only once the catalog and binding model are proven by real panels (Steps 3–5): write the adapter that translates an external declarative-UI format (A2UI first, others later) into Verso compositions and back. The adapter is the single file that knows the external format exists (Section 6.4, Section 10.1). It maps external component references → Verso catalog IDs and external bindings → the Verso binding model, and rejects anything referencing a component not in the catalog. This step is *gated* because the catalog cannot be designed A2UI-shaped before the panels reveal what the catalog actually needs — designing the internal model around an external format is backwards.

*Done when:* an external A2UI description can be rendered as a Verso panel composed entirely of catalog entries (compositions and/or expert leaves), writing only through the Operation door; external-format churn is contained to the adapter; nothing in `@verso/client` or the panel components knows A2UI exists.

### Sequencing rationale, in one line

Finish the contract (0) → draw the boundary (1) → find the divergence before building on it (2) → prove the binding model, the boundary, and the expert-leaf contract against three real panels (3) → retire the menu (4) → generalize cheaply (5) → only then admit an external producer (6). Breadth-first across all panels is explicitly avoided: it would design the catalog and contribution API against the easy panels and discover the hard requirements halfway through.

---

## 9. Invariants to hold throughout

These are the rules that keep "panels on the SDK" a clean foundation rather than a leaky one. Each is cheap to keep and expensive to retrofit.

1. **One door.** All mutation goes through `apply` (Operations). No panel, and no first-party code, gets a privileged mutation or read path the script engine lacks.
2. **Core stays React-free.** `@verso/client` never imports React. Enforced by lint from day one.
3. **The canvas is the one special case.** It is the only non-configurable panel. Everything else is data.
4. **Wrapping is not converging.** Re-exporting an existing method is not "on the SDK" unless the script path uses the same surface. Convergence is the deliverable.
5. **Five contexts, not one.** Re-render isolation is a correctness property; selection changes must not re-render camera consumers.
6. **One dockview seam.** Exactly one file imports `dockview-react`. Swapping the docking library is then a contained change.
7. **No stability commitment yet.** First-party-only means the API can and should evolve freely. Add fields, rename, break things — this is the cheap window (Section 10).
8. **Panel friction is specification.** When a panel cannot do something through the SDK, fix the SDK (or the Rust Operation set), not the panel.
9. **Expert components are catalog leaves with declared bindings that write through the Operation door — never a parallel path.** An expert component gets imperative *rendering*, not imperative *mutation*. This is the single rule that keeps the escape hatch from becoming the hole everything leaks through.
10. **The catalog is finite and curated.** New component types are added in code, reviewed. Neither a document nor an agent may define a new component type inline — that is code execution by another name and forfeits the security and portability properties.
11. **The internal declarative model is Verso's own.** External formats (A2UI and others) live behind a single adapter, the way dockview lives behind a single substrate. No external format is the internal representation.
12. **A panel that fails the declarative test is first a catalog finding.** Add the missing widget to the catalog (once, reviewed) before declaring a panel an expert leaf. Expert leaves are the few genuinely-bespoke panels, not the default.

---

## 10. Stability posture and the third-party future

Because third-party is a future goal, the SDK carries **zero API-stability guarantees** during the period this document covers. This is an asset, not a gap. The earlier instinct to keep the contribution API minimal and resist new fields *inverts* while there are no external consumers: add fields freely, rename aggressively, throw breaking changes at it. Refactoring is cheap now and will not be once anything external depends on the surface. Spend that runway deliberately before the wall.

What is built *structurally* now, so the future third-party step is an unlock and not a rewrite:

- The single registration door (no first-party backdoor).
- The React-free core (so bundles and scripts are not React-coupled).
- The catalog as the one bounded definition of allowable UI (so the trust boundary is a single auditable object).

What is deliberately **deferred** to a later stage gated on a real external-bundle story (mirroring the scripting layer's staged rollout, where untrusted execution waits until "there is an actual story for where untrusted scripts come from"):

- Marketplace primitives and signed-bundle verification.
- Per-bundle capability grants and worker isolation for UI bundles. *(Note: third-party bundles that contribute UI and tools are a strictly larger trust surface than scripts — a malicious panel can phish inside the app's own chrome — so this is genuinely later work, not a quick toggle.)*
- API versioning and compatibility guarantees.

The decision triggers to revisit this posture: when the contribution surface has months of first-party mileage; when the first third-party-style bundle is prototyped (the real test of whether the contribution API is right); and when there is a concrete answer to where external bundles come from and how they are trusted.

### 10.1 Agentic UI generation (A2UI and others)

Agentic UI generation is **a producer on top of the declarative layer, not an integration beside it.** The framing is deliberately inverted from "integrate A2UI": Verso's catalog + composition + binding model is primary and internal (Section 6); A2UI-compatibility is a *consequence preserved by an adapter* (Step 6), and "and others" stays cheap precisely because no external format is the internal representation (Invariant 11).

This fits unusually cleanly because A2UI's core discipline — *an agent composes only from the client's pre-approved catalog; it cannot execute code or inject a renderer* — is **structurally the same object** as the catalog Verso already needs for configurability and for the deferred third-party trust boundary. A2UI did not introduce a requirement Verso lacks; it is a wire encoding of a requirement Verso already has. The trust-boundary problem it solves ("safely send UI across a trust boundary") is the same problem deferred in this section.

Where it fits: the **property/form tier** — agent-*generated* property panels and forms as a capability *alongside* hand-authored ones, composed from catalog entries (compositions and expert leaves alike, since an agent can reference an expert leaf by catalog ID without authoring it). Where it must **not** go: the canvas, the gesture spine, and the document mutation path. An agentic UI protocol describes UI and binds it to data; it is a producer of *contributions and bindings*, never of *Operations or gestures*. The editor's hard problems are real geometry in Rust (oriented hit-testing, rotation-about-pivot, Knuth-Plass reflow), and the interaction plans are categorical that gesture geometry lives in Rust behind one mutation door. An agent-emitted UI that reached the canvas would either describe things it cannot compute or become a second mutation path — the exact fiction the convergence requirement (Section 7) exists to prevent. A2UI-generated panels write through `@verso/client` like every other panel, or not at all.

Maturity caution: A2UI is early (v0.8 stable / v0.9 draft, actively moving) and Verso's own SDK is unstable-by-design right now. Coupling two simultaneously-moving specifications is contained only by the single-adapter discipline (Invariant 11): A2UI churn touches one file, not the catalog, the bindings, or the panels.

---

## 11. Open questions

Flagged for explicit resolution before the relevant step.

1. **Selection-property surface shape.** Does the resolved-property read for an element selection return a flat snapshot or a live Proxy-style view? The scripting briefing leans on snapshots for bulk reads to avoid per-property Proxy overhead; the property panels want a coherent single read per selection change. Reconcile the two so there is one shape. *(This is also the binding model's read shape — Section 6 — so it is now doubly load-bearing.)*
2. **Application-state ownership across panels.** When Pages drives the camera and a script also drives the camera, both write the same application-state primitive. Confirm there is one owner and one write path, not a panel-local copy.
3. **Tool registry timing.** The tool tier is stubbed in Step 5. Decide whether the tool-registry foundation lands minimally in Step 1 (so the type exists for later) or is deferred entirely until gesture-driven UI needs it.
4. **`@verso/ui` granularity vs. catalog vocabulary.** The design-system boundary starts as a thin re-export over shadcn. The catalog's primitive leaves (Section 6.2) are drawn from `@verso/ui`. Decide the relationship: is the catalog's primitive set exactly `@verso/ui`, or a curated subset with declared binding points? Likely resolved empirically when the property-panel editors (color pickers, scrubbable numeric inputs) repeat across the tier.
5. **Binding expressiveness ceiling.** How much may a binding express before it becomes code — computed values, conditionals, simple formatting? Set the ceiling deliberately and low; everything past it is an expert leaf, not a richer binding language. This is the guard against the "worse React in JSON" failure mode.
6. **What is "configurable" persisted as.** Layout auto-persistence to `localStorage` is enough for first-party. Saved perspectives and per-document UI configuration are out of scope until there is a reason; confirm that boundary.

---

## 12. Summary

The Verso SDK is the public, framework-agnostic boundary around mechanism that already exists — the registries, contexts, docking substrate, client bridge, Operation/Gesture channels, and the live QuickJS surface. It splits into a React-free core (`@verso/client`, shared verbatim with the script engine) and a React adapter (`@verso/react`, holding the hooks, registries, and the single dockview seam). On top of the contribution model sits a declarative component layer: a finite, curated **catalog** of entries that are either declarative **compositions** (trees of references with bindings) or **leaves** (primitive `@verso/ui` widgets, or **expert components** — hand-written code that still declares its bindings and still mutates only through the one Operation door). Binding-shaped panels are compositions; only genuinely-bespoke panels are expert leaves, and a panel that resists the declarative model is first a finding about the catalog. The SDK's correctness comes not from "the UI uses a client method" but from the UI and the script engine using **the same** surface through **one** door — a property the live scripting layer lets us test today rather than assert. The internal declarative model is Verso's own; A2UI and other agentic producers are adapters over it, never the representation itself, which is what keeps "and others" cheap and keeps an early, fast-moving external spec contained to a single seam. The first steps finish the tsify contract, draw the package boundary, probe the selection-property surface for divergence *before* building on it, then prove the binding model, the declarative/imperative boundary, and the expert-leaf contract against three real panels — because three genuinely different consumers fitting the same catalog and the same door is the proof the fundamentals are right. Breadth-first panel work, and any external producer, wait until that proof exists. Third-party support is built for structurally and committed to only later, which means the API is free to evolve cheaply now; that freedom is the whole advantage of the first-party-only window, and the plan is designed to spend it.