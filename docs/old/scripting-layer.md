# Technical Briefing: Scripting Layer

*Companion document to the renderer phase concept. Defines the scripting architecture, the runtime choice, the JS API surface, the sandboxing model, and the rollout order. The central claim is that scripting is not a separate feature but the same mechanism as the inspector's mutation channel, the undo/redo system, and the future collaboration layer — and getting that unification right is more important than the runtime choice itself.*

## Scope

This briefing covers:

- The runtime engine choice (QuickJS vs Pyodide vs Boa) and the rationale.
- The Operation-based mutation architecture that unifies scripting, the inspector, undo/redo, and future collaboration.
- The JS API surface design.
- The capability-based sandboxing model.
- The staged rollout order and how it fits into the renderer phase.
- The integration points with the rest of the system (inspector, renderer, future DuckDB, future bindings).

Out of scope: AI-script generation, script marketplace primitives, multi-engine support (Python via Pyodide as a later option), distributed collaboration protocols. These are deferred and can be added on top of the architecture this document specifies without retrofit.

## Runtime Choice: QuickJS via `rquickjs`

The runtime is **QuickJS**, embedded via the **`rquickjs`** Rust binding.

### Rationale

QuickJS compiled to WASM is small (~700KB–1MB), starts in tens of milliseconds, and embeds cleanly inside another WASM context without ceremony. It is ES2023-complete, supports modules, BigInt, tagged templates, and Proxies (which the JS API design relies on). The license is MIT. `rquickjs` is the strongest Rust binding — actively maintained, supports async, derive macros for exposing Rust types, lifetime-checked at the type-system level.

The audience for DTP scripting is almost entirely JS-speaking. InDesign's ExtendScript, Figma's plugin API, After Effects, Sketch, and every modern browser-based design tool use JS dialects. Pimcore integrators lean JS/TS. The script a user writes to "find every product where the price changed and update the corresponding text frame" is a five-line JS snippet they can read at a glance. Forcing any other language imposes a translation tax on every script ever written for this system.

### Why not Pyodide

Pyodide is impressive engineering — CPython compiled to WASM with much of the scientific stack available — but it is the wrong tool here for three concrete reasons:

1. **Size and startup.** Pyodide core is ~6–10 MB compressed; with NumPy/SciPy, 50 MB+. Cold start is hundreds of milliseconds to seconds. The renderer's WASM payload is already meaningful; adding Pyodide is a noticeable hit on every user. QuickJS is a rounding error in comparison.
2. **Audience mismatch.** The Python-in-DTP community essentially doesn't exist. Blender has Python, but Blender is 3D and the audience is technical artists. DTP scripting has been JS territory for 25 years.
3. **Embedding ergonomics.** `rquickjs` lets Rust types cross into JS via derive macros and automatic conversions. Pyodide's JS-Python FFI on top of WASM adds layers of marshaling and type confusion. Performance and ergonomics both suffer.

The case for Pyodide would be "data scientists want statistical analysis on document data." That use case is better served by the DuckDB-attached scripting plane already planned. SQL over the document is more powerful and more accessible for data work than Python is, with less weight and more polish.

### Why not Boa

Boa is a pure-Rust JS engine that compiles into the Rust binary without a separate WASM module. Appealing in principle. In practice, it is still behind QuickJS on ES spec compliance and performance, and the maintainers are open about this. Boa becomes interesting in two or three years; QuickJS is the right choice today.

### Future option: Pyodide as a second runtime

If, in two to three years, there is strong demand from data-team users for Python access to documents, Pyodide can be added as a second runtime — feature-flagged, lazy-loaded, sharing the same `Operation`-based API surface defined below. The architecture does not preclude it. It just is not the day-one bet.

## The Central Architecture: Operation-Based Mutation

The most important decision in this layer is not the runtime. It is recognizing that **the scripting engine, the inspector's mutation channel, the editor's eventual command system, the undo/redo log, and the future collaboration sync are all the same pipe.** Build them as one mechanism and the system is dramatically simpler and more powerful than the sum of its parts. Build them separately and you will spend the rest of the project reconciling them.

The unifying primitive is the **Operation** — a typed, serializable, replayable description of a single change to the scene graph.

### The Operation type

