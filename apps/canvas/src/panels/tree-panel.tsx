// Inspector P1 — scene-tree outline panel. Click a row to select
// the corresponding frame; selection mirrors in both directions
// because the panel reads `useSelection()` for the highlight.

import { useCallback, useEffect, useState } from "react";

import { useCanvasClient, useSelection } from "@paged-media/shell";

import type { ElementId, SceneTreeNode } from "@paged-media/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

export function TreePanel(_: PanelProps) {
  const client = useCanvasClient();
  const { elementSelection, setElementSelection, setElementGeometry } =
    useSelection();
  const [roots, setRoots] = useState<SceneTreeNode[]>([]);

  // Re-fetch on document load + any structural mutation. Lightweight
  // payload; no need for delta-fetching in v1.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void client
        .sceneTree()
        .then((next) => {
          if (!cancelled) setRoots(next);
        })
        .catch(() => {
          if (!cancelled) setRoots([]);
        });
    };
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
    return () => {
      cancelled = true;
      off();
    };
  }, [client]);

  const selectedKey = useMemo_selectionKey(elementSelection);

  const onPick = useCallback(
    (id: ElementId) => {
      void client
        .setElementSelection([id], "replace")
        .then((ids) => {
          setElementSelection(ids);
          return client.elementGeometry(ids);
        })
        .then(setElementGeometry)
        .catch(() => {});
    },
    [client, setElementSelection, setElementGeometry],
  );

  if (roots.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground" data-tree="empty">
        No document loaded.
      </div>
    );
  }

  return (
    <div className="p-2 text-sm" data-tree="ready">
      <ul className="space-y-0.5">
        {roots.map((node, i) => (
          <TreeRow
            key={i}
            node={node}
            depth={0}
            selectedKey={selectedKey}
            onPick={onPick}
          />
        ))}
      </ul>
    </div>
  );
}

function TreeRow(props: {
  node: SceneTreeNode;
  depth: number;
  selectedKey: string | null;
  onPick: (id: ElementId) => void;
}) {
  const { node, depth, selectedKey, onPick } = props;
  const key = node.id ? `${node.id.kind}:${node.id.id}` : null;
  const isSelected = key !== null && key === selectedKey;
  const indent = { paddingLeft: 8 + depth * 12 } as const;
  return (
    <li>
      <button
        type="button"
        className={`w-full text-left px-1 py-0.5 rounded hover:bg-muted/60 ${
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
        style={indent}
        data-tree-row={key ?? node.kind}
        onClick={() => node.id && onPick(node.id)}
        disabled={!node.id}
      >
        <span className="text-xs uppercase opacity-70 mr-2">{node.kind}</span>
        <span>{node.label}</span>
      </button>
      {(node.children?.length ?? 0) > 0 && (
        <ul className="space-y-0.5">
          {(node.children ?? []).map((child, i) => (
            <TreeRow
              key={i}
              node={child}
              depth={depth + 1}
              selectedKey={selectedKey}
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Single-element selection key so the row highlight short-circuits
// when nothing meaningful changed.
function useMemo_selectionKey(sel: ElementId[]): string | null {
  if (sel.length !== 1) return null;
  return `${sel[0].kind}:${sel[0].id}`;
}
