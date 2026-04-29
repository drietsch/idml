// Paragraph / Character / Object Style panels.
//
// Three lists; click-to-apply against the active context:
//  * Paragraph styles → SetParagraphAttr ParagraphStyle on caret.para
//  * Character styles → SetRunAttr CharacterStyle over the type
//    selection if present, otherwise the whole paragraph
//  * Object styles → ApplyObjectStyle on the currently-selected frame
//
// "Active style" highlighting reads through the same paragraph/run
// attribute snapshots the TextInspector uses, so the highlight stays
// in sync with the caret position.

import { useEffect, useState } from "react";
import type { EditorClient } from "./editor/EditorClient";
import type { TypeContext } from "./TextEditOverlay";

interface Props {
  client: EditorClient | null;
  epoch: number;
  /** Currently focused text caret, if any. */
  typeCtx: TypeContext | null;
  /** Currently selected frame, if any. */
  selection: string | null;
  onCommandApplied: () => void;
}

export function StylePanels({
  client,
  epoch,
  typeCtx,
  selection,
  onCommandApplied,
}: Props) {
  const [paraStyles, setParaStyles] = useState<{ id: string; name: string }[]>([]);
  const [charStyles, setCharStyles] = useState<{ id: string; name: string }[]>([]);
  const [objStyles, setObjStyles] = useState<{ id: string; name: string }[]>([]);
  const [activePara, setActivePara] = useState<string | null>(null);
  const [activeChar, setActiveChar] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      setParaStyles([]);
      setCharStyles([]);
      setObjStyles([]);
      return;
    }
    setParaStyles(client.paragraphStyleList());
    setCharStyles(client.characterStyleList());
    setObjStyles(client.objectStyleList());
  }, [client, epoch]);

  useEffect(() => {
    if (!client || !typeCtx) {
      setActivePara(null);
      setActiveChar(null);
      return;
    }
    const pAttrs = client.paragraphAttrs(typeCtx.storyId, typeCtx.paraIdx);
    setActivePara(pAttrs?.paragraphStyle ?? null);
    const rAttrs = client.firstRunAttrs(typeCtx.storyId, typeCtx.paraIdx);
    // RunAttrs returned by firstRunAttrs doesn't include
    // character_style — pass via the same channel later. M3
    // approximation: we can't currently highlight the active
    // character style; leave null until we plumb it through.
    setActiveChar(null);
    void rAttrs;
  }, [client, typeCtx, epoch]);

  if (!client) return null;

  function applyParagraphStyle(id: string | null) {
    if (!client || !typeCtx) return;
    client.applyCommand({
      type: "SetParagraphAttr",
      story: { id: typeCtx.storyId },
      para: typeCtx.paraIdx,
      attr: { key: "ParagraphStyle", value: id },
    });
    onCommandApplied();
  }

  function applyCharacterStyle(id: string | null) {
    if (!client || !typeCtx) return;
    const text = client.paragraphText(typeCtx.storyId, typeCtx.paraIdx) ?? "";
    const len = new TextEncoder().encode(text).length;
    client.applyCommand({
      type: "SetRunAttr",
      story: { id: typeCtx.storyId },
      para: typeCtx.paraIdx,
      byte_from: 0,
      byte_to: len,
      attr: { key: "CharacterStyle", value: id },
    });
    onCommandApplied();
  }

  function applyObjectStyle(id: string | null) {
    if (!client || !selection) return;
    client.applyCommand({
      type: "ApplyObjectStyle",
      frame: { kind: "Frame", id: selection },
      style: id,
    });
    onCommandApplied();
  }

  return (
    <>
      {typeCtx && (
        <Section title="Paragraph Styles">
          <StyleRow
            id={null}
            name="[No paragraph style]"
            active={activePara === null}
            onApply={() => applyParagraphStyle(null)}
          />
          {paraStyles.map((s) => (
            <StyleRow
              key={s.id}
              id={s.id}
              name={s.name}
              active={activePara === s.id}
              onApply={() => applyParagraphStyle(s.id)}
            />
          ))}
        </Section>
      )}

      {typeCtx && (
        <Section title="Character Styles">
          <StyleRow
            id={null}
            name="[None]"
            active={activeChar === null}
            onApply={() => applyCharacterStyle(null)}
          />
          {charStyles.map((s) => (
            <StyleRow
              key={s.id}
              id={s.id}
              name={s.name}
              active={activeChar === s.id}
              onApply={() => applyCharacterStyle(s.id)}
            />
          ))}
        </Section>
      )}

      {selection && !typeCtx && (
        <Section title="Object Styles">
          <StyleRow
            id={null}
            name="[None]"
            active={false}
            onApply={() => applyObjectStyle(null)}
          />
          {objStyles.map((s) => (
            <StyleRow
              key={s.id}
              id={s.id}
              name={s.name}
              active={false}
              onApply={() => applyObjectStyle(s.id)}
            />
          ))}
        </Section>
      )}
    </>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <h3>{props.title}</h3>
      <div className="section-body">{props.children}</div>
    </div>
  );
}

function StyleRow(props: {
  id: string | null;
  name: string;
  active: boolean;
  onApply: () => void;
}) {
  return (
    <button
      type="button"
      className={`style-row${props.active ? " active" : ""}`}
      onClick={props.onApply}
      title={props.id ?? "(no style)"}
    >
      {props.name}
    </button>
  );
}
