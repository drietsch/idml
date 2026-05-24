// Canvas-backed viewport.
//
// Owns a real `<canvas>` element; on mount calls
// `transferControlToOffscreen()` and hands the OffscreenCanvas to the
// worker via `CanvasClient.attachCanvas`. After that, the worker
// fully owns rendering — this component's only jobs are:
//
//   1. Host the `<canvas>` element + its hosting div.
//   2. Translate pointer + wheel events into camera updates
//      (`CanvasClient.setCamera`).
//   3. Track viewport size via ResizeObserver and forward to worker.
//   4. Render a small HUD overlay (DOM) on top of the canvas.
//
// Per spec AC-V-7 the main thread does no rendering work here — the
// `<canvas>` is opaque from React's perspective after the
// `transferControlToOffscreen` call.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CanvasClient } from "../channel/client";
import { viewportToDoc, type Camera } from "../channel/camera";
import type {
  HitResult,
  PageId,
  ResolutionResult,
  RunningHeader,
} from "../channel/protocol";
import { documentBounds, fitCamera, layoutPages, zoomAt, type PageRect } from "./layout";
import { Overlay } from "./Overlay";

export interface SelectionState {
  pageId: PageId;
  /** Document-space point that was clicked. Used by overlays to draw a marker. */
  docPoint: [number, number];
  hit: HitResult;
}

export interface ViewportCanvasProps {
  client: CanvasClient;
  pageIds: ReadonlyArray<PageId>;
  pageSizesPt: ReadonlyArray<readonly [number, number]>;
  camera: Camera;
  onCameraChange: (cam: Camera) => void;
  /** Called when the user clicks (not drags) on a page. */
  onHit?: (selection: SelectionState | null) => void;
  /** Current selection; used by the overlay to highlight the hit point + page. */
  selection?: SelectionState | null;
  /** Main-thread FPS, sampled via rAF. Shown in the HUD. */
  fps?: number;
  /** Whether the worker successfully initialised WebGPU. `null` while undetermined. */
  gpuActive?: boolean | null;
  /** Tier 3 resolution result — anchor table + per-anchor page numbers. */
  resolution?: ResolutionResult | null;
}

const CLICK_DRAG_THRESHOLD_PX = 4;

