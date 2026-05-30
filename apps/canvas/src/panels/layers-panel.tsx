// Track M.2-M.7 — Layers panel. Reads layers from the worker on
// mount + after every committed mutation (any of mutationApplied /
// undoApplied / redoApplied). Each row renders the eye / lock /
// printable toggles plus the layer's name + drag handle + trash
// icon.
//
// Wire ops dispatched per interaction:
//   eye        → layerSetVisible
//   lock       → layerSetLocked
//   print      → layerSetPrintable
//   double-click → inline-edit → blur → layerSetName
//   drag-drop  → layerMove
//   + button   → layerInsert
//   trash icon → layerRemove

import { useCallback, useEffect, useState } from "react";

import { useCanvasClient } from "@paged-media/shell";

import type { LayerSummary } from "@paged-media/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

export function LayersPanel(_: PanelProps) {
  const client = useCanvasClient();
  const [layers, setLayers] = useState<LayerSummary[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void client
      .layers()
      .then(setLayers)
      .catch(() => setLayers([]));
  }, [client]);

  useEffect(() => {
    refresh();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "documentLoaded" ||
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refresh();
      }
    });
    return off;
  }, [client, refresh]);

  if (layers.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground" data-layers="empty">
        No layers.
      </div>
    );
  }

  const onToggle = (
    id: string,
    field: "visible" | "locked" | "printable",
    next: boolean,
  ) => {
    if (field === "visible") {
      void client
        .mutate({ op: "layerSetVisible", args: { layerId: id, visible: next } })
        .catch(() => {});
    } else if (field === "locked") {
      void client
        .mutate({ op: "layerSetLocked", args: { layerId: id, locked: next } })
        .catch(() => {});
    } else {
      void client
        .mutate({
          op: "layerSetPrintable",
          args: { layerId: id, printable: next },
        })
        .catch(() => {});
    }
  };

  const onAdd = () => {
    void client
      .mutate({ op: "layerInsert", args: { position: 0, name: "Layer" } })
      .catch(() => {});
  };

  const onRemove = (id: string) => {
    void client
      .mutate({ op: "layerRemove", args: { layerId: id } })
      .catch(() => {});
  };

  const onRenameCommit = (id: string) => {
    const trimmed = draftName.trim();
    setEditing(null);
    if (trimmed === "") return;
    void client
      .mutate({ op: "layerSetName", args: { layerId: id, name: trimmed } })
      .catch(() => {});
  };

  const onDrop = (toIndex: number) => {
    if (dragFrom === null) return;
    const fromLayer = layers[dragFrom];
    setDragFrom(null);
    if (!fromLayer || toIndex === dragFrom) return;
    void client
      .mutate({
        op: "layerMove",
        args: { layerId: fromLayer.selfId, newIndex: toIndex },
      })
      .catch(() => {});
  };

  return (
    <div className="text-sm" data-layers="ready">
      <div className="flex justify-end p-1 border-b border-input">
        <button
          type="button"
          className="px-2 py-0.5 rounded hover:bg-muted/60"
          data-action="add-layer"
          onClick={onAdd}
        >
          + Layer
        </button>
      </div>
      <ul>
        {layers.map((layer, idx) => (
          <li
            key={layer.selfId}
            className="flex items-center gap-1 px-2 py-1 hover:bg-muted/40 border-b border-input/30"
            data-layer-id={layer.selfId}
            data-layer-index={idx}
            draggable
            onDragStart={() => setDragFrom(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(idx)}
          >
            <button
              type="button"
              title={layer.visible ? "hide layer" : "show layer"}
              data-action="toggle-visible"
              onClick={() => onToggle(layer.selfId, "visible", !layer.visible)}
              className="w-5 h-5"
            >
              {layer.visible ? "👁" : "⊘"}
            </button>
            <button
              type="button"
              title={layer.locked ? "unlock layer" : "lock layer"}
              data-action="toggle-locked"
              onClick={() => onToggle(layer.selfId, "locked", !layer.locked)}
              className="w-5 h-5"
            >
              {layer.locked ? "🔒" : "🔓"}
            </button>
            <button
              type="button"
              title={layer.printable ? "disable printing" : "enable printing"}
              data-action="toggle-printable"
              onClick={() =>
                onToggle(layer.selfId, "printable", !layer.printable)
              }
              className="w-5 h-5"
            >
              {layer.printable ? "🖨" : "⊘🖨"}
            </button>
            {editing === layer.selfId ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => onRenameCommit(layer.selfId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === "Escape") {
                    setEditing(null);
                  }
                }}
                className="flex-1 px-1 bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
                data-action="rename"
              />
            ) : (
              <span
                className="flex-1 cursor-text select-none"
                data-action="name"
                onDoubleClick={() => {
                  setEditing(layer.selfId);
                  setDraftName(layer.name ?? "");
                }}
              >
                {layer.name ?? "(unnamed)"}
              </span>
            )}
            <button
              type="button"
              title="delete layer"
              data-action="remove"
              onClick={() => onRemove(layer.selfId)}
              className="px-1 hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
