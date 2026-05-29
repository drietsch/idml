// @verso/catalog — declarative-component catalog + binding model.
//
// Per docs/verso/sdk-implementation-plan.md §Phase 3a. The catalog
// is the finite, curated registry that declarative panel
// compositions reference, what an external producer (A2UI etc.)
// would be constrained to, and what a future third-party bundle
// would be auditable against. One object, multiple consumers.
//
// This is the *skeleton* commit: types + registry only. The
// `CompositionRenderer` + primitive leaves + a real Character
// composition land in follow-up commits once the channel surface
// for content-scoped writes is finalised.

export {
  type Binding,
  type BindingDeclaration,
  type CatalogEntry,
  type CatalogEntryKind,
  type CompositionNode,
  type LeafProps,
  type PropSchema,
  type ReadSpec,
  type SelectionPropertyBinding,
  type WriteSpec,
} from "./types";

export {
  createCatalogRegistry,
  type CatalogRegistry,
} from "./registry";