export function ViewportCanvas(props: ViewportCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Set once we've transferred to the worker — guards against re-transfer (illegal). */
  const transferredRef = useRef(false);

  const dragStateRef = useRef<{
    startCam: Camera;
    startPointer: [number, number];
    /** Largest pointer-delta seen during this gesture, in CSS px. */
    maxDelta: number;
  } | null>(null);

  // Document-space layout — only used to compute initial fit-to-document.
  const rects = useMemo(
    () => layoutPages(props.pageSizesPt),
    [props.pageSizesPt],
  );

  // Mount: transfer the canvas. Cleanup: nothing — once an
  // OffscreenCanvas is transferred, the worker owns it for its
  // entire life. Re-mounting the React component is destructive
  // anyway (camera state resets), and the user flow that triggers
  // it (new document via file drop) also resets the worker model.
  useEffect(() => {
    if (transferredRef.current) return;
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const { width, height } = wrapper.getBoundingClientRect();
    const dpr = self.devicePixelRatio || 1;
    // The HTMLCanvasElement's CSS size stays driven by the
    // wrapper's flex layout; what we transfer is the *bitmap*
    // dimensions. Match them to the wrapper at attach time.
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const offscreen = canvas.transferControlToOffscreen();
    props.client.attachCanvas(offscreen, dpr, width, height);
    transferredRef.current = true;
    // Trigger initial fit-to-document.
    if (rects.length > 0 && width > 10 && height > 10) {
      props.onCameraChange(fitCamera(width, height, documentBounds(rects)));
    }
    // We deliberately depend on `client` only — fit-to-document
    // takes the current rects/dims; subsequent re-fits are driven
    // by the document-id signature effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.client]);

  // ResizeObserver: post size updates to the worker so the
  // OffscreenCanvas bitmap matches the device-pixel viewport.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver(() => {
      const r = wrapper.getBoundingClientRect();
      if (r.width === lastW && r.height === lastH) return;
      lastW = r.width;
      lastH = r.height;
      const dpr = self.devicePixelRatio || 1;
      if (transferredRef.current) {
        props.client.resizeCanvas(dpr, r.width, r.height);
      }
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [props.client]);

  // Re-fit camera when the document changes (page-id signature).
  const pageIdSig = useMemo(() => props.pageIds.join("|"), [props.pageIds]);
  const lastFitSigRef = useRef<string>("");
  useEffect(() => {
    if (pageIdSig === lastFitSigRef.current) return;
    if (!wrapperRef.current || rects.length === 0) return;
    const { width, height } = wrapperRef.current.getBoundingClientRect();
    if (width < 10 || height < 10) return;
    props.onCameraChange(fitCamera(width, height, documentBounds(rects)));
    lastFitSigRef.current = pageIdSig;
  }, [pageIdSig, rects, props]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.button !== 1) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        startCam: props.camera,
        startPointer: [e.clientX, e.clientY],
        maxDelta: 0,
      };
    },
    [props.camera],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startPointer[0];
      const dy = e.clientY - drag.startPointer[1];
      const delta = Math.hypot(dx, dy);
      if (delta > drag.maxDelta) drag.maxDelta = delta;
      props.onCameraChange({
        scale: drag.startCam.scale,
        tx: drag.startCam.tx + dx,
        ty: drag.startCam.ty + dy,
      });
    },
    [props],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragStateRef.current = null;
      // Click vs drag: if the pointer barely moved, treat it as a
      // click and route through the worker's hit-tester.
      if (drag.maxDelta <= CLICK_DRAG_THRESHOLD_PX && props.onHit) {
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // Camera maps doc-space (pt) → viewport CSS px; invert for
        // the hit-test query.
        const [docX, docY] = viewportToDoc(props.camera, cx, cy);
        const containing = findContainingPage(rects, props.pageIds, docX, docY);
        if (containing) {
          const [pageId, pageRect] = containing;
          const docPoint: [number, number] = [docX - pageRect.x, docY - pageRect.y];
          void (async () => {
            try {
              const reply = await props.client.send({
                kind: "hitTest",
                payload: { pageId, docPoint, filter: "any" },
              });
              if (reply.kind === "hitResult") {
                props.onHit?.({ pageId, docPoint, hit: reply.payload });
              }
            } catch (err) {
              console.warn("hitTest failed:", err);
            }
          })();
        } else {
          // Clicked on the inter-page grey — clear the selection.
          props.onHit?.(null);
        }
      }
    },
    [props, rects],
  );

  function findContainingPage(
    rects: ReadonlyArray<PageRect>,
    ids: ReadonlyArray<PageId>,
    docX: number,
    docY: number,
  ): [PageId, PageRect] | null {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (docX >= r.x && docX <= r.x + r.w && docY >= r.y && docY <= r.y + r.h) {
        return [ids[i], r];
      }
    }
    return null;
  }

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.005);
        props.onCameraChange(zoomAt(props.camera, cx, cy, factor));
      } else {
        props.onCameraChange({
          scale: props.camera.scale,
          tx: props.camera.tx - e.deltaX,
          ty: props.camera.ty - e.deltaY,
        });
      }
    },
    [props],
  );

  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <canvas ref={canvasRef} style={canvasStyle} />
      <Overlay
        camera={props.camera}
        pageIds={props.pageIds}
        pageRects={rects}
        selection={props.selection ?? null}
        resolution={props.resolution ?? null}
        width={wrapperRef.current?.clientWidth ?? 0}
        height={wrapperRef.current?.clientHeight ?? 0}
      />
      <ViewportHud
        camera={props.camera}
        pageCount={props.pageIds.length}
        pageIds={props.pageIds}
        pageRects={rects}
        selection={props.selection ?? null}
        fps={props.fps ?? 0}
        gpuActive={props.gpuActive ?? null}
        anchorCount={
          props.resolution ? Object.keys(props.resolution.numbering).length : 0
        }
        footnoteCount={props.resolution?.footnoteCount ?? 0}
        runningHeaders={props.resolution?.runningHeaders ?? []}
      />
    </div>
  );
}

