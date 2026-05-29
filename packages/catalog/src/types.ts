// SDK Phase 3 — catalog type surface.
//
// The catalog is a finite, curated registry of entries that
// declarative panel compositions can reference. Each entry is
// either a **composition** (a tree of catalog references with
// bindings — declarative, no code) or a **leaf** (a hand-written
// React component that still declares its bindings).
//
// See docs/verso/sdk-implementation-plan.md §3a + sdk.md §6 for
// the full rationale; this file is the type-level translation.

import type { PropertyPath, Value } from "@verso/client";
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

export interface ReadSpec {
  /** `"*"` declares a leaf that accepts any scope (its primitive
   *  type is what binds compositions to it, not its scope). */
  scope: "element" | "content" | "document" | "camera" | "*";
  /** A `PropertyPath` for element / content scope; a coarse-grained
   *  string ("spreads", "stories") for document scope; the literal
   *  "camera" for camera scope; or a `Value::*` type name when
   *  `scope` is `"*"` (declares "this leaf renders any value of
   *  this Value variant"). */
  ref: PropertyPath | string;
}

export interface WriteSpec {
  scope: "element" | "content" | "document" | "camera" | "selection" | "*";
  ref: PropertyPath | string;
}

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
 * `verso` handle at render time); children are nested nodes.
 */
export interface CompositionNode {
  catalogId: string;
  props: Record<string, unknown>;
  bindings: Record<string, Binding>;
  children?: CompositionNode[];
}
