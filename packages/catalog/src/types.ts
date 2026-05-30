// SDK Phase 3 — catalog type surface.
//
// The catalog is a finite, curated registry of entries that
// declarative panel compositions can reference. Each entry is
// either a **composition** (a tree of catalog references with
// bindings — declarative, no code) or a **leaf** (a hand-written
// React component that still declares its bindings).
//
// See docs/paged/sdk-implementation-plan.md §3a + sdk.md §6 for
// the full rationale; this file is the type-level translation.

import type { PropertyPath, Value } from "@paged-media/client";
import type { ComponentType } from "react";

// ---------------------------------------------------------------- bindings

/**
 * A binding declares how a leaf prop gets its value at render time
 * and how committed edits flow back. The set of binding *kinds* is
 * intentionally tiny (the §11.5 binding ceiling): literals, refs
 * against the current selection's resolved properties, and unit
 * coercions. Anything richer is an expert leaf, not a richer
 * binding language.
 */
export type Binding =
  | { kind: "literal"; value: unknown }
  | SelectionPropertyBinding;

export interface SelectionPropertyBinding {
  kind: "selectionProperty";
  /** Which selection surface to address. `"element"` reads from
   *  the element selection (frame-level paths); `"content"` reads
   *  from the content selection (StoryRange-bound character /
   *  paragraph paths). Defaults to `"element"`. */
  scope?: "element" | "content";
  /** The PropertyPath the binding reads from + writes to. */
  path: PropertyPath;
  /** Optional unit coercion applied on read + write. `"pt"` /
   *  `"px"` / `"%"` are the recognised cases today; renderers that
   *  see an unknown coerce log a warning and pass through. */
  coerce?: "pt" | "px" | "%";
}

/**
 * Declared binding surface of a catalog entry. Lint-enforced for
 * leaves (every leaf has a sibling `*.bindings.ts` exporting this
 * shape), so the catalog index can audit what every leaf reads /
 * writes without inspecting code.
 */
export interface BindingDeclaration {
  /** Read paths the entry consumes. Empty for layout-only leaves
   *  (rows, sections, labels). */
  reads: ReadSpec[];
  /** Write paths the entry commits. Empty for read-only displays. */
  writes: WriteSpec[];
}

/**
 * SDK Phase 5 — finite, curated enumeration of every document
 * collection a panel may read. Per `panel-catalog-and-sdk-extension.md`
 * §5.1 (Decision D1). The set is closed: a `documentCollection:`
 * read referencing a name not in this union is a tsc error, and
 * the future A2UI adapter rejects external compositions referencing
 * unknown collections.
 *
 * Not every entry has a backing model accessor yet — the wire +
 * type surface lands here as the binding ceiling; the per-collection
 * Rust accessors fill in as Phase-5 panels need them. Unknown-
 * collection reads at runtime return an empty array with a console
 * warning, not a throw.
 */
export type CollectionName =
  | "swatches"
  | "gradients"
  | "colorGroups"
  | "paragraphStyles"
  | "characterStyles"
  | "objectStyles"
  | "cellStyles"
  | "tableStyles"
  | "layers"
  | "spreads"
  | "pages"
  | "masterPages"
  | "links"
  | "articles"
  | "hyperlinks"
  | "bookmarks"
  | "crossReferences"
  | "conditions"
  | "conditionSets"
  | "fonts"
  | "indexTopics";

/**
 * SDK Phase 5 — finite document-meta keys. Powers the Info panel,
 * status bar, and any chrome that reflects whole-document state.
 * Distinct from `documentCollection` (which is plural) — these are
 * scalar reads of singleton document state.
 */
export type DocumentMetaKey =
  | "pageCount"
  | "activePage"
  | "units"
  | "colorMode"
  | "documentName"
  | "dirty";

