// SDK Phase 3 — primitive catalog leaves.
//
// Wraps `@verso/ui` widgets with the LeafProps shape the catalog
// renderer hands them. Each leaf reads its primary value from the
// `value` prop (already resolved by the binding hook) and writes
// back via `onCommit`. The leaves are intentionally tiny — the
// design-system widgets in @verso/ui do the heavy lifting.

import type { LeafProps } from "@verso/catalog";
import type { CollectionName, Value } from "@verso/client";
import { BoundsInput, LengthInput, ColorPicker, NumberInput } from "@verso/ui";

import { useCollection } from "./use-collection";

// ---------------------------------------------------------------- helpers

/** Returns (resolved, value-in-points). `resolved` is false when the
 *  binding itself failed to resolve (mixed / no selection / non-
 *  length variant); `pointValue` is meaningless in that case. When
 *  `resolved` is true, `pointValue` is the displayable number — 0
 *  if the underlying `Value::Length(None)` is "inherit default"
 *  (matches the inspector's `value ?? 0` convention). */
function unwrapLengthValue(
  v: Value | null,
): { resolved: boolean; pointValue: number } {
  if (v == null) return { resolved: false, pointValue: 0 };
  if (v.type !== "length") return { resolved: false, pointValue: 0 };
  return { resolved: true, pointValue: v.value ?? 0 };
}

function unwrapColorRefValue(
  v: Value | null,
): { resolved: boolean; ref: string | null } {
  if (v == null) return { resolved: false, ref: null };
  if (v.type !== "colorRef") return { resolved: false, ref: null };
  return { resolved: true, ref: v.value ?? null };
}

function labelFromProps(props: Record<string, unknown>): string | undefined {
  return typeof props.label === "string" ? props.label : undefined;
}

// ---------------------------------------------------------------- leaves

