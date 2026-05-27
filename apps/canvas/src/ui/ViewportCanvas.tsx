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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasClient } from "../channel/client";
import { viewportToDoc, type Camera } from "../channel/camera";
import type {
  CaretGeometry,
  ElementGeometryItem,
  ElementId,
  GestureHandle,
  GestureType,
  HitResult,
  LayoutCacheStats,
  PageId,
  ResizeHandle,
  ResolutionResult,
  RunningHeader,
  SelectionRect,
  SnapLine,
} from "../channel/protocol";
import { documentBounds, fitCamera, layoutPages, zoomAt, type PageRect } from "./layout";
import { Overlay } from "./Overlay";

export interface SelectionState {
  pageId: PageId;
  /** Document-space point that was clicked. Used by overlays to draw a marker. */
  docPoint: [number, number];
  hit: HitResult;
}

export interface PointerModifiers {
  /** Shift held → add to selection. */
  shift: boolean;
  /** Cmd (macOS) or Ctrl (other) held → toggle. */
  cmd: boolean;
}

/** Phase A — page-local marquee rect emitted on pointerup with the
 * select tool, ready to feed `client.marqueeHits`. */
export interface MarqueeRectPageLocal {
  pageId: PageId;
  /** `[top, left, bottom, right]` in page-local pt. */
  rect: [number, number, number, number];
}

export interface ViewportCanvasProps {
  client: CanvasClient;
  pageIds: ReadonlyArray<PageId>;
  pageSizesPt: ReadonlyArray<readonly [number, number]>;
  camera: Camera;
  onCameraChange: (cam: Camera) => void;
  /** Called when the user clicks (not drags) on a page. */
  onHit?: (selection: SelectionState | null, modifiers?: PointerModifiers) => void;
  /** Phase A — called when the user finishes a marquee drag with the
   * select tool. Payload is page-local `[top, left, bottom, right]`. */
  onMarquee?: (
    pageId: PageId,
    rect: [number, number, number, number],
    modifiers?: PointerModifiers,
  ) => void;
  /** Current selection; used by the overlay to highlight the hit point + page. */
  selection?: SelectionState | null;
  /** Main-thread FPS, sampled via rAF. Shown in the HUD. */
  fps?: number;
  /** Whether the worker successfully initialised WebGPU. `null` while undetermined. */
  gpuActive?: boolean | null;
  /** Tier 3 resolution result — anchor table + per-anchor page numbers. */
  resolution?: ResolutionResult | null;
  /** Phase 3 — caret geometry from the worker; null when no selection. */
  caret?: CaretGeometry | null;
  /** Phase 3 — rect-per-line geometry for range selections. */
  selectionRects?: ReadonlyArray<SelectionRect>;
  /** Phase 4 Step 2 — last rebuild's layout-cache stats; HUD badge. */
  layoutCacheStats?: LayoutCacheStats | null;
  /** Phase A — active tool. Default is `select`; `text` falls back to
   * the existing caret/typing pathway. */
  activeTool?: "select" | "text";
  /** Phase A — currently-selected element ids (worker-mirrored). */
  elementSelection?: ReadonlyArray<ElementId>;
  /** Phase A — geometry per selected id for the overlay chrome. */
  elementGeometry?: ReadonlyArray<ElementGeometryItem>;
  /** Phase B — called when the active gesture (translate, …) commits.
   * Caller refreshes the cached element geometry so the chrome lands
   * at the committed position. */
  onGestureCommitted?: () => void;
  /** Phase H — called when the user double-clicks a frame whose hit
   * is nested inside a group. `groupId` is the outermost containing
   * group (group_chain[0]). The caller fetches the group's leaves
   * and replaces the element selection with them so the user can
   * grab the whole group as a unit. */
  onDoubleClickGroup?: (groupId: string) => void;
}

const CLICK_DRAG_THRESHOLD_PX = 4;