/**
 * SDK Phase 5 — read declaration in `BindingDeclaration.reads`. The
 * typed string-template-literal form per
 * `panel-catalog-and-sdk-extension.md` §5.7. Comprises:
 *   - `selectionProperty:<path>` — the existing element/content
 *     property reads; `<path>` is a `PropertyPath` discriminant or
 *     the wildcard `"*"` (audit declaration for primitive leaves
 *     that handle any path).
 *   - `documentCollection:<name>` — the new D1 read kind. `<name>`
 *     is a closed `CollectionName`.
 *   - `documentMeta:<key>` — scalar document-state reads.
 *   - bare tags `"selection"`, `"contentSelection"`, `"camera"`,
 *     `"document"` — coarse-grained whole-handle reads.
 */
export type ReadSpec =
  | `selectionProperty:${string}`
  | `documentCollection:${CollectionName}`
  | `documentMeta:${DocumentMetaKey}`
  | "selection"
  | "contentSelection"
  | "camera"
  | "document";

/**
 * SDK Phase 5 — write declaration in `BindingDeclaration.writes`.
 * `selectionProperty:<path>` is the only binding-emittable kind
 * (the §11.5 ceiling: every binding writes through ONE typed
 * property path, including the apply-an-entity paths
 * `appliedParagraphStyle` / `appliedCharacterStyle` / etc.).
 *
 * `"geometry"` and `"collection"` are AUDIT-ONLY tags: an expert
 * leaf's `*.bindings.ts` declares them when its commits go through
 * `paged.mutate(Operation::AlignObjects{…})` (geometry) or
 * `paged.mutate(Operation::CreateSwatch{…})` (collection
 * mutation). A composition cannot emit them — only expert leaves —
 * and a lint follow-up enforces that every panel declaring these
 * is an expert leaf with a `.bindings.ts` sibling.
 *
 * `"selection"` and `"camera"` mark expert leaves that write to
 * application state (Pages drives camera; Tools writes activeTool;
 * Align rewrites selection). They are mutation-of-state, not
 * mutation-of-document.
 */
export type WriteSpec =
  | `selectionProperty:${string}`
  | "selection"
  | "camera"
  | "geometry"
  | "collection";

// ---------------------------------------------------------------- entries

export type CatalogEntryKind = "composition" | "leaf";

/**
 * Schema describing the props a catalog entry accepts. v1 is a
 * shallow `Record<string, "string" | "number" | "boolean">` — JSON
 * Schema's expressiveness is not needed yet, and keeping the schema
 * trivial discourages drifting toward "JSON React" (the §11.5
 * ceiling: bindings stay simple; complex props live on expert
 * leaves).
 */
export type PropSchema = Record<string, "string" | "number" | "boolean" | "JsonValue">;

/**
 * Catalog entry. Compositions are pure data; leaves provide the
 * React component. Both share the same id + props + bindings
 * surface so a composition author can compose with either without
 * knowing which kind it is — the §6.2 distinction is
 * implementation-only.
 */
export interface CatalogEntry {
  id: string;
  kind: CatalogEntryKind;
  /** Typed schema of accepted props. */
  props: PropSchema;
  /** Declared binding surface — what the entry reads, what it writes. */
  bindings: BindingDeclaration;
  /** Present iff `kind === "leaf"`. */
  leaf?: ComponentType<LeafProps>;
  /** Present iff `kind === "composition"`. */
  composition?: CompositionNode;
}

/**
 * Props the catalog renderer passes to a leaf. `value` carries the
 * resolved value for the leaf's primary binding (the one named in
 * its props as `"value"`); `onCommit` writes a new value back
 * through the apply layer. `null` value means "indeterminate /
 * mixed" — render the em-dash placeholder, not a default.
 */
export interface LeafProps {
  value: Value | null;
  onCommit?: (next: Value) => void;
  /** Free-form additional props forwarded from the composition node;
   *  leaves type-check their own shape internally. */
  props: Record<string, unknown>;
}

/**
 * A node in a composition tree. References a catalog entry by id;
 * supplies props (literal) + bindings (looked up against the
 * `paged` handle at render time); children are nested nodes.
 */
export interface CompositionNode {
  catalogId: string;
  props: Record<string, unknown>;
  bindings: Record<string, Binding>;
  children?: CompositionNode[];
}
