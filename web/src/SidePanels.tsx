// Layers / Pages / Swatches panels mounted on the left side of the
// editor. M3 keeps these focused: read-the-list, click-to-toggle,
// click-to-apply. Everything routes through EditorClient commands so
// undo, persistence, and the patch stream all work as expected.

import { useEffect, useState } from "react";
import type { EditorClient } from "./editor/EditorClient";
import { StylePanels } from "./StylePanels";
import type { TypeContext } from "./TextEditOverlay";

interface Props {
  client: EditorClient | null;
  /** Editor epoch — bumps trigger a re-fetch of every list. */
  epoch: number;
  /** The currently selected frame id (for swatch click-to-apply). */
  selection: string | null;
  /** The currently displayed page index. */
  pageIndex: number;
  onPageNavigate: (idx: number) => void;
  /** Active text caret, if any (for style-panel context). */
  typeCtx: TypeContext | null;
  onCommandApplied: () => void;
}

export function SidePanels({
  client,
  epoch,
  selection,
  pageIndex,
  onPageNavigate,
  typeCtx,
  onCommandApplied,
}: Props) {
  const [layers, setLayers] = useState<
    { id: string; name: string; visible: boolean; locked: boolean }[]
  >([]);
  const [pages, setPages] = useState<{ id: string; master: string | null }[]>([]);
  const [masters, setMasters] = useState<{ id: string; name: string }[]>([]);
  const [swatches, setSwatches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!client) {
      setLayers([]);
      setPages([]);
      setMasters([]);
      setSwatches([]);
      return;
    }
    setLayers(client.layerList());
    setPages(client.pageList());
    setMasters(client.masterSpreadList());
    setSwatches(client.swatchList());
  }, [client, epoch]);

  if (!client) return null;

  return (
    <aside className="side-panels" onPointerDown={(e) => e.stopPropagation()}>
      <Section title="Pages">
        {pages.length === 0 ? (
          <Empty>no pages</Empty>
        ) : (
          pages.map((p, i) => (
            <div
              className={`row page-row${i === pageIndex ? " active" : ""}`}
              key={p.id}
            >
              <button
                type="button"
                className="page-jump"
                onClick={() => onPageNavigate(i)}
                title="navigate to this page"
              >
                {i + 1}
              </button>
              <select
                value={p.master ?? ""}
                onChange={(e) => {
                  client.applyCommand({
                    type: "ApplyMasterToPage",
                    page: { kind: "Page", id: p.id },
                    master: e.target.value || null,
                  });
                  onCommandApplied();
                }}
                title="applied master"
              >
                <option value="">— none —</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
      </Section>

      <Section title="Layers">
        {layers.length === 0 ? (
          <Empty>no layers</Empty>
        ) : (
          layers.map((l) => (
            <div className="row" key={l.id}>
              <input
                type="checkbox"
                checked={l.visible}
                onChange={(e) => {
                  client.applyCommand({
                    type: "SetLayerVisible",
                    layer_id: l.id,
                    visible: e.target.checked,
                  });
                  onCommandApplied();
                }}
                title="visible"
              />
              <input
                type="checkbox"
                checked={l.locked}
                onChange={(e) => {
                  client.applyCommand({
                    type: "SetLayerLocked",
                    layer_id: l.id,
                    locked: e.target.checked,
                  });
                  onCommandApplied();
                }}
                title="locked"
              />
              <span className="row-label">{l.name}</span>
            </div>
          ))
        )}
      </Section>

      <StylePanels
        client={client}
        epoch={epoch}
        typeCtx={typeCtx}
        selection={selection}
        onCommandApplied={onCommandApplied}
      />

      <Section title="Swatches">
        {swatches.length === 0 ? (
          <Empty>no swatches</Empty>
        ) : (
          swatches.map((s) => (
            <div className="row" key={s.id}>
              <button
                type="button"
                className="swatch-apply"
                disabled={!selection}
                onClick={() => {
                  if (!selection) return;
                  client.applyCommand({
                    type: "SetFrameFill",
                    frame: { kind: "Frame", id: selection },
                    color: s.id,
                  });
                  onCommandApplied();
                }}
                title={`apply ${s.id} as fill`}
              >
                fill
              </button>
              <button
                type="button"
                className="swatch-apply"
                disabled={!selection}
                onClick={() => {
                  if (!selection) return;
                  client.applyCommand({
                    type: "SetFrameStroke",
                    frame: { kind: "Frame", id: selection },
                    color: s.id,
                    weight_pt: null,
                  });
                  onCommandApplied();
                }}
                title={`apply ${s.id} as stroke`}
              >
                stroke
              </button>
              <span className="row-label" title={s.id}>
                {s.name}
              </span>
            </div>
          ))
        )}
      </Section>
    </aside>
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

function Empty(props: { children: React.ReactNode }) {
  return <div className="empty">{props.children}</div>;
}