/** Numeric input with a unit picker. Binds to a `Value::Length`. */
export function LengthLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const { resolved, pointValue } = unwrapLengthValue(value);
  if (!resolved) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-muted-foreground" data-mixed>
          —
        </span>
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <LengthInput
        valuePt={pointValue}
        onChangePt={(next) => {
          // Live updates are emitted; we only commit on blur via
          // onCommitPt below to avoid spamming the mutation channel.
          // Suppress the lint about the unused-variable.
          void next;
        }}
        onCommitPt={(next) => {
          onCommit?.({ type: "length", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Color swatch picker. Binds to a `Value::ColorRef`. */
export function ColorSwatchLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const { resolved, ref } = unwrapColorRefValue(value);
  if (!resolved) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-muted-foreground" data-mixed>
          —
        </span>
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <ColorPicker
        value={ref}
        onCommit={(next) => {
          onCommit?.({ type: "colorRef", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Raw scrubbable numeric (no unit). Binds to a `Value::Length`. */
export function NumericScrubLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const { resolved, pointValue } = unwrapLengthValue(value);
  if (!resolved) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-muted-foreground" data-mixed>
          —
        </span>
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <NumberInput
        value={pointValue}
        onChange={() => {
          /* live updates ignored; commit on blur */
        }}
        onCommit={(next) => {
          onCommit?.({ type: "length", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Titled section. Layout-only — renders the catalog children. */
export function LayoutSectionLeaf({ props }: LeafProps) {
  const title = typeof props.title === "string" ? props.title : undefined;
  return (
    <fieldset className="border-t border-input pt-2" data-section={title}>
      {title ? (
        <legend className="text-xs font-medium uppercase text-muted-foreground px-1">
          {title}
        </legend>
      ) : null}
      <div className="flex flex-col gap-1.5 pt-1">
        {(props.children as React.ReactNode) ?? null}
      </div>
    </fieldset>
  );
}

function unwrapBoundsValue(
  v: Value | null,
): [number, number, number, number] | null {
  if (v == null) return null;
  if (v.type !== "bounds") return null;
  return v.value as [number, number, number, number];
}

/** 4-cell bounds editor `[top, left, bottom, right]` in points. */
export function BoundsLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const bounds = unwrapBoundsValue(value);
  if (bounds === null) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-muted-foreground" data-mixed>
          —
        </span>
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <BoundsInput
        valuePt={bounds}
        onChangePt={() => {
          /* live updates ignored; commit on Enter / blur */
        }}
        onCommitPt={(next) => {
          onCommit?.({ type: "bounds", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Generic summary shape expected from every named document
 *  collection. `selfId` is the IDML `Self` id (used as the commit
 *  payload + react-key); `name` is the human-readable label.
 *  Additional collection-specific fields (e.g. swatch `kind`) are
 *  passed through but the v1 leaf doesn't render them. */
interface CollectionRow {
  selfId: string;
  name: string;
}

/** Reads a Value as either Text or ColorRef payload (the two
 *  string-id-carrying Value variants). Returns the unwrapped
 *  string + the originating variant so the commit path emits the
 *  matching shape on write. */
function unwrapIdValue(v: Value | null): {
  resolved: boolean;
  id: string;
  /** Source variant — informs which Value variant onCommit emits.
   *  Defaults to "text" for the "no-binding" case so the
   *  collection-select still works without explicit valueType. */
  source: "text" | "colorRef";
} {
  if (v == null) return { resolved: false, id: "", source: "text" };
  if (v.type === "text") {
    return { resolved: true, id: (v.value as string) ?? "", source: "text" };
  }
  if (v.type === "colorRef") {
    return {
      resolved: true,
      id: (v.value as string | null) ?? "",
      source: "colorRef",
    };
  }
  return { resolved: false, id: "", source: "text" };
}

/**
 * SDK Phase 5 (D7) — apply-an-entity selector. Reads
 * `props.collectionName` (a `CollectionName`) + `props.label`
 * (the row label), fetches the live array via `useCollection`,
 * renders a `<select>` whose options are the collection's
 * `selfId` + `name` pairs, plus a leading `[None]` entry for
 * clearing the override.
 *
 * On change → `onCommit({ type: <valueType>, value: selfId })`.
 * `valueType` defaults to `"text"` (the original applied-entity
 * shape used by Paragraph / Character / Object Styles); the
 * Swatches + Gradients panels pass `valueType: "colorRef"` so the
 * commit emits a `Value::ColorRef`. The bound binding's
 * `path` decides which apply arm consumes the commit, and the
 * panel author picks the `valueType` to match.
 *
 * Mixed / no-selection / non-text-or-colorRef binding → em-dash
 * placeholder (existing leaf convention).
 */
export function CollectionSelectLeaf({
  value,
  onCommit,
  props,
}: LeafProps) {
  const label = labelFromProps(props);
  const collectionName =
    typeof props.collectionName === "string"
      ? (props.collectionName as CollectionName)
      : null;
  const valueType: "text" | "colorRef" =
    props.valueType === "colorRef" ? "colorRef" : "text";
  // Hook must run unconditionally; pass a safe fallback when the
  // composition doesn't declare a `collectionName`. The follow-up
  // branch below renders the error placeholder.
  const items = useCollection<CollectionRow>(
    (collectionName ?? "swatches") as CollectionName,
  );
  if (collectionName === null) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-destructive">
          missing collectionName prop
        </span>
      </LeafRow>
    );
  }
  const { resolved, id } = unwrapIdValue(value);
  if (items === null) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-muted-foreground">loading…</span>
      </LeafRow>
    );
  }
  const showMixed = !resolved && value === null;
  return (
    <LeafRow label={label}>
      <select
        className="w-full text-xs px-1 py-0.5 border border-input rounded bg-background"
        value={resolved ? id : ""}
        data-mixed={showMixed ? "true" : "false"}
        data-collection={collectionName}
        data-value-type={valueType}
        onChange={(e) => {
          const next = e.target.value;
          if (valueType === "colorRef") {
            // Empty string maps to "no fill" — Value::ColorRef(None).
            onCommit?.({
              type: "colorRef",
              value: next === "" ? null : next,
            } as Value);
          } else {
            onCommit?.({ type: "text", value: next } as Value);
          }
        }}
      >
        <option value="">[None]</option>
        {items.map((row) => (
          <option key={row.selfId} value={row.selfId}>
            {row.name}
          </option>
        ))}
        {/* "mixed" sentinel exposes the placeholder so the binding
            hook's multi-element collapse can show an em-dash without
            the select arbitrarily picking the first row. */}
        {showMixed ? (
          <option value="__mixed__" disabled>
            —
          </option>
        ) : null}
      </select>
    </LeafRow>
  );
}

/** Plain label (literal text). */
export function LabelLeaf({ props }: LeafProps) {
  const text = typeof props.text === "string" ? props.text : "";
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

function LeafRow({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2">
      {label ? (
        <label className="text-xs text-muted-foreground">{label}</label>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}
