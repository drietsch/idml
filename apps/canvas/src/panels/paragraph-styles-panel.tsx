// SDK Phase 5 — Paragraph Styles panel (expert leaf).
//
// Per docs/verso/panel-catalog-and-sdk-extension.md §5.3 + §5.5,
// Style panels are hybrids: composition chrome wrapping an expert
// "apply on click" list. This v1 is a thin expert leaf — the
// chrome polish (new/edit/delete affordances) lands when the
// CreateParagraphStyle / EditParagraphStyle / DeleteParagraphStyle
// Operations ship.
//
// Reads: `documentCollection:paragraphStyles` (via the existing
// `verso.paragraphStyles()` host fn) on mount + on
// `mutationApplied`.
// Writes: `selectionProperty:appliedParagraphStyle` (via
// `client.mutate({ op: "setElementProperty", … })`) on row click,
// targeting the current content selection mapped to a
// `ElementId.storyRange`.

import { useEffect, useState } from "react";

import {
  useCanvasClient,
  useContentSelection,
} from "@verso/shell";
import type { ElementId } from "@verso/client";

interface ParagraphStyleSummary {
  selfId: string;
  name: string;
  basedOn: string | null;
}

export function ParagraphStylesPanel() {
  const client = useCanvasClient();
  const { contentSelection } = useContentSelection();
  const [styles, setStyles] = useState<ParagraphStyleSummary[] | null>(null);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);

  // Fetch styles on mount + on every mutation (a new style might
  // have been created). Cheap re-fetch — paragraphStyles() is a
  // BTreeMap walk + serialize.
  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      void client
        .executeScript("verso.paragraphStyles()")
        .then((res) => {
          if (cancelled) return;
          if (res.error) {
            setStyles([]);
            return;
          }
          const raw = res.output[0];
          if (!raw) {
            setStyles([]);
            return;
          }
          try {
            setStyles(JSON.parse(raw));
          } catch {
            setStyles([]);
          }
        });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refetch();
        // Re-fetch the active style by inspecting the current range.
        if (contentSelection) {
          void client
            .executeScript(
              `(() => {
                const sel = ${JSON.stringify(contentSelection)};
                const props = JSON.parse(
                  verso.inspect("storyRange:" + sel.storyId + "@" + sel.start + ".." + sel.end)
                );
                const entry = props.entries.find(e => e.path === "appliedParagraphStyle");
                return entry && entry.value ? entry.value.value : null;
              })()`,
            )
            .then((res) => {
              if (cancelled || res.error) return;
              try {
                const raw = res.output[0];
                setActiveStyle(raw ? JSON.parse(raw) : null);
              } catch {
                /* ignore */
              }
            });
        }
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, contentSelection]);

  function apply(styleId: string) {
    if (!contentSelection) return;
    const elementId = {
      kind: "storyRange",
      id: {
        story_id: contentSelection.storyId,
        start: contentSelection.start,
        end: contentSelection.end,
      },
    } as unknown as ElementId;
    void client.mutate({
      op: "setElementProperty",
      args: {
        elementId,
        path: "appliedParagraphStyle" as never,
        value: { type: "text", value: styleId } as never,
      },
    });
    setActiveStyle(styleId);
  }

  if (!styles) {
    return (
      <div
        className="p-3 text-sm text-muted-foreground"
        data-paragraph-styles-panel="loading"
      >
        Loading styles…
      </div>
    );
  }

  return (
    <div className="p-3 text-sm" data-paragraph-styles-panel="ready">
      <div className="text-xs text-muted-foreground uppercase pb-2 border-b border-input">
        Paragraph Styles
      </div>
      {styles.length === 0 ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-empty-styles
        >
          No paragraph styles in this document.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 pt-1" data-style-list>
          {styles.map((s) => (
            <li key={s.selfId}>
              <button
                type="button"
                className={`w-full text-left px-2 py-1 rounded hover:bg-muted/60 ${
                  activeStyle === s.selfId ? "bg-muted/80" : ""
                }`}
                data-style-id={s.selfId}
                data-active={activeStyle === s.selfId ? "true" : "false"}
                disabled={!contentSelection}
                onClick={() => apply(s.selfId)}
              >
                {s.name}
                {s.basedOn ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ← {s.basedOn}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!contentSelection ? (
        <div
          className="pt-2 text-xs text-muted-foreground"
          data-no-selection
        >
          Select text to apply a style.
        </div>
      ) : null}
    </div>
  );
}
