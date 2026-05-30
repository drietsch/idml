// SDK Phase 5 (v1 sweep) — Info panel.
//
// Read-only expert leaf rendering the singleton `DocumentMeta`
// fields per `panel-catalog-and-sdk-extension.md` §5.6 + §6
// Tier 5. Uses `useDocumentMeta()` directly rather than a
// catalog-driven composition because v1 has no `label`/`row`
// primitive carrying a `documentMeta:<key>` binding — that lands
// when the §9 `verso.layout.popover-section` + a Value::String
// display leaf show up. The Info panel is one of the simpler
// expert leaves: tiny surface, no commits, no Operations.

import { useDocumentMeta } from "@verso/shell";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs"
      data-info-row={label}
    >
      <span className="text-muted-foreground">{label}</span>
      <span data-info-value>{value}</span>
    </div>
  );
}

export function InfoPanel() {
  const meta = useDocumentMeta();
  if (!meta) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-info-panel="loading"
      >
        Loading document info…
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-1.5" data-info-panel="ready">
      <Row label="Pages" value={String(meta.pageCount)} />
      <Row
        label="Active page"
        value={meta.activePage ? String(meta.activePage) : "—"}
      />
      <Row label="Units" value={meta.units || "—"} />
      <Row label="Color mode" value={meta.colorMode || "—"} />
      <Row label="Document" value={meta.documentName || "—"} />
      <Row label="Dirty" value={meta.dirty ? "yes" : "no"} />
    </div>
  );
}