export function ViewportCanvas(props: ViewportCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Set once we've transferred to the worker — guards against re-transfer (illegal). */
  const transferredRef = useRef(false);

  const dragStateRef = useRef<{
    /** `pan` is camera-translate; `marquee` is the element-selection
     * rect drag; `gesture` is an in-flight worker gesture (translate,
     * resize, …). Click-vs-drag still uses `maxDelta` for routing
     * through the hit tester. */
    mode: "pan" | "marquee" | "gesture";
    startCam: Camera;
    /** Anchor in doc-space pt (already camera-inverted) — used so the
     * pointer→doc delta survives mid-gesture camera changes. */
    startDoc: [number, number];
    startPointer: [number, number];
    /** Largest pointer-delta seen during this gesture, in CSS px. */
    maxDelta: number;
    /** Modifier state captured at pointerdown. */
    modifiers: PointerModifiers;
    /** Phase A — anchor + page for marquee mode. `null` when the
     * pointer started outside any page (we still allow the drag to
     * resolve as a pan-style cancellation on release). */
    marqueeAnchor: {
      pageId: PageId;
      pageX: number;
      pageY: number;
    } | null;
    /** Phase B — gesture-mode bookkeeping. `handle` is `null` until
     * the worker confirms the gesture started; updates that arrive
     * before then are buffered into `pendingDelta`. */
    gestureState?: {
      handle: GestureHandle | null;
      pendingDelta: [number, number];
      target: ElementId[];
    };
  } | null>(null);

  /** Phase A — page-local marquee rect rendered live by the overlay. */
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRectPageLocal | null>(
    null,
  );

  /** Phase E — active snap guides; refreshed on each gesture update. */
  const [snapLines, setSnapLines] = useState<ReadonlyArray<SnapLine>>([]);

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
      const modifiers: PointerModifiers = {
        shift: e.shiftKey,
        cmd: e.metaKey || e.ctrlKey,
      };
      const tool = props.activeTool ?? "select";
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const [docX, docY] = viewportToDoc(props.camera, cx, cy);
      const containing = findContainingPage(rects, props.pageIds, docX, docY);
      // Phase B — middle-button always pans (the convention every
      // creative tool follows). With the select tool: if the pointer
      // landed inside a currently-selected element, start a Translate
      // gesture; otherwise fall through to marquee. Text tool stays
      // pan so the existing typing UX is undisturbed.
      let mode: "pan" | "marquee" | "gesture" = "pan";
      let gestureState:
        | NonNullable<typeof dragStateRef.current>["gestureState"]
        | undefined;
      if (e.button === 1) {
        mode = "pan";
      } else if (tool === "select") {
        // Phase C/D/G — if the pointer landed on a handle (resize
        // handle or the rotation handle), begin the matching gesture
        // for the currently-selected element(s). Single-select uses
        // bounds-resize on corners (Phase C); multi-select corners
        // route to matrix Scale because per-element bounds resize
        // can't compose into a coherent union resize.
        const handleAttr = readHandleAttr(e.target);
        const selection = props.elementSelection ?? [];
        const geometry = props.elementGeometry ?? [];
        const selectedGeom = geometry.length === 1 ? geometry[0] : null;
        const isMultiSelect = geometry.length > 1;
        const bodyHitElement = !handleAttr && containing
          ? findSelectedElementUnderPointer(
              selection,
              geometry,
              containing[0],
              [docX - containing[1].x, docY - containing[1].y],
            )
          : null;
        // Phase F — Cmd-drag on the body of a single-selected
        // image-bearing frame triggers `TranslateContent` (content
        // grabber). Plain body-drag stays Translate; Cmd-drag on a
        // resize handle stays Scale (Phase D).
        const bodyHitIsImage =
          !handleAttr &&
          selectedGeom?.id.kind === "rectangle" &&
          selectedGeom?.hasImage === true;
        // Build gestureSpec + target list.
        let gestureSpec: GestureType | null = null;
        let targets: ElementId[] = [];
        if (handleAttr === "rotate" && (selectedGeom || isMultiSelect)) {
          gestureSpec = { kind: "rotate" };
          targets = selectedGeom ? [selectedGeom.id] : selection.slice();
        } else if (handleAttr && handleAttr !== "rotate") {
          if (isMultiSelect) {
            // Phase G — multi-select handle drag is always matrix
            // Scale (rotated or not). Holding Cmd still does Scale —
            // it's the only sensible per-element op for N>1.
            gestureSpec = { kind: "scale" };
            targets = selection.slice();
          } else if (selectedGeom) {
            gestureSpec = modifiers.cmd
              ? { kind: "scale" }
              : { kind: "resize", handle: handleAttr };
            targets = [selectedGeom.id];
          }
        } else if (bodyHitElement) {
          // Body drag. For multi-select, move ALL selected items
          // together; for single-select, just the one.
          if (isMultiSelect) {
            gestureSpec = { kind: "translate" };
            targets = selection.slice();
          } else if (modifiers.cmd && bodyHitIsImage) {
            gestureSpec = { kind: "translateContent" };
            targets = [bodyHitElement];
          } else {
            gestureSpec = { kind: "translate" };
            targets = [bodyHitElement];
          }
        }
        const hit = gestureSpec ? targets[0] ?? null : null;
        if (hit && gestureSpec && targets.length > 0) {
          mode = "gesture";
          gestureState = {
            handle: null,
            pendingDelta: [0, 0],
            target: targets,
          };
          // Phase D — Rotate / Scale need an anchor (pointer position
          // at gesture start, in the clicked page's local coords).
          // Translate / Resize don't need one but we send it anyway
          // for future use.
          const anchor = containing
            ? {
                pageId: containing[0],
                pointInPage: [
                  docX - containing[1].x,
                  docY - containing[1].y,
                ] as [number, number],
              }
            : null;
          // Fire-and-forget — the handle returns asynchronously; any
          // pointermove events that arrive before it does are
          // accumulated into `pendingDelta` and flushed on resolve.
          void props.client
            .beginGesture(targets, gestureSpec, anchor)
            .then((handle) => {
              const drag = dragStateRef.current;
              if (!drag || drag.mode !== "gesture" || !drag.gestureState) {
                // Pointer released or escape fired before the worker
                // confirmed; cancel immediately to keep worker state
                // clean.
                void props.client.cancelGesture(handle).catch(() => {});
                return;
              }
              drag.gestureState.handle = handle;
              const pending = drag.gestureState.pendingDelta;
              if (pending[0] !== 0 || pending[1] !== 0) {
                void props.client
                  .updateGesture(handle, pending, { shift: false, alt: false })
                  .then((r) => setSnapLines(r.snapLines))
                  .catch(() => {});
              }
            })
            .catch(() => {
              // Worker rejected — typically a rotated frame in Phase B.
              // Downgrade to pan so the drag still does *something*
              // sensible.
              const drag = dragStateRef.current;
              if (drag) drag.mode = "pan";
            });
        } else {
          mode = "marquee";
        }
      }
      const marqueeAnchor =
        mode === "marquee" && containing
          ? {
              pageId: containing[0],
              pageX: docX - containing[1].x,
              pageY: docY - containing[1].y,
            }
          : null;
      dragStateRef.current = {
        mode,
        startCam: props.camera,
        startDoc: [docX, docY],
        startPointer: [e.clientX, e.clientY],
        maxDelta: 0,
        modifiers,
        marqueeAnchor,
        gestureState,
      };
    },
    [
      props.activeTool,
      props.camera,
      props.client,
      props.elementGeometry,
      props.elementSelection,
      props.pageIds,
      rects,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startPointer[0];
      const dy = e.clientY - drag.startPointer[1];
      const delta = Math.hypot(dx, dy);
      if (delta > drag.maxDelta) drag.maxDelta = delta;
      if (drag.mode === "pan") {
        props.onCameraChange({
          scale: drag.startCam.scale,
          tx: drag.startCam.tx + dx,
          ty: drag.startCam.ty + dy,
        });
      } else if (drag.mode === "gesture") {
        if (drag.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
        // Re-derive the doc-space delta from the original anchor so
        // the gesture stays correct even if the user panned mid-drag.
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const [docX, docY] = viewportToDoc(props.camera, cx, cy);
        const docDelta: [number, number] = [
          docX - drag.startDoc[0],
          docY - drag.startDoc[1],
        ];
        if (!drag.gestureState) return;
        if (drag.gestureState.handle === null) {
          // Begin hasn't resolved yet — buffer the delta; the
          // resolver flushes it once the handle lands.
          drag.gestureState.pendingDelta = docDelta;
        } else {
          void props.client
            .updateGesture(drag.gestureState.handle, docDelta, {
              shift: e.shiftKey,
              alt: e.altKey,
            })
            .then((r) => setSnapLines(r.snapLines))
            .catch(() => {});
        }
      } else if (drag.mode === "marquee") {
        if (drag.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
        const anchor = drag.marqueeAnchor;
        if (!anchor) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const [docX, docY] = viewportToDoc(props.camera, cx, cy);
        // Clamp the marquee to the anchor's page so the rect we
        // commit is page-local. The hit-tester only knows pages.
        const pageRect = rects[props.pageIds.indexOf(anchor.pageId)];
        if (!pageRect) return;
        const currentX = clamp(docX - pageRect.x, 0, pageRect.w);
        const currentY = clamp(docY - pageRect.y, 0, pageRect.h);
        const top = Math.min(anchor.pageY, currentY);
        const left = Math.min(anchor.pageX, currentX);
        const bottom = Math.max(anchor.pageY, currentY);
        const right = Math.max(anchor.pageX, currentX);
        setMarqueeRect({
          pageId: anchor.pageId,
          rect: [top, left, bottom, right],
        });
      }
    },
    [props, rects],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragStateRef.current = null;
      // Modifier state can change between down and up (user lifts
      // Shift before releasing). Take whichever was held at either
      // edge — matches industry convention.
      const modifiers: PointerModifiers = {
        shift: drag.modifiers.shift || e.shiftKey,
        cmd: drag.modifiers.cmd || e.metaKey || e.ctrlKey,
      };
      // Click vs drag: if the pointer barely moved, treat it as a
      // click and route through the worker's hit-tester. If a
      // gesture was started at pointerdown (and never moved past the
      // threshold), cancel it so the worker doesn't hold a stale
      // handle.
      if (drag.maxDelta <= CLICK_DRAG_THRESHOLD_PX) {
        setMarqueeRect(null);
        if (drag.mode === "gesture" && drag.gestureState) {
          const stale = drag.gestureState.handle;
          if (stale !== null) {
            void props.client.cancelGesture(stale).catch(() => {});
          }
        }
        if (!props.onHit) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const [docX, docY] = viewportToDoc(props.camera, cx, cy);
        const containing = findContainingPage(rects, props.pageIds, docX, docY);
        if (containing) {
          const [pageId, pageRect] = containing;
          const docPoint: [number, number] = [docX - pageRect.x, docY - pageRect.y];
          const filter = (props.activeTool ?? "select") === "text" ? "text" : "any";
          void (async () => {
            try {
              const reply = await props.client.send({
                kind: "hitTest",
                payload: { pageId, docPoint, filter },
              });
              if (reply.kind === "hitResult") {
                props.onHit?.({ pageId, docPoint, hit: reply.payload }, modifiers);
              }
            } catch (err) {
              console.warn("hitTest failed:", err);
            }
          })();
        } else {
          props.onHit?.(null, modifiers);
        }
        return;
      }
      // Drag committed. Pan needs no commit work; marquee hands the
      // final rect to the caller; gesture commits via the worker.
      if (drag.mode === "marquee") {
        if (marqueeRect && props.onMarquee) {
          props.onMarquee(marqueeRect.pageId, marqueeRect.rect, modifiers);
        }
        setMarqueeRect(null);
      } else if (drag.mode === "gesture" && drag.gestureState) {
        const handle = drag.gestureState.handle;
        if (handle === null) {
          // Begin hasn't resolved — the resolver path will see the
          // dragState gone and cancel. Nothing to do here.
        } else {
          void props.client
            .commitGesture(handle)
            .then(() => {
              setSnapLines([]);
              props.onGestureCommitted?.();
            })
            .catch(() => {});
        }
      }
    },
    [props, rects, marqueeRect],
  );

  // Phase B — Escape cancels the active gesture. Listen at document
  // level so it works while pointer capture is in flight on the
  // wrapper.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const drag = dragStateRef.current;
      if (!drag || drag.mode !== "gesture" || !drag.gestureState) return;
      const handle = drag.gestureState.handle;
      drag.mode = "pan";
      drag.gestureState = undefined;
      if (handle !== null) {
        void props.client
          .cancelGesture(handle)
          .then(() => {
            setSnapLines([]);
            props.onGestureCommitted?.();
          })
          .catch(() => {});
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props]);

  function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Phase B — return the first selected element whose AABB
   * (transformed corners → axis-aligned bbox) contains the page-local
   * pointer. AABB rather than oriented-rect: fast, no transform math
   * in TS, and a false positive at the AABB corner of a rotated frame
   * is acceptable since the worker's `begin_gesture` then rejects it.
   * Matches what the renderer paints for the selection chrome at the
   * same point in time. */
  function findSelectedElementUnderPointer(
    selection: ReadonlyArray<ElementId>,
    geometry: ReadonlyArray<ElementGeometryItem>,
    pageId: PageId,
    pageLocal: [number, number],
  ): ElementId | null {
    const inSel = new Set(selection.map((e) => `${e.kind}:${e.id}`));
    for (const g of geometry) {
      if (g.pageId !== pageId) continue;
      if (!inSel.has(`${g.id.kind}:${g.id.id}`)) continue;
      const [top, left, bottom, right] = g.bounds;
      const corners: Array<[number, number]> = [
        applyAffineLocal(g.itemTransform, left, top),
        applyAffineLocal(g.itemTransform, right, top),
        applyAffineLocal(g.itemTransform, right, bottom),
        applyAffineLocal(g.itemTransform, left, bottom),
      ];
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const [x, y] of corners) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (
        pageLocal[0] >= minX &&
        pageLocal[0] <= maxX &&
        pageLocal[1] >= minY &&
        pageLocal[1] <= maxY
      ) {
        return g.id;
      }
    }
    return null;
  }

  function applyAffineLocal(
    m: [number, number, number, number, number, number] | null,
    x: number,
    y: number,
  ): [number, number] {
    if (!m) return [x, y];
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  /** Phase C/D — read the `data-handle` attribute from a pointer
   * event target. Returns the matching `ResizeHandle`, `"rotate"`
   * for the Phase D rotation handle, or `null`. The Overlay tags
   * both the visible handle and a larger hit-area rect with the same
   * attribute, so a pointerdown anywhere in the grab zone fires
   * this branch. */
  function readHandleAttr(target: EventTarget | null): ResizeHandle | "rotate" | null {
    if (!(target instanceof Element)) return null;
    const v = target.getAttribute("data-handle");
    if (!v) return null;
    if (
      v === "north" ||
      v === "south" ||
      v === "east" ||
      v === "west" ||
      v === "northEast" ||
      v === "northWest" ||
      v === "southEast" ||
      v === "southWest" ||
      v === "rotate"
    ) {
      return v;
    }
    return null;
  }

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

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Phase H — double-click on a frame nested inside a group →
      // select the whole outermost containing group as a unit.
      if (!props.onDoubleClickGroup) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const [docX, docY] = viewportToDoc(props.camera, cx, cy);
      const containing = findContainingPage(rects, props.pageIds, docX, docY);
      if (!containing) return;
      const [pageId, pageRect] = containing;
      void (async () => {
        try {
          const reply = await props.client.send({
            kind: "hitTest",
            payload: {
              pageId,
              docPoint: [docX - pageRect.x, docY - pageRect.y],
              filter: "any",
            },
          });
          if (reply.kind !== "hitResult") return;
          const chain = reply.payload.groupChain ?? [];
          if (chain.length > 0) {
            props.onDoubleClickGroup?.(chain[0]);
          }
        } catch (err) {
          // Same fail-quiet approach as the click hitTest.
          console.warn("doubleClick hitTest failed:", err);
        }
      })();
    },
    [props, rects],
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
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={canvasRef} style={canvasStyle} />
      <Overlay
        camera={props.camera}
        pageIds={props.pageIds}
        pageRects={rects}
        selection={props.selection ?? null}
        resolution={props.resolution ?? null}
        caret={props.caret ?? null}
        selectionRects={props.selectionRects ?? []}
        elementSelection={props.elementSelection ?? []}
        elementGeometry={props.elementGeometry ?? []}
        marqueeRect={marqueeRect}
        snapLines={snapLines}
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
        layoutCacheStats={props.layoutCacheStats ?? null}
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
  layoutCacheStats: LayoutCacheStats | null;
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
      {props.layoutCacheStats && props.layoutCacheStats.hits + props.layoutCacheStats.misses > 0 && (
        <CacheBadge stats={props.layoutCacheStats} />
      )}
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

