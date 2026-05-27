// Phase 1 canvas shell.
//
// Layout:
//   ┌────────────────────────────────────────────────────────────┐
//   │ header (status, file picker)                               │
//   ├──────────┬─────────────────────────────────────────────────┤
//   │ Navigator│ Viewport                                        │
//   │ (thumbs) │ (pan / zoom over document-space pages)          │
//   │          │                                                 │
//   └──────────┴─────────────────────────────────────────────────┘
//
// What's wired:
//   - Worker boot + protocol handshake.
//   - Drop / pick an IDML file; worker parses + builds; main thread
//     requests snapshots per page.
//   - Pan / zoom in Viewport via PointerEvent + wheel; camera SAB
//     gets updated on every input so the worker (Phase 2+ render
//     loop) sees it on the next frame.
//   - Click a Navigator thumbnail to fit-camera onto that page.
//
// What's not wired yet:
//   - OffscreenCanvas + Vello live-tile renderer (Phase 2+).
//   - Mid-resolution LOD tier (Phase 1 follow-up).
//   - Selection, caret, mutation UI (Phase 3).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasClient } from "../channel/client";
import {
  supportsSharedArrayBuffer,
  IDENTITY_CAMERA,
  type Camera,
} from "../channel/camera";
import type {
  CaretGeometry,
  ContentSelection,
  DocumentHandle,
  ElementGeometryItem,
  ElementId,
  LayoutCacheStats,
  PageId,
  ResolutionResult,
  SelectionMode,
  SelectionRect,
  WorkerToMain,
} from "../channel/protocol";
import { Navigator as PageNavigator } from "./Navigator";
import { Outline } from "./Outline";
import { ViewportCanvas, type SelectionState } from "./ViewportCanvas";
import { useAnimatedCamera } from "./useAnimatedCamera";
import { useFps } from "./useFps";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useTextEditing } from "./useTextEditing";

const SNAPSHOT_WIDTH_PX = 256;

