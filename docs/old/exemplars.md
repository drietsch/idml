# EXEMPLARS — candidate documents for the 2026+ app

Track D from `docs/inspector.md`. When the 2026+ app is designed (later, not
now), the design driver should be a small set of *exemplar documents* that
prove the new model is doing something different. This file is the running
list of candidates. **Do not build any of these now.** Curate as ideas
surface during renderer + inspector work.

When the time comes, build them as throwaway prototypes against whatever
scene graph then exists *first*, then design the format and editor around
what those exemplars demanded.

## Seeded candidates (from `docs/inspector.md`)

### Live product catalog

A 16-page catalog where every product fact (name, price, specs, image) is
bound to an external data source. Edit the data, the layout updates.
Print-quality output unchanged.

*What it proves:* binding architecture survives at print-quality output
constraints. Layout reactivity composes with typography.

### Multi-output single-source document

One document that renders to print, web, and email from the same source,
with constraints adapting to each medium (no-bleed, fluid columns,
plain-text fallback respectively).

*What it proves:* the document is *content + constraints*, not *content +
fixed layout*. Layout strategies are pluggable per output target.

### Collaborative document

Two cursors editing the same document simultaneously, with proper
conflict resolution at the structural level (not just text — a frame
moved by one user must coexist with a text edit from another).

*What it proves:* the operation model and identity story are strong enough
for CRDT-style or OT-style collaboration.

### Scriptable template

A quarterly report template where running one script generates 30
country-specific variants with localized content and currency, each
correctly typeset.

*What it proves:* the scripting surface and the typesetting engine
compose; data-driven document generation is a first-class workflow, not
an export-time afterthought.

### Mixed-content business document — the RagTime exemplar

Text + spreadsheet calculations + charts derived from those calculations +
external data, all in one document, all reactive. Edit a cell; the chart
updates; the surrounding text reflows around the new chart bounds.

*What it proves:* the layout engine doesn't presume a single content kind.
Heterogeneous content blocks compose into a single reactive document.

## New candidates (append below)

<!-- Add candidate exemplars as they surface. Each should illustrate a
qualitative capability the IDML model can't express; not just "a more
elaborate brochure." -->