/**
 * Phase 4 Step 2 — visualise the per-paragraph layout cache win.
 *
 * Shows `hits/total` for the most recent mutation/undo/redo rebuild.
 * Green when ≥ 90% of paragraphs hit (typing-class edit), amber
 * 50-89% (style change or larger), red below 50% (cold or
 * thrashed cache).
 */
function CacheBadge(props: { stats: LayoutCacheStats }) {
  const total = props.stats.hits + props.stats.misses;
  if (total === 0) return null;
  const ratio = props.stats.hits / total;
  const color = ratio >= 0.9 ? "#10b981" : ratio >= 0.5 ? "#f59e0b" : "#ef4444";
  const pct = Math.round(ratio * 100);
  const ms = props.stats.rebuildMs;
  // AC-E-1 budget — 32 ms per typed character. Green under, amber close,
  // red over.
  const msColor = ms <= 16 ? "#10b981" : ms <= 32 ? "#f59e0b" : "#ef4444";
  return (
    <>
      <span style={{ color }} title={`layout cache: ${props.stats.hits} hits / ${props.stats.misses} misses (${props.stats.len} entries)`}>
        cache {pct}% ({props.stats.hits}/{total})
      </span>
      <span style={{ color: msColor }} title="last rebuild wall-clock; AC-E-1 budget = 32 ms">
        {ms.toFixed(1)} ms
      </span>
    </>
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