```rust
pub enum Operation {
    SetProperty {
        node: NodeId,
        path: PropertyPath,
        value: Value,
    },
    InsertNode {
        parent: NodeId,
        position: usize,
        node: NodeSpec,
    },
    RemoveNode {
        node: NodeId,
    },
    MoveNode {
        node: NodeId,
        new_parent: NodeId,
        position: usize,
    },
    Batch(Vec<Operation>),
    // A small, closed set. Extensions require deliberation.
}
```

Every Operation is:

- **Typed** — no `serde_json::Value` smuggling. The compiler knows what each variant means.
- **Serializable** — to bytes for persistence, to JSON for inspection, to a wire format for future collaboration.
- **Replayable** — applying the same operation against the same scene-graph state produces the same result.
- **Invertible** — for every Operation, an `invert(op, pre_state) -> Operation` function returns the operation that undoes it.

### The single mutation surface

The scene graph exposes exactly one mutation function:

```rust
impl SceneGraph {
    pub fn apply(&mut self, op: Operation) -> Result<AppliedOperation, OperationError>;
}
```

`apply` is the *only* mutation surface. Reads can be arbitrary. Writes go through one door. This is the rule that makes the rest of the architecture work, and it must be enforced — ideally by Rust's type system (mutation methods on internal types are `pub(crate)` or private), enforced by code review and by the absence of any other public mutation method.

`AppliedOperation` returns the inverse operation plus any diagnostic information. The inverse is what gets pushed onto the undo stack.

### What this gives you, immediately and for free

- **Inspector mutations** translate property-editor changes into `SetProperty` operations and call `apply`. The inspector has no privileged mutation path.
- **The REPL** in the inspector parses text into Operations and calls `apply`. The REPL becomes a thin parser.
- **Undo/redo** is two stacks of operations with an `invert` function. Already there.
- **Persistence of in-progress edits** is a log of operations since the last save. Crash recovery falls out.
- **The script engine**, once added, exposes a JS API that constructs Operations and applies them via the same channel. Scripts cannot bypass it.
- **Collaboration**, when it eventually arrives, is exchanging Operations over a network. CRDT logic operates on Operations, not on the scene graph directly.

This is roughly what Figma does internally. It is roughly what the Operational Transform research community converged on in the 2000s. It is the architecture behind Notion, Linear, and most serious modern collaborative tools. Committing to it now is cheap; retrofitting it later is brutal.

### Batching and atomicity

Operations are applied atomically by default. Multi-step changes (e.g., "for each of these 50 frames, change the fill color") wrap in `Operation::Batch`. A batch is one undo entry, one persistence entry, one collaboration message. Batches are not nestable; nesting flattens. This keeps the operation log linear and easy to reason about.

The JS API exposes `scene.batch(() => { ... })` for ergonomic batching; the function body runs and every mutation it triggers is collected into one Batch operation.

### Identity and stability

`NodeId` is stable across the lifetime of a document. Once assigned, a node's ID never changes. Operations reference nodes by ID, not by path. This is essential for any future collaboration story (an Operation generated on one client must apply meaningfully on another, even if the tree has changed underneath) and is independently the right design for scripting (a script that grabs a reference to a node and later mutates it must not break if the tree was reshuffled).

`PropertyPath` is a typed path within a node, e.g., `["fill", "color"]` or `["stroke", "dash_pattern", 2]`. Typed because Rust enforces it; serialized as an array of strings/indices for transport.

## The JS API Surface

Once `Operation` exists, the JS surface designs itself. The shape should be familiar to anyone who has used a modern design tool's scripting API.

### Read access

Direct property access. No Operations. No round trips beyond the unavoidable WASM/JS boundary.

```javascript
const doc = scene.document;
const page = doc.pages[0];
const frames = page.findAll(n => n.type === 'TextFrame');
const leadingValue = frames[0].text.leading;
```

### Write access

Looks like direct mutation. Internally constructs Operations and routes them through `apply`.

```javascript
frame.fill.color = '#FF0000';                    // → SetProperty op
frame.position = { x: 100, y: 200 };             // → SetProperty op
page.insertChild(newFrame, 3);                   // → InsertNode op
```

