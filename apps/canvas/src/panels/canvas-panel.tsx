// Canvas panel — the center viewport of the shell.
//
// Owns the gesture/hit orchestration callbacks that previously
// lived as inline closures in CanvasApp. Reads from the five
// state contexts + the instrumentation context; the only
// panel-local state is the legacy `hitSelection` (used by the
// overlay to highlight the most recent hit) and the container
// `<div>` ref for ResizeObserver bookkeeping.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  useCanvasClient,
  useCamera,
  useContentSelection,
  useDocument,
  useInstrumentation,
  useSelection,
  type PanelProps,
} from "@verso/shell";

import type { SelectionMode } from "../channel/protocol";
import { ViewportCanvas, type SelectionState } from "../ui/ViewportCanvas";

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
  } = useSelection();
  const { caret, selectionRects, setContentSelection } = useContentSelection();
  const { fps, gpuActive, layoutCacheStats } = useInstrumentation();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hitSelection, setHitSelection] = useState<SelectionState | null>(null);

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
          void client
            .setElementSelection([s.hit.element], mode)
            .then((ids) => {
              setElementSelection(ids);
              return client.elementGeometry(ids);
            })
            .then(setElementGeometry)
            .catch(() => {
              /* worker reload / disconnect — fine */
            });
        } else if (!modifiers?.shift && !modifiers?.cmd) {
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
      pageId: import("../channel/protocol").PageId,
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
    (groupId: string) => {
      void client
        .groupLeaves(groupId)
        .then((ids) => client.setElementSelection(ids, "replace"))
        .then((ids) => {
          setElementSelection(ids);
          return client.elementGeometry(ids);
        })
        .then(setElementGeometry)
        .catch(() => {});
    },
    [client, setElementGeometry, setElementSelection],
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
        caret={caret}
        selectionRects={selectionRects}
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
