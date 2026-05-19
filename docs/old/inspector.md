# Concept: What to Do Right Now (Besides the Renderer)

*Revised version. The previous draft proposed building interaction primitives (hit-testing, selection, transforms, viewport) as standalone tools alongside the renderer. That approach is now replaced by an inspector-first strategy, which is strictly better: more architectural validation per line of UI code, no editor-shaped assumptions baked into the scene graph, and a genuine force multiplier on the renderer phase itself.*

## Premise

The renderer phase is the right thing to focus on. But "focus on the renderer" is not the same as "do only the renderer." A single parallel track of work — an inspector — costs modest time, validates the larger architecture before it ossifies, and produces compounding returns during the renderer phase *and* when the editor work eventually begins.

This document covers that track, the discipline practices to maintain alongside it, the one piece of housekeeping that should happen this week, and how to recognize when the renderer has done its architectural job.

## The Housekeeping: Delete the Legacy Editor

The early editor experiment from a few weeks ago should be deleted, in one commit, this week.

Not because legacy code is bad in general — because in this specific case keeping it would actively work against the inspector approach. The temptation would be to preserve "just one or two parts." Those parts carry assumptions from a scene graph that has since moved on. They would quietly contaminate the inspector's design.

Before deleting, spend thirty minutes writing a short `RETROSPECTIVE.md` capturing what the early editor taught: specific gotchas hit, ideas that worked, ideas that didn't. Then delete. The lessons survive; the code doesn't. The volume of code is small enough that if anything turns out to be reusable, you'll remember and rebuild it cleanly.

## The Threshold

Don't think of the editor as starting on a date or after the renderer is "finished." Think of it as starting when four things are simultaneously true:

1. The scene graph hasn't required a structural change in 6–8 weeks. Adding node types is fine; reshaping node relationships is not.
2. The parser → scene graph → compositor seam is clean enough that you can hand-construct a non-IDML scene in Rust and render it without touching parser code.
3. A "hard" set of real-world IDML files renders at fidelity where remaining defects feel like bug-list items, not architectural rethinks.
4. New IDML edge cases are quantitative ("another stroke variant"), not qualitative ("a whole positioning model I didn't know about").

While that's not yet true, keep grinding the renderer. When it becomes true, shift weight toward the editor.

## Track A: The Inspector

An awesome inspector — Chrome DevTools as the mental model, adapted to the realities of a DTP scene graph — is the maximum architectural validation per line of UI code you can get. It's not really "UI work" in the conventional sense. It's *the renderer's runtime introspection surface*, which the renderer needs anyway for debugging, which doubles as a manipulation surface, which incidentally trains the scene graph to expose the API a real editor will eventually consume. Three jobs, one artifact.

Crucially, the inspector is the substitute for a GUI during the renderer phase. With it, you can load an IDML file, walk the tree, find a misbehaving node, twiddle its properties, see the re-render, and diagnose fidelity bugs *faster* than you would with any editor. The inspector is a force multiplier on the renderer work itself, not just preparation for what comes after.

### What "awesome" actually means

A great inspector for this project has specific properties that go beyond "DevTools but for IDML." The first four are non-negotiable for "awesome." The last three are stretch goals that pay disproportionate dividends if you can get them in early.

**A1. Live, not snapshot.** Every value displayed is reactive to the underlying scene graph. Mutate a property in the inspector and the displayed value of every other property that depends on it updates without a refresh. This forces the scene graph to have a proper change-notification mechanism, which you'll need for everything downstream.

**A2. Typed editing, not text editing.** When you click a color property, you get a color picker that understands ICC profiles. A length property gets a unit-aware input that knows about points, mm, inches, and can show the value in any of them. A font reference shows the font name plus a "show font metrics" affordance. The inspector is where your type system meets a human eye; getting this right early teaches the scene graph what *kinds* of values it should be exposing.

**A3. Computed vs authored distinction.** For every node, show both what was *authored* (the property as set) and what was *computed* (the property after resolution, inheritance, cascade). For IDML this matters enormously — a paragraph's effective leading is the result of several layers of paragraph-style → character-style → local-override inheritance, and seeing the resolution chain is invaluable for debugging fidelity bugs. Chrome DevTools does this beautifully for CSS; the analog for DTP is at least as valuable.

**A4. Tree + property panel + render output, simultaneously.** Three panes. Click a node in the tree, the property panel updates, the rendered output highlights the node's geometry. Drag a property value, the render updates. This is the three-way feedback loop that makes inspection genuinely productive.

**A5. Diff view across renders.** *(Stretch)* Render the same IDML file twice with different parameter values; show the visual diff. This is the killer feature for fidelity work — "here's the document with my paragraph composer, here's the document with InDesign's reference output, here are the pixel differences."