The mechanism is JS Proxies, which QuickJS supports fully. Every Rust type exposed to JS is wrapped in a Proxy whose `set` trap constructs a `SetProperty` Operation and applies it. The script author writes natural JS; the system gets all the benefits of Operation-based architecture.

`rquickjs` makes this clean — derive `IntoJs` and `FromJs` for the Rust types, register a class with a `set` trap, done.

### Explicit batching

```javascript
scene.batch(() => {
  for (const frame of frames) {
    frame.fill.color = newColor;
  }
});                                              // → one Batch op, one undo entry
```

Without `batch`, the loop produces 50 separate Operations, 50 undo entries, 50 re-renders. With `batch`, one Operation, one undo entry, one re-render. The performance and UX difference is significant; the API surface for opting in is two lines.

### Querying

When the DuckDB projection lands, scripts gain SQL access:

```javascript
const results = await scene.query(`
  SELECT id, x, y FROM frames WHERE bound_to_pim = true
`);
```

The projection is read-only from SQL's perspective; mutations still go through the Operation channel. SQL is for finding, not for changing.

### Event subscription

Scripts can subscribe to scene-graph changes:

```javascript
scene.on('mutation', (op) => {
  console.log('Applied:', op);
});

frame.on('change', (path, oldValue, newValue) => {
  // fires when any property under `frame` changes
});
```

Internally, both are wired to the same change-notification mechanism the inspector uses (A1 in the inspector design). The script engine listens like any other consumer.

### Async and Promises

QuickJS supports Promises natively. Long-running operations (loading external resources, awaiting bindings to resolve) return Promises. Scripts can `await` them. `rquickjs` integrates with Rust's async ecosystem for this.

### Module loading

Scripts can `import` from a small, controlled set of modules. No filesystem. No node_modules. The host registers modules explicitly:

```javascript
import { rgb, cmyk } from 'pimcore:color';
import { mm, pt, inches } from 'pimcore:units';
import { query } from 'pimcore:scene';
```

The `pimcore:` scheme is a placeholder; the actual scheme follows the project name once decided. Custom modules can be registered by the host at runtime, useful for plugin systems and per-document script libraries.

## Sandboxing and Capabilities

The scripting engine is **capability-restricted by default**. Scripts get access to the scene graph and a small standard library (Math, String, Date, JSON, Promise, basic collections). They do *not* get:

- Network access (no `fetch`, no XHR, no WebSockets).
- Filesystem access (none exists in QuickJS by default).
- DOM access.
- `eval` of dynamically-loaded code from outside the script's source.
- Access to other documents or other tabs.
- Wall-clock time beyond `Date.now()` (no `performance.now` unless explicitly granted).

QuickJS makes this easy because it has no built-in I/O. Every capability is something the host chooses to expose. The default-deny posture is free.

### Why this matters now

Scripts will eventually come from outside the user — templates from a marketplace, automation from a teammate, generated scripts from AI assistants. Unsandboxed scripts in a creative tool are a real attack surface. Establishing capability discipline now means it doesn't have to be retrofitted.

It also forces good API design. Every capability becomes a deliberate choice rather than an accident. When `fetch` is eventually added, it will be opt-in per script, with allowlist controls. When filesystem access is added (only in headless/CI contexts, never in the browser), it will be scoped to a specific working directory.

### Resource limits

Scripts run with bounded resources:

- **Execution time** — a configurable wall-clock timeout per script invocation, default 5 seconds. Long-running scripts must explicitly request more. Enforced via QuickJS's interrupt handler.
- **Memory** — a configurable heap limit per script context, default 64 MB. Enforced by QuickJS's allocator.
- **Operation count** — a configurable cap on Operations applied per script invocation, default 100,000. Prevents accidental infinite loops from destroying a document.

