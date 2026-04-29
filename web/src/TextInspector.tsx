// Character + Paragraph panels for the active text caret.
//
// M2 ships a focused subset: family / size / tracking / underline /
// strikethru on the Character side; alignment / first-line indent /
// space before/after on the Paragraph side. Edits target the whole
// paragraph (no selection-restricted runs yet — M3).

import { useEffect, useState } from "react";
import type { EditorClient } from "./editor/EditorClient";
import type { TypeContext } from "./TextEditOverlay";

interface Props {
  client: EditorClient | null;
  ctx: TypeContext;
  epoch: number;
  onCommandApplied: () => void;
}

export function TextInspector({ client, ctx, epoch, onCommandApplied }: Props) {
  const [run, setRun] = useState<ReturnType<NonNullable<EditorClient["firstRunAttrs"]>>>(
    null,
  );
  const [par, setPar] = useState<ReturnType<NonNullable<EditorClient["paragraphAttrs"]>>>(
    null,
  );

  useEffect(() => {
    if (!client) return;
    setRun(client.firstRunAttrs(ctx.storyId, ctx.paraIdx));
    setPar(client.paragraphAttrs(ctx.storyId, ctx.paraIdx));
  }, [client, ctx.storyId, ctx.paraIdx, epoch]);

  if (!run || !par) return null;

  function setRunAttr(
    apiKey:
      | "Font"
      | "FontStyle"
      | "PointSize"
      | "FillColor"
      | "Tracking"
      | "Underline"
      | "Strikethru",
    value: unknown,
  ) {
    if (!client) return;
    const text = client.paragraphText(ctx.storyId, ctx.paraIdx) ?? "";
    const len = new TextEncoder().encode(text).length;
    client.applyCommand({
      type: "SetRunAttr",
      story: { id: ctx.storyId },
      para: ctx.paraIdx,
      byte_from: 0,
      byte_to: len,
      attr: { key: apiKey, value: value as never } as never,
    });
    onCommandApplied();
  }

  function setParAttr(
    apiKey:
      | "Justification"
      | "FirstLineIndent"
      | "SpaceBefore"
      | "SpaceAfter"
      | "ParagraphStyle",
    value: unknown,
  ) {
    if (!client) return;
    client.applyCommand({
      type: "SetParagraphAttr",
      story: { id: ctx.storyId },
      para: ctx.paraIdx,
      attr: { key: apiKey, value: value as never } as never,
    });
    onCommandApplied();
  }

  return (
    <div className="text-inspector" onPointerDown={(e) => e.stopPropagation()}>
      <h3>Character</h3>
      <TextField
        label="Font"
        value={run.font ?? ""}
        onCommit={(v) => setRunAttr("Font", v ? v : null)}
      />
      <TextField
        label="Style"
        value={run.fontStyle ?? ""}
        onCommit={(v) => setRunAttr("FontStyle", v ? v : null)}
      />
      <NumericField
        label="Size"
        value={run.pointSize ?? 0}
        onCommit={(v) => setRunAttr("PointSize", v)}
      />
      <NumericField
        label="Track"
        value={run.tracking ?? 0}
        onCommit={(v) => setRunAttr("Tracking", v)}
      />
      <CheckField
        label="Underline"
        value={run.underline ?? false}
        onCommit={(v) => setRunAttr("Underline", v)}
      />
      <CheckField
        label="Strike"
        value={run.strikethru ?? false}
        onCommit={(v) => setRunAttr("Strikethru", v)}
      />

      <h3 style={{ marginTop: 14 }}>Paragraph</h3>
      <SelectField
        label="Align"
        value={par.justification ?? "LeftAlign"}
        onCommit={(v) => setParAttr("Justification", v)}
        options={[
          ["LeftAlign", "Left"],
          ["CenterAlign", "Center"],
          ["RightAlign", "Right"],
          ["LeftJustified", "Left justify"],
          ["CenterJustified", "Center justify"],
          ["RightJustified", "Right justify"],
          ["FullyJustified", "Justify all"],
        ]}
      />
      <NumericField
        label="Indent"
        value={par.firstLineIndent ?? 0}
        onCommit={(v) => setParAttr("FirstLineIndent", v)}
      />
      <NumericField
        label="Before"
        value={par.spaceBefore ?? 0}
        onCommit={(v) => setParAttr("SpaceBefore", v)}
      />
      <NumericField
        label="After"
        value={par.spaceAfter ?? 0}
        onCommit={(v) => setParAttr("SpaceAfter", v)}
      />
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== props.value && props.onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(props.value);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function NumericField(props: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat(draft);
          if (Number.isFinite(v) && v !== props.value) props.onCommit(v);
          else setDraft(String(props.value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(String(props.value));
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function CheckField(props: {
  label: string;
  value: boolean;
  onCommit: (v: boolean) => void;
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        type="checkbox"
        checked={props.value}
        onChange={(e) => props.onCommit(e.target.checked)}
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: [string, string][];
  onCommit: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <select
        value={props.value}
        onChange={(e) => props.onCommit(e.target.value)}
      >
        {props.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
