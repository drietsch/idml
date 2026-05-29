// Canvas panel — the center viewport of the shell.
//
// Owns the gesture/hit orchestration callbacks that previously
// lived as inline closures in CanvasApp. Reads from the five
// state contexts + the instrumentation context; the only
// panel-local state is the legacy `hitSelection` (used by the
// overlay to highlight the most recent hit) and the container
// `<div>` ref for ResizeObserver bookkeeping.

import { useCallback, useEffect, useRef } from "react";

import {
  useCanvasClient,
  useCamera,
  useContentSelection,
  useDocument,
  useInstrumentation,
  useOverlaySignals,
  useSelection,
  type PanelProps,
  type SelectionState,
} from "@verso/shell";

import type { SelectionMode } from "@verso/client";
import { ViewportCanvas } from "../ui/ViewportCanvas";

export function CanvasPanel(_props: PanelProps) {
  const client = useCanvasClient();
  const { camera, setCamera, setViewportSize } = useCamera();
  const { handle, resolution } = useDocument();
  const {
    elementSelection,
    setElementSelection,
    setElementGeometry,
    elementGeometry,
    activeTool,
    activeGroup,
    setActiveGroup,
  } = useSelection();
  const { setContentSelection } = useContentSelection();
  const { fps, gpuActive, layoutCacheStats } = useInstrumentation();
  const { hitSelection, setHitSelection } = useOverlaySignals();

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Track the panel's container size so the camera context's
  // viewportSize stays in sync. Previously the shell observed its
  // own mainStyle wrapper; after the dockview swap each panel
  // observes its own container.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewportSize([r.width, r.height]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewportSize]);

  // Track L — Escape exits the active group (matches InDesign's
  // group-escape UX). Skips when an editable element has focus so
  // typing in the command palette / inspector doesn't accidentally
  // pop the group.
  useEffect(() => {
    if (activeGroup === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      e.preventDefault();
      setActiveGroup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGroup, setActiveGroup]);

  const onHit = useCallback(
    (s: SelectionState | null, modifiers?: { shift?: boolean; cmd?: boolean }) => {
      setHitSelection(s);
      if (activeTool === "select") {
        const mode: SelectionMode = modifiers?.shift
          ? "add"
          : modifiers?.cmd
            ? "toggle"
            : "replace";
        if (s && s.hit.element) {
          // Track L — selection target depends on `activeGroup`:
          //   activeGroup === null
          //       → click selects the OUTERMOST containing group
          //         (groupChain[0]) so transforms apply to the
          //         whole group. Falls back to the hit element
          //         when the click isn't inside any group.
          //   activeGroup === <gid>
          //       → click stays scoped to leaves whose chain
          //         includes <gid>. Hits OUTSIDE the active
          //         group exit it and select that element
          //         (matches InDesign's "group escape" UX).
          const chain = s.hit.groupChain ?? [];
          let target = s.hit.element;
          let nextActive = activeGroup;
          if (activeGroup === null) {
            if (chain.length > 0) {
              target = { kind: "group" as const, id: chain[0] };
            }
          } else if (!chain.includes(activeGroup)) {
            // Hit fell outside the active group — exit and
            // select what the user actually clicked. If the
            // outside element is itself in a different group,
            // select that group (mirrors the no-activeGroup
            // branch above).
            nextActive = null;
            if (chain.length > 0) {
              target = { kind: "group" as const, id: chain[0] };
            }
          }
          if (nextActive !== activeGroup) setActiveGroup(nextActive);
          void client
            .setElementSelection([target], mode)
            .then((ids) => {
              setElementSelection(ids);
              return client.elementGeometry(ids);
            })
            .then(setElementGeometry)
            .catch(() => {
              /* worker reload / disconnect — fine */
            });
        } else if (!modifiers?.shift && !modifiers?.cmd) {
          // Empty hit → clear selection AND exit any active
          // group (clicking on the pasteboard escapes everything).
          if (activeGroup !== null) setActiveGroup(null);
          void client
            .setElementSelection([], "replace")
            .then(() => {
              setElementSelection([]);
              setElementGeometry([]);
            })
            .catch(() => {});
        }
        setContentSelection(null);
        return;
      }
      // Text tool — click on text → caret at offset.
      if (
        s &&
        s.hit.storyId &&
        s.hit.offsetWithinStory !== null &&
        s.hit.offsetWithinStory !== undefined
      ) {
        setContentSelection({
          storyId: s.hit.storyId,
          start: s.hit.offsetWithinStory,
          end: s.hit.offsetWithinStory,
          affinity: false,
        });
      } else {
        setContentSelection(null);
      }
    },
    [
      activeTool,
      client,
      setContentSelection,
      setElementGeometry,
      setElementSelection,
    ],
  );

  const onMarquee = useCallback(
    (
      pageId: import("@verso/client").PageId,
      rect: [number, number, number, number],
      modifiers?: { shift?: boolean; cmd?: boolean },
    ) => {
      const mode: SelectionMode = modifiers?.shift
        ? "add"
        : modifiers?.cmd
          ? "toggle"
          : "replace";
      void client
        .marqueeHits(pageId, rect)
        .then((ids) => client.setElementSelection(ids, mode))
        .then((ids) => {
          setElementSelection(ids);
          return client.elementGeometry(ids);
        })
        .then(setElementGeometry)
        .catch(() => {});
    },
    [client, setElementGeometry, setElementSelection],
  );

  const onGestureCommitted = useCallback(() => {
    if (elementSelection.length === 0) return;
    void client
      .elementGeometry(elementSelection)
      .then(setElementGeometry)
      .catch(() => {});
  }, [client, elementSelection, setElementGeometry]);

  const onDoubleClickGroup = useCallback(
    (groupId: string, hitElement: import("@verso/client").ElementId | null) => {
      // Track L — double-click enters the group: set
      // `activeGroup` AND select the leaf the user clicked.
      // Subsequent single-clicks stay scoped to that group's
      // members via `onHit`'s activeGroup branch; Escape (and
      // empty-pasteboard clicks) exit.
      setActiveGroup(groupId);
      const target = hitElement;
      if (!target) return;
      void client
        .setElementSelection([target], "replace")
        .then((ids) => {
          setElementSelection(ids);
          return client.elementGeometry(ids);
        })
        .then(setElementGeometry)
        .catch(() => {});
    },
    [client, setActiveGroup, setElementGeometry, setElementSelection],
  );

  if (!handle || handle.pageCount === 0) {
    return (
      <div style={emptyStyle}>
        <p style={{ fontSize: 14, color: "#555" }}>
          Drop an IDML file in the header to begin.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      <ViewportCanvas
        client={client}
        pageIds={handle.pageIds}
        pageSizesPt={handle.pageSizesPt}
        camera={camera}
        onCameraChange={setCamera}
        activeTool={activeTool}
        elementSelection={elementSelection}
        elementGeometry={elementGeometry}
        onHit={onHit}
        onMarquee={onMarquee}
        onGestureCommitted={onGestureCommitted}
        onDoubleClickGroup={onDoubleClickGroup}
        selection={hitSelection}
        fps={fps}
        gpuActive={gpuActive}
        resolution={resolution}
        layoutCacheStats={layoutCacheStats}
      />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const emptyStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f3f4f6",
};