All three limits are tunable per-context. Trusted scripts (user's own, signed plugins) run with higher limits. Untrusted scripts (from a marketplace, from AI) run with lower limits and require explicit user approval to escalate.

### Worker isolation (later)

For genuinely untrusted scripts, the QuickJS context runs in a separate Web Worker, with the operation channel exposed via `postMessage`. This is deferred until untrusted scripts are actually a thing. For now, the in-main-thread QuickJS context with resource limits is sufficient.

## Integration Points

### With the inspector

The inspector's mutation channel *is* the Operation channel. Every property edit becomes a `SetProperty` operation. The REPL pane parses text commands into Operations. The command palette (A6 in the inspector design) is, once QuickJS is wired, a thin layer over the same JS evaluation context that scripts use. Typing `frame.fill.color = '#FF0000'` in the command palette and the same line in a saved script produce identical behavior.

The inspector also gains a **script editor pane** once QuickJS is wired. CodeMirror or Monaco, syntax-highlighted, with autocomplete driven by the same type information that drives the property panel. Saved scripts live in a `scripts/` directory inside the document container.

### With the renderer

The renderer subscribes to mutations via the same change-notification mechanism the inspector uses. Operations trigger dirty-flagging on affected nodes; the next render pass picks up the changes. Scripts get re-rendered output the same way inspector edits do.

For batch operations, the renderer coalesces — a `Batch` of 50 `SetProperty` ops triggers one re-render at the end, not 50. This is essential for script performance.

### With DuckDB (future)

The DuckDB projection is exposed to scripts via `scene.query(sql)`. The projection is maintained by a sync layer that listens to Operations and updates the DuckDB tables accordingly. Scripts can read via SQL but must mutate via Operations — there is no `UPDATE` path through DuckDB into the scene graph. The projection is a queryable view, not an editing substrate.

### With bindings (future)

Bindings, when they arrive, are exposed to scripts as a separate API surface. Scripts can read bound values (resolved or unresolved), trigger re-evaluation, and create/modify bindings. Creating a binding is itself an Operation (`SetProperty` where the value is `Value::Computed(binding_spec)` instead of `Value::Literal(...)`). The architecture from Track B of the concept document slots in naturally.

### With the editor (future)

The eventual editor's drag-on-canvas, transform gizmos, marquee selection, and so on all produce Operations. The editor has no privileged mutation path. A user dragging a frame and a script setting `frame.position` go through the same channel and produce indistinguishable history entries.

## Staged Rollout

The previous concept document deferred scripting to "after the renderer threshold." That advice was correct under the assumption that scripting meant *user-facing scripting feature*. Given the framing in this briefing — scripting as the *unifying mechanism behind the inspector, REPL, undo/redo, and future collaboration* — the underlying architecture comes forward, with discipline applied to keep scope contained.

### Stage 1: Operation infrastructure (now, alongside the inspector)

Build the `Operation` enum, `apply(op)`, `invert(op)`, undo/redo stacks, and the change-notification mechanism. Route the inspector's property editors through this channel. Add a REPL pane that parses simple text commands (`set node:42 fill.color #FF0000`) into Operations. No JS engine yet.

This is essentially free — the inspector needs a mutation channel anyway, and operation-based is the right shape.

**Deliverables:**
- `Operation` enum with the five core variants.
- `SceneGraph::apply` as the sole mutation surface.
- `invert(op, pre_state)` for all five variants.
- Undo/redo stacks wired into the inspector toolbar.
- REPL parser handling `set`, `insert`, `remove`, `move`, `undo`, `redo`, `inspect`.
- Operation log persisted alongside in-memory document state.

**Time estimate:** 2–3 weeks of focused work, fits inside the inspector track's time budget.

### Stage 2: QuickJS integration (a few weeks after Stage 1 stabilizes)

Once the Operation system has been exercised by the inspector and REPL for a few weeks and the surface has stopped changing, wire in QuickJS via `rquickjs`. Expose the scene graph through Proxy-wrapped Rust types. The JS API is a thin layer over an Operation system that already works — you do not have to validate JS behavior and Operation behavior simultaneously.

**Deliverables:**
- `rquickjs` dependency added; QuickJS compiled into the WASM build.
- Scene-graph types exposed to JS via derive macros and Proxy wrappers.
- Property read access returns live values from the scene graph.
- Property write access constructs Operations and applies them.
- `scene.batch(fn)` ergonomic batching API.
- `scene.on('mutation', fn)` event subscription.
- Basic capability sandboxing: no fetch, no filesystem, no DOM, default resource limits.
- Script editor pane in the inspector (CodeMirror, syntax-highlighted).
- Saved scripts loadable from the document container's `scripts/` directory.

**Time estimate:** 3–4 weeks.

### Stage 3: SQL query surface (later, when DuckDB lands)

Wire `scene.query(sql)` to the DuckDB projection. Document the projection schema (which scene-graph entities map to which tables and columns). The projection is read-only from SQL; mutations remain Operation-based.

**Deliverables:**
- DuckDB-WASM compiled into the build.
- Projection sync layer listening to Operations and updating DuckDB tables.
- `scene.query(sql)` JS API.
- Documentation of the projection schema.

**Time estimate:** 4–6 weeks, gated on the DuckDB-attached scripting plane being designed.

### Stage 4: Bindings and DataSources (later, after Stage 3)

The binding API surface from the concept document's Track B becomes live. Scripts can create, read, and modify bindings. DataSources are pluggable; reference implementations include InMemoryMock and JSONFile. Pimcore-specific DataSource comes after the abstraction is validated.

### Stage 5: Untrusted script execution (much later, when relevant)

Worker isolation, stricter resource limits, signed scripts, marketplace primitives, AI-script integration hooks. Deferred until there is an actual story for where untrusted scripts come from.

## Risks and Open Questions

### Performance

QuickJS is slower than V8 by a meaningful margin (rough estimate: 2–10× depending on workload). For interactive scripts that operate on hundreds of nodes, this is fine. For scripts operating on hundreds of thousands of nodes, this could be a problem. Mitigations: batch operations aggressively (one Batch op of 10,000 changes is far cheaper than 10,000 individual operations), expose bulk operations as native Rust functions callable from JS (`scene.bulkSetProperty(ids, path, value)` bypasses the per-node Proxy overhead), and rely on DuckDB for bulk read queries rather than iterating in JS.

### WASM-in-WASM

QuickJS runs as a separate WASM module inside the host WASM context, communicated via `rquickjs`. This works but adds a layer. If `rquickjs` proves problematic, the fallback is to compile QuickJS into the host Rust binary as a static library and call its C API directly. Worse ergonomics, same architecture.

### Proxy overhead

JS Proxies have non-trivial overhead per property access. For interactive use this is invisible. For tight loops over many properties, it adds up. The mitigation is to expose bulk read APIs that return plain JS objects (snapshots) rather than always handing back Proxy-wrapped live objects. Scripts that need to read 10,000 frame positions get a flat array, not 10,000 Proxy traps.

### Compatibility with future Pyodide

If Pyodide is ever added, the Operation-based architecture means the Python API is structurally identical to the JS API — read access via property descriptors, write access constructing Operations, batching, events. The work is in writing a Python binding for the same `Operation` channel, not in reconciling two different architectures.

### Naming conventions

The JS API uses `camelCase` (JS convention). The Rust API uses `snake_case`. The Operation type's `path` field uses string keys that match the JS-facing names, not the Rust-facing names. This conversion happens at the FFI boundary and must be consistent. A small naming map maintained in the binding layer prevents drift.

## Decision Triggers for This Briefing

Three checkpoints where this briefing should be revisited:

1. **When Stage 1 is in working condition** → review the Operation enum design with real usage. Some variants may need adjustment based on what the inspector and REPL actually need. Do this revision before Stage 2 begins.
2. **When Stage 2 has been used for ~1 month** → review the JS API ergonomics. Patterns that felt right on paper may be awkward in practice. The API can still evolve at this point; once external scripts depend on it, evolution becomes expensive.
3. **When real users are writing scripts** → review the capability model. The default-deny posture may be too restrictive in practice, or too permissive in unexpected ways. Adjust based on observed needs.

## Summary in One Paragraph

The scripting layer's central insight is that scripting, inspector mutations, the REPL, undo/redo, and future collaboration are all expressions of the same underlying mechanism — a typed, serializable, invertible `Operation` applied through a single `apply` channel on the scene graph. Build the Operation system now, alongside the inspector, even before any JS engine exists. Once that system is stable, embed QuickJS via `rquickjs` and expose the scene graph through Proxy-wrapped types so that natural JS mutation syntax automatically constructs Operations. Default to capability-restricted sandboxing — no network, no filesystem, no DOM, bounded resources — and add capabilities only when deliberately needed. Defer Pyodide, defer worker isolation, defer the marketplace story. The architecture this briefing specifies is the same architecture that supports each of those when they eventually arrive, with no retrofit required.