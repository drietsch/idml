// @verso/ui — composite components and design-system primitives
// shared across the canvas app and (eventually) third-party
// bundles. The boundary protects bundle code from substrate churn
// — even when this package starts as a thin re-export over shadcn
// primitives in `packages/shell/src/components/ui/*`, the
// indirection matters once composites accumulate.
//
// Step 3a ships the package skeleton; Step 3c initialises shadcn
// under `packages/shell` and Step 3f starts re-exporting the
// composites consumers will use.

export {};