export function CanvasApp() {
  const clientRef = useRef<CanvasClient | null>(null);
  const [handle, setHandle] = useState<DocumentHandle | null>(null);
  const [status, setStatus] = useState<string>("initialising worker…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<Map<PageId, string>>(new Map());
  const [camera, setCameraState] = useState<Camera>(IDENTITY_CAMERA);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [gpuActive, setGpuActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<{ name: string; bytes: number } | null>(null);
  const [resolution, setResolution] = useState<ResolutionResult | null>(null);
  // Phase 3 — content selection + worker-derived caret + selection geom.
  const [contentSelection, setContentSelectionRaw] =
    useState<ContentSelection | null>(null);
  const contentSelectionRef = useRef<ContentSelection | null>(null);
  contentSelectionRef.current = contentSelection;
  const [caret, setCaret] = useState<CaretGeometry | null>(null);
  const [selectionRects, setSelectionRects] = useState<SelectionRect[]>([]);
  // Phase 4 Step 2 — last rebuild's layout-cache stats. Shown in HUD.
  const [layoutCacheStats, setLayoutCacheStats] =
    useState<LayoutCacheStats | null>(null);
  // Phase A — element selection + active tool. Default tool is
  // 'select' so a fresh canvas behaves like a design tool, not a text
  // editor. Swap to 'text' (V/T toggle) to fall back to the existing
  // caret/typing pathway in useTextEditing.
  const [elementSelection, setElementSelection] = useState<ElementId[]>([]);
  const [elementGeometry, setElementGeometry] = useState<ElementGeometryItem[]>(
    [],
  );
  const [activeTool, setActiveTool] = useState<"select" | "text">("select");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<[number, number]>([0, 0]);
  const sabSupported = useMemo(() => supportsSharedArrayBuffer(), []);
  const fps = useFps();

  const [snapshotsReady, setSnapshotsReady] = useState(false);

  // Dev-only test hook. Playwright + ad-hoc browser scripts read
  // `window.__canvas` to drive the editor. `snapshotsReady` flips
  // true after the navigator's own snapshot pre-fetch loop finishes
  // so external scripts don't fire requestSnapshot concurrently
  // (rustybuzz/wasm-bindgen would trip "recursive use of an object"
  // and tear down the worker). Stripped from production bundles by
  // Vite's dead-code elimination under `import.meta.env.PROD`.
  if (!import.meta.env.PROD) {
    (globalThis as unknown as { __canvas?: unknown }).__canvas = {
      client: clientRef.current,
      handle,
      ready: handle != null,
      snapshotsReady,
      elementSelection,
      elementGeometry,
      activeTool,
      setActiveTool,
    };
  }

  useEffect(() => {
    const client = new CanvasClient();
    clientRef.current = client;
    if (!import.meta.env.PROD) {
      (globalThis as unknown as { __canvas?: unknown }).__canvas = {
        client,
        handle: null,
        ready: false,
      };
    }
    const off = client.subscribe((msg: WorkerToMain) => {
      if (msg.kind === "warning") {
        setWarnings((prev) => [...prev, `${msg.payload.kind}: ${msg.payload.details}`]);
      } else if (msg.kind === "attachReady") {
        setGpuActive(msg.payload.gpuActive);
      } else if (msg.kind === "resolutionDone") {
        setResolution(msg.payload);
      } else if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        // Mutation landed; worker has rebuilt. Re-query caret +
        // selection geom so the overlay reflects the new layout.
        // Use a microtask so we don't fire from inside the subscribe
        // callback's stack.
        const sel = contentSelectionRef.current;
        const c = clientRef.current;
        if (sel && c) {
          void c.caretGeometry(sel).then(setCaret).catch(() => setCaret(null));
          if (sel.start !== sel.end) {
            void c
              .selectionGeometry(sel)
              .then(setSelectionRects)
              .catch(() => setSelectionRects([]));
          }
        }
        // Phase 4 instrumentation — surface the rebuild's cache
        // stats so the HUD can show the incremental-layout win.
        setLayoutCacheStats(msg.payload.cacheStats);
      }
    });
    client
      .send({ kind: "hello" })
      .then((reply) => {
        if (reply.kind === "ready") {
          setStatus(`worker ready (protocol v${reply.payload.protocol})`);
        } else {
          setStatus(`worker replied with unexpected: ${reply.kind}`);
        }
      })
      .catch((err) => setStatus(`hello failed: ${String(err)}`));
    return () => {
      off();
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  // Camera updates write to SAB and refresh local state in one
  // place — the worker reads the SAB on its next frame, React
  // re-renders the Viewport's CSS transform.
  const setCamera = useCallback((cam: Camera) => {
    setCameraState(cam);
    clientRef.current?.setCamera(cam);
  }, []);
  // Animated jumps for discrete navigation (navigator click,
  // keyboard fit, goto-page). Direct pan/zoom from the viewport
  // still goes through `setCamera` for one-frame responsiveness.
  const animateCamera = useAnimatedCamera(camera, setCamera);
  useKeyboardShortcuts({
    pageIds: handle?.pageIds ?? [],
    pageSizesPt: handle?.pageSizesPt ?? [],
    camera,
    viewportSize,
    animateCamera,
  });

  // Setting selection mirrors to worker + refreshes caret + rect cache.
  // Phase 3 — every selection change posts SetSelection plus a caret
  // query plus a selection-geometry query. Three round-trips per
  // keystroke is fine at this scale (<1 ms each per the spec budget);
  // a future optimisation can piggyback caret on SetSelection's reply.
  const setContentSelection = useCallback(
    (sel: ContentSelection | null) => {
      setContentSelectionRaw(sel);
      const c = clientRef.current;
      if (!c) return;
      void c.setSelection(sel);
      if (sel) {
        void c.caretGeometry(sel).then(setCaret).catch(() => setCaret(null));
        if (sel.start !== sel.end) {
          void c
            .selectionGeometry(sel)
            .then(setSelectionRects)
            .catch(() => setSelectionRects([]));
        } else {
          setSelectionRects([]);
        }
      } else {
        setCaret(null);
        setSelectionRects([]);
      }
    },
    [],
  );

  useTextEditing({
    client: clientRef.current,
    selection: contentSelection,
    setSelection: setContentSelection,
  });

  // Observe viewport size for the fit-to-page navigator jumps. Use
  // ResizeObserver so window resizes update the camera math.
  useEffect(() => {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewportSize([r.width, r.height]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onFile = useCallback(async (file: File) => {
    if (!clientRef.current) {
      setStatus("no worker");
      return;
    }
    setStatus(`loading ${file.name} (${file.size.toLocaleString()} bytes)…`);
    setLoading({ name: file.name, bytes: file.size });
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Revoke any object URLs from a prior document — the snapshot
    // tier per spec is never evicted, but a new document means the
    // previous snapshots are unreferenced and would leak.
    setSnapshots((prev) => {
      for (const url of prev.values()) URL.revokeObjectURL(url);
      return new Map();
    });
    // Old resolution is stale for a new document.
    setResolution(null);
    // Phase 3 — auto-fetch a default font so text is shaped + the
    // captured StoryLayout has real glyph positions. Without this
    // the caret + selection rendering has nothing to position
    // against (glyphs vec empty → no clusters captured). Inter is
    // checked in under corpus/fonts/.
    let fontBytes: Uint8Array | undefined;
    try {
      const fontResp = await fetch("/fonts/Inter.ttf");
      if (fontResp.ok) {
        fontBytes = new Uint8Array(await fontResp.arrayBuffer());
      }
    } catch {
      // Font fetch is best-effort; canvas still renders without it.
    }
    try {
      setSnapshotsReady(false);
      const h = await clientRef.current.loadDocument(bytes, fontBytes);
      setHandle(h);
      setLoading(null);
      setStatus(
        `loaded ${h.pageCount} page${h.pageCount === 1 ? "" : "s"}; snapshotting…`,
      );
      // Sequential requests — the worker is single-threaded so
      // parallelising up-front would only queue them. Each
      // snapshot appears in the UI as it lands (progressive).
      for (const pageId of h.pageIds) {
        try {
          const snap = await clientRef.current.requestSnapshot(pageId, SNAPSHOT_WIDTH_PX);
          const blob = new Blob([new Uint8Array(snap.pngBytes)], { type: "image/png" });
          const url = URL.createObjectURL(blob);
          setSnapshots((prev) => {
            const next = new Map(prev);
            next.set(pageId, url);
            return next;
          });
        } catch (err) {
          setWarnings((prev) => [...prev, `snapshot ${pageId}: ${String(err)}`]);
        }
      }
      setStatus(`loaded ${h.pageCount} page${h.pageCount === 1 ? "" : "s"}`);
      setSnapshotsReady(true);
    } catch (err) {
      setLoading(null);
      setStatus(`load failed: ${String(err)}`);
    }
  }, []);

  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 16 }}>IDML canvas</h1>
        <FileDrop onFile={onFile} compact />
        <ToolToggle active={activeTool} onChange={setActiveTool} />
        <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
          {status}
        </span>
      </header>

      {!sabSupported && (
        <div style={warningStyle}>
          SharedArrayBuffer unavailable — cross-origin isolation headers (COOP +
          COEP) not set. Camera falls back to a regular ArrayBuffer; latency is
          unaffected but reads may tear under contention.
        </div>
      )}

      {warnings.length > 0 && (
        <ul style={{ ...warningStyle, listStyle: "disc", paddingLeft: 24 }}>
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div style={mainStyle}>
        {handle && handle.pageCount > 0 && (
          <PageNavigator
            pageIds={handle.pageIds}
            pageSizesPt={handle.pageSizesPt}
            snapshots={snapshots}
            viewportSize={viewportSize}
            onCameraChange={animateCamera}
          />
        )}
        {handle && handle.pageCount > 0 && resolution && (
          <Outline
            resolution={resolution}
            pageIds={handle.pageIds}
            pageSizesPt={handle.pageSizesPt}
            viewportSize={viewportSize}
            onCameraChange={animateCamera}
          />
        )}
        <div ref={viewportRef} style={viewportContainerStyle}>
          {clientRef.current && handle && handle.pageCount > 0 ? (
            <ViewportCanvas
              client={clientRef.current}
              pageIds={handle.pageIds}
              pageSizesPt={handle.pageSizesPt}
              camera={camera}
              onCameraChange={setCamera}
              activeTool={activeTool}
              elementSelection={elementSelection}
              elementGeometry={elementGeometry}
              onHit={(s, modifiers) => {
                setSelection(s);
                const client = clientRef.current;
                // Phase A — when the select tool is active, route the
                // click to the element-selection model. Modifier keys
                // pick the mode: Shift = Add, Cmd/Ctrl = Toggle, plain
                // click = Replace.
                if (activeTool === "select") {
                  const mode: SelectionMode = modifiers?.shift
                    ? "add"
                    : modifiers?.cmd
                      ? "toggle"
                      : "replace";
                  if (s && s.hit.element) {
                    if (client) {
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
                    }
                  } else if (!modifiers?.shift && !modifiers?.cmd) {
                    // Empty click with no modifier → clear selection.
                    if (client) {
                      void client
                        .setElementSelection([], "replace")
                        .then(() => {
                          setElementSelection([]);
                          setElementGeometry([]);
                        })
                        .catch(() => {});
                    }
                  }
                  // Text tool stays text-only; select tool does NOT
                  // also drop into text-edit mode on a frame click —
                  // that's a Phase B "enter text edit" gesture.
                  setContentSelection(null);
                  return;
                }
                // Phase 3 — text tool: click on text → caret at offset.
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
              }}
              onDoubleClickGroup={(groupId) => {
                // Phase H — replace the element selection with the
                // group's leaves so the user can grab the whole
                // group as a unit via Phase G's union handles.
                const client = clientRef.current;
                if (!client) return;
                void client
                  .groupLeaves(groupId)
                  .then((ids) =>
                    client.setElementSelection(ids, "replace"),
                  )
                  .then((ids) => {
                    setElementSelection(ids);
                    return client.elementGeometry(ids);
                  })
                  .then(setElementGeometry)
                  .catch(() => {});
              }}
              onGestureCommitted={() => {
                // Phase B — re-fetch geometry so the chrome lands at
                // the committed bounds. Same shape as the post-hit
                // refresh; reuses the existing elementGeometry RPC.
                const client = clientRef.current;
                if (!client || elementSelection.length === 0) return;
                void client
                  .elementGeometry(elementSelection)
                  .then(setElementGeometry)
                  .catch(() => {});
              }}
              onMarquee={(pageId, rect, modifiers) => {
                const client = clientRef.current;
                if (!client) return;
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
              }}
              selection={selection}
              fps={fps}
              gpuActive={gpuActive}
              resolution={resolution}
              caret={caret}
              selectionRects={selectionRects}
              layoutCacheStats={layoutCacheStats}
            />
          ) : (
            <EmptyState />
          )}
          {loading && <LoadingOverlay name={loading.name} bytes={loading.bytes} />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={emptyStyle}>
      <p style={{ fontSize: 14, color: "#555" }}>
        Drop an IDML file in the header to begin.
      </p>
    </div>
  );
}

/**
 * Phase A — thin select/text toggle. Deliberately *not* the shell
 * toolbox (that depends on the bundle infrastructure which isn't
 * built yet); this is the minimum chrome the user needs to flip
 * between frame-selection and caret/typing on the same canvas. V/T
 * keys also work; see useKeyboardShortcuts in a future iteration.
 */
function ToolToggle(props: {
  active: "select" | "text";
  onChange: (t: "select" | "text") => void;
}) {
  return (
    <div role="tablist" style={toolToggleStyle}>
      <button
        type="button"
        role="tab"
        aria-selected={props.active === "select"}
        title="Selection tool (V)"
        onClick={() => props.onChange("select")}
        style={
          props.active === "select"
            ? { ...toolButtonStyle, ...toolButtonActiveStyle }
            : toolButtonStyle
        }
      >
        V
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={props.active === "text"}
        title="Text tool (T)"
        onClick={() => props.onChange("text")}
        style={
          props.active === "text"
            ? { ...toolButtonStyle, ...toolButtonActiveStyle }
            : toolButtonStyle
        }
      >
        T
      </button>
    </div>
  );
}

const toolToggleStyle: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  overflow: "hidden",
};

const toolButtonStyle: React.CSSProperties = {
  width: 28,
  height: 24,
  background: "#fff",
  border: "none",
  borderRight: "1px solid #d1d5db",
  fontSize: 12,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  cursor: "pointer",
  color: "#374151",
};

const toolButtonActiveStyle: React.CSSProperties = {
  background: "#1f2937",
  color: "#fff",
};

function LoadingOverlay(props: { name: string; bytes: number }) {
  return (
    <div style={loadingOverlayStyle}>
      <div style={spinnerStyle} />
      <div style={{ fontSize: 13, color: "#374151", marginTop: 12 }}>
        Parsing <strong>{props.name}</strong>
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
        {(props.bytes / 1024).toFixed(1)} KiB
      </div>
    </div>
  );
}

function FileDrop(props: { onFile: (file: File) => void; compact?: boolean }) {
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) props.onFile(file);
    },
    [props],
  );
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={props.compact ? compactDropStyle : dropStyle}
    >
      {props.compact ? "" : "Drop an IDML file here, or "}
      <input
        type="file"
        accept=".idml,application/vnd.adobe.indesign-idml-package"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) props.onFile(file);
        }}
        style={{ marginLeft: props.compact ? 0 : 8 }}
      />
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  width: "100vw",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderBottom: "1px solid #ddd",
  padding: "8px 12px",
  background: "#fafafa",
  flexShrink: 0,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "row",
  minHeight: 0,
};

const viewportContainerStyle: React.CSSProperties = {
  flex: 1,
  position: "relative",
  minWidth: 0,
};

const emptyStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f3f4f6",
};

const loadingOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(243, 244, 246, 0.85)",
  zIndex: 10,
  pointerEvents: "none",
};

const spinnerStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: "3px solid #d1d5db",
  borderTopColor: "#2563eb",
  borderRadius: "50%",
  animation: "idml-canvas-spin 0.9s linear infinite",
};

const dropStyle: React.CSSProperties = {
  border: "2px dashed #bbb",
  padding: 16,
  borderRadius: 8,
  textAlign: "center",
  color: "#555",
};

const compactDropStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const warningStyle: React.CSSProperties = {
  border: "1px solid #d97706",
  background: "#fff7ed",
  color: "#7c2d12",
  borderRadius: 6,
  padding: 8,
  fontSize: 12,
  margin: "8px 12px",
};