function ViewportHud(props: {
  camera: Camera;
  pageCount: number;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  selection: SelectionState | null;
  fps: number;
  gpuActive: boolean | null;
  anchorCount: number;
  footnoteCount: number;
  runningHeaders: ReadonlyArray<RunningHeader>;
}) {
  const sel = props.selection;
  const gpuBadge = props.gpuActive === null
    ? { label: "…", color: "#9ca3af" }
    : props.gpuActive
      ? { label: "GPU", color: "#10b981" }
      : { label: "CPU", color: "#f59e0b" };
  const fpsColor =
    props.fps === 0
      ? "#9ca3af"
      : props.fps >= 55
        ? "#10b981"
        : props.fps >= 30
          ? "#f59e0b"
          : "#ef4444";
  return (
    <div style={hudStyle}>
      <span style={{ color: gpuBadge.color, fontWeight: 600 }}>
        {gpuBadge.label}
      </span>
      {props.fps > 0 && (
        <span style={{ color: fpsColor }}>{props.fps} fps</span>
      )}
      <span>{props.pageCount} pages</span>
      {props.anchorCount > 0 && (
        <span style={{ color: "#34d399" }}>{props.anchorCount} ⚓</span>
      )}
      {props.footnoteCount > 0 && (
        <span style={{ color: "#a78bfa" }}>{props.footnoteCount} fn</span>
      )}
      {(() => {
        // Show the running header for the page closest to viewport
        // centre — gives a "where am I" anchor for long documents.
        const [vw, vh] = [
          // approximate viewport size from camera scale + canvas dims
          800,
          600,
        ];
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - props.camera.tx) / Math.max(1e-6, props.camera.scale);
        const docY = (cy - props.camera.ty) / Math.max(1e-6, props.camera.scale);
        let currentIdx = 0;
        let bestDistSq = Infinity;
        for (let i = 0; i < props.pageRects.length; i++) {
          const r = props.pageRects[i];
          const px = r.x + r.w / 2;
          const py = r.y + r.h / 2;
          const dsq = (px - docX) ** 2 + (py - docY) ** 2;
          if (dsq < bestDistSq) {
            bestDistSq = dsq;
            currentIdx = i;
          }
        }
        const header = props.runningHeaders[currentIdx];
        if (header?.text) {
          const truncated =
            header.text.length > 24 ? `${header.text.slice(0, 23)}…` : header.text;
          return <span style={{ color: "#fde047" }}>§ {truncated}</span>;
        }
        return null;
      })()}
      <span>{(props.camera.scale * 100).toFixed(0)}%</span>
      <span>
        {props.camera.tx.toFixed(0)}, {props.camera.ty.toFixed(0)}
      </span>
      {sel && (
        <span style={hudSelStyle}>
          {sel.hit.frameId
            ? `frame ${sel.hit.frameId}`
            : `page ${sel.pageId} (no frame)`}
        </span>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "#e5e7eb",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
};

const canvasStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};

const hudStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  right: 8,
  display: "flex",
  gap: 12,
  background: "rgba(17, 24, 39, 0.85)",
  color: "white",
  padding: "4px 10px",
  borderRadius: 4,
  fontFamily: "monospace",
  fontSize: 11,
  pointerEvents: "none",
};

const hudSelStyle: React.CSSProperties = {
  color: "#fbbf24", // amber — highlights the click result
};