**A6. Scriptable command palette.** *(Stretch)* Cmd-K opens a command bar that runs arbitrary scene-graph mutations. Initially a few hardcoded commands; eventually a path to embedded scripting. Free architectural exercise — the scripting surface and the inspector's "modify a property" mechanism are the same thing under the hood.

**A7. Inspectable history.** *(Stretch)* Every mutation goes through a journal. The inspector can scrub back through history, replay mutations, branch from any point. This sets up undo, scripting playback, and (much later) collaboration — all of which need the same underlying operation-log infrastructure.

### What the inspector commits the scene graph to

This is the part that matters architecturally. By building a great inspector, the scene graph is forced to expose:

- Stable, typed node identity.
- Enumerable typed properties on every node.
- Settable typed properties with validation at the type-system level.
- A change-notification mechanism that fires on any mutation.
- Resolved-vs-authored separation for computed properties.
- An operation log (if A7 is built) that captures every mutation as a discrete, replayable event.

Notice what's *not* on this list: spatial selection, transform gizmos, marquee semantics, hit-testing, viewport math. The inspector is more abstract than editor primitives, and the invariants it forces are correspondingly more reusable. If you nail the inspector, the editor primitives become trivial later. The inverse isn't true.

## Track B: One Tiny Piece of Future-Proofing

Bindings are deferred. You don't have a real use case yet, no test files exercise them, and implementing reactivity now would build against an imagined future rather than a present need. The DataSource trait, JSON file source, change propagation — all of it deferred until the renderer phase ends.

The one exception, because it costs almost nothing and protects against a painful refactor later: **every property value in the scene graph should be representable as a typed enum with at least a `Literal` variant, even if `Literal` is the only variant ever constructed.**

```rust
pub enum Value<T> {
    Literal(T),
    // Computed(...) added later when bindings arrive
}
```

A few lines of plumbing. The data shape stays right; the feature stays absent. When bindings eventually arrive, they slot in as a new variant rather than as a structural change to every property in the scene graph.

That's it. No DataSource trait, no resolution pass, no reactivity. Just the enum.

## Track C: Architectural Discipline

Two practices to maintain throughout the renderer phase. Neither is a "track" of work in the project-management sense, but both materially shape what survives into the 2026+ app.

### C1. Protect the parser ↔ scene-graph seam

Everything else can be pragmatic and IDML-shaped. The rasterizer can have CMYK-specific code paths. The text shaper can have IDML-derived assumptions. The color pipeline can lean on ICC patterns IDML cares about. *But the scene graph that the parser emits into must already be designed for what comes next.* That interface is the artifact that survives.

Concrete test: at any point during the renderer phase, you should be able to construct a scene graph by hand in Rust, with no IDML involved, and render it (and inspect it). If that becomes hard, the parser has leaked into the scene graph and the leak should be fixed before any more renderer work proceeds.

The inspector helps enforce this discipline almost for free. If the inspector can display and modify a scene graph, the scene graph by definition has a parser-independent API.

### C2. The misshapen-concepts notebook

Keep a running document — `LESSONS.md` or whatever fits — of every IDML concept that feels structurally wrong, with notes on what it should be. Not "this was hard to implement" but "this is the wrong shape for the underlying problem."

Examples of what belongs in the notebook:

- *Story-and-textframe split with overrides* → should be rope-as-content with frames-as-views into the rope.
- *Anchored objects as a separate positioning mechanism* → should be a general parent-relative positioning constraint, not a separate model.
- *Paragraph composer as a per-paragraph attribute* → should be a document-level layout strategy with paragraph-level hints.
- *Color groups as a flat list with manual reference* → should be a typed reference into a color graph.
- *Master pages as a special inheritance model* → should be general template/instance with override tracking.

You'll generate dozens of these. They are the spine of the 2026+ design document, which you'll write later. The notebook is most valuable *during* the renderer phase, when the insight is at full intensity. After the phase, only "we did it this way" remains and the *why* fades.

The inspector also helps here: when the computed-vs-authored view in A3 forces you to expose IDML's resolution rules explicitly, the misshapen ones become visible. Many notebook entries will be discovered while building the inspector, not while writing the renderer.

## Track D: Exemplar Prototypes for the 2026+ App

When you start designing the 2026+ application — later, not now — resist the urge to begin with the format spec or the data model. Begin with three or four *exemplar documents* that prove the new model is doing something different.

Worth doing right now: keep a running list of candidate exemplars. They will become the design driver later. Some candidates:

- **Live product catalog** — a 16-page catalog where every product fact (name, price, specs, image) is bound to an external data source. Edit the data, the layout updates. Print-quality output.
- **Multi-output single-source document** — one document that renders to print, web, and email from the same source, with constraints adapting to each medium.
- **Collaborative document** — two cursors editing the same document simultaneously, with proper conflict resolution at the structural level (not just text).
- **Scriptable template** — a quarterly report template where running one script generates 30 country-specific variants with localized content and currency, each correctly typeset.
- **Mixed-content business document** — text, spreadsheet calculations, charts derived from those calculations, and external data, all in one document, all reactive. The RagTime exemplar.

Don't build any of these now. Just keep the list. When you start the 2026+ design, build them as throwaway prototypes against the existing scene graph *first*, and *then* design the format and editor around what those exemplars proved.

## What Not to Do Right Now

These are the anti-patterns to avoid during this phase. Each is tempting and each would hurt.

- **Don't start the editor proper.** The inspector is not the editor. Editor UX work would warp the scene graph toward selection/transform/marquee assumptions before those assumptions are validated.
- **Don't build hit-testing, selection, transform gizmos, or viewport math yet.** These were in the previous draft of this concept and have been deliberately removed. They commit the scene graph to editor-shaped assumptions earlier than needed, and the inspector validates the same architecture more cleanly without them. They come back when the editor phase begins.
- **Don't design the file format yet.** The format is a serialization of the scene graph, and the scene graph is still being shaped by the renderer phase. Format design comes after the scene graph stops moving structurally.
- **Don't implement bindings, DataSources, or reactivity.** Just the `Value::Literal(T)` enum from Track B. Anything more is premature.
- **Don't hire an editor team or commit headcount to editor work.** The pressure of people waiting for editor scaffolding will warp judgment about renderer readiness. If new people join, route them into the renderer effort, the inspector, or the discipline tracks.
- **Don't build a Pimcore DataSource yet.** Pimcore is a target customer, not the architecture's reference point. The first DataSource implementations come later, deliberately, after the abstraction is validated with simpler sources.
- **Don't worry about plugin architecture yet.** A component-type registry that *can* be extended later is enough. Designing the public plugin API now would be premature standardization.
- **Don't start the open-source community or public positioning yet.** The renderer becomes a publicly shippable artifact at some point, and that's when public work begins. Earlier than that, attention spent on positioning is attention not spent on engineering.

## Time Budget Sanity Check

Rough estimate of weekly time allocation during the renderer phase, for solo or near-solo work:

- Renderer (IDML fidelity work): ~60%
- Track A (the inspector): ~25%
- Track C (discipline — notebook, seam check): ~10%
- Track D (exemplar list, occasional thinking): ~5%
- Track B (the property-value enum): a one-time cost, then nothing.

The 25% on the inspector is well-spent because, as established earlier, it's a force multiplier on the renderer work itself — the time it costs is partially recouped from faster renderer debugging. The renderer benefits from sustained focus; the inspector benefits from periodic deep dives. Block out a day or two every other week for inspector work rather than fragmenting daily.

## Decision Triggers

Three checkpoints to revisit this concept:

1. **When the inspector reaches A1–A4 quality and the scene graph has been structurally stable for 6+ weeks** → the architectural validation has done its job. Begin lightweight editor UX design (still not implementation).
2. **When the inspector's command palette (A6) or history (A7) is in working condition** → the scripting and operation-log infrastructure is mature enough to start the embedded JS runtime and the binding system in earnest. This is also the moment to write the 2026+ design document, using `LESSONS.md` as raw material.
3. **When IDML fidelity feels like asymptote-chasing rather than insight-generating** → that's the threshold. Begin editor implementation. Begin format spec drafting. Begin Pimcore DataSource (and any other priority integrations).

Until one of those triggers fires, the strategy is: renderer dominant, inspector secondary, discipline as habit.

## Summary in One Paragraph

Delete the legacy editor this week. Don't replace it with another editor. Build an awesome inspector instead — DevTools-grade, with a live three-pane tree/properties/render view, typed property editing, and a computed-vs-authored split that exposes IDML's resolution rules. The inspector is your debug tool for the renderer, your manipulation surface in lieu of a GUI, and the artifact that trains the scene graph to expose the right API for an editor later — three jobs, one piece of code. Keep one tiny piece of future-proofing in the scene graph (every property value as `Value::Literal(T)` so bindings can slot in later) but defer all real binding work. Protect the parser ↔ scene-graph seam. Keep the misshapen-concepts notebook. Keep the exemplar list. Don't start the editor, the format, the plugin API, or the Pimcore integration until the renderer hands you the threshold signal. Then shift.