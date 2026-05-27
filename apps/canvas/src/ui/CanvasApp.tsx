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
// Step 3b — state lives in `@verso/shell` contexts. The five
// providers wrap the existing JSX so the visual shell is unchanged
// while every cross-cutting bit of state (client, camera,
// document, selection, content selection) becomes shell-owned.
// Local-only state that doesn't fit one of the five contexts
// (status text, warnings, GPU readiness, layout-cache HUD) stays
// on this component as plain `useState` — Step 3d+ will lift that
// into the registries.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasClientProvider,
  CameraProvider,
  ContentSelectionProvider,
  DocumentProvider,
  SelectionProvider,
  loadDocumentFile,
  useCamera,
  useCanvasClient,
  useContentSelection,
  useDocument,
  useSelection,
} from "@verso/shell";
import { CanvasClient } from "../channel/client";
import { supportsSharedArrayBuffer } from "../channel/camera";
import type {
  LayoutCacheStats,
  SelectionMode,
  WorkerToMain,
} from "../channel/protocol";
import { Navigator as PageNavigator } from "./Navigator";
import { Outline } from "./Outline";
import { ViewportCanvas, type SelectionState } from "./ViewportCanvas";
import { useAnimatedCamera } from "./useAnimatedCamera";
import { useFps } from "./useFps";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useTextEditing } from "./useTextEditing";

/**
 * Top-level shell — owns the CanvasClient lifecycle and wraps the
 * inner shell in the five state contexts. The inner shell reads
 * everything from context hooks.
 */
export function CanvasApp() {
  const [client, setClient] = useState<CanvasClient | null>(null);

  useEffect(() => {
    const c = new CanvasClient();
    setClient(c);
    return () => {
      c.dispose();
      setClient(null);
    };
  }, []);

  if (!client) {
    return (
      <div style={shellStyle}>
        <header style={headerStyle}>
          <h1 style={{ margin: 0, fontSize: 16 }}>IDML canvas</h1>
          <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
            initialising worker…
          </span>
        </header>
      </div>
    );
  }

  return (
    <CanvasClientProvider client={client}>
      <CameraProvider>
        <DocumentProvider>
          <SelectionProvider>
            <ContentSelectionProvider>
              <CanvasShell />
            </ContentSelectionProvider>
          </SelectionProvider>
        </DocumentProvider>
      </CameraProvider>
    </CanvasClientProvider>
  );
}

/**
 * Inner shell — reads from the five contexts. All worker-message
 * subscriptions consolidate here per the spec's
 * "mutation subscription consolidation" rule: one `client.subscribe`,
 * fan-out to context setters.
 */
function CanvasShell() {
  const client = useCanvasClient();
  const { camera, setCamera, viewportSize, setViewportSize } = useCamera();
  const {
    handle,
    setHandle,
    loading,
    setLoading,
    snapshots,
    setSnapshots,
    snapshotsReady,
    setSnapshotsReady,
    resolution,
    setResolution,
    resetForNewDocument,
  } = useDocument();
  const {
    elementSelection,
    setElementSelection,
    elementGeometry,
    setElementGeometry,
    activeTool,
    setActiveTool,
  } = useSelection();
  const {
    contentSelection,
    setContentSelection,
    caret,
    setCaret,
    selectionRects,
    setSelectionRects,
    contentSelectionRef,
  } = useContentSelection();

  const [status, setStatus] = useState<string>("initialising worker…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [gpuActive, setGpuActive] = useState<boolean | null>(null);
  const [layoutCacheStats, setLayoutCacheStats] =
    useState<LayoutCacheStats | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sabSupported = useMemo(() => supportsSharedArrayBuffer(), []);
  const fps = useFps();

  // Dev-only test hook. Playwright + ad-hoc browser scripts read
  // `window.__canvas` to drive the editor. `snapshotsReady` flips
  // true after the navigator's own snapshot pre-fetch loop finishes
  // so external scripts don't fire requestSnapshot concurrently
  // (rustybuzz/wasm-bindgen would trip "recursive use of an object"
  // and tear down the worker). Stripped from production bundles by
  // Vite's dead-code elimination under `import.meta.env.PROD`.
  if (!import.meta.env.PROD) {
    (globalThis as unknown as { __canvas?: unknown }).__canvas = {
      client,
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
        if (sel) {
          void client.caretGeometry(sel).then(setCaret).catch(() => setCaret(null));
          if (sel.start !== sel.end) {
            void client
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
    };
  }, [
    client,
    contentSelectionRef,
    setCaret,
    setLayoutCacheStats,
    setResolution,
    setSelectionRects,
  ]);

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

  useTextEditing({
    client,
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
  }, [setViewportSize]);

  const onFile = useCallback(
    (file: File) => {
      void loadDocumentFile(client, file, {
        setHandle,
        setLoading,
        setStatus,
        setSnapshotsReady,
        addSnapshot: (pageId, url) =>
          setSnapshots((prev) => {
            const next = new Map(prev);
            next.set(pageId, url);
            return next;
          }),
        resetForNewDocument,
        pushWarning: (w) => setWarnings((prev) => [...prev, w]),
      });
    },
    [
      client,
      resetForNewDocument,
      setHandle,
      setLoading,
      setSnapshots,
      setSnapshotsReady,
    ],
  );

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
          {handle && handle.pageCount > 0 ? (
            <ViewportCanvas
              client={client}
              pageIds={handle.pageIds}
              pageSizesPt={handle.pageSizesPt}
              camera={camera}
              onCameraChange={setCamera}
              activeTool={activeTool}
              elementSelection={elementSelection}
              elementGeometry={elementGeometry}
              onHit={(s, modifiers) => {
                setSelection(s);
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
                    // Empty click with no modifier → clear selection.
                    void client
                      .setElementSelection([], "replace")
                      .then(() => {
                        setElementSelection([]);
                        setElementGeometry([]);
                      })
                      .catch(() => {});
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
                if (elementSelection.length === 0) return;
                void client
                  .elementGeometry(elementSelection)
                  .then(setElementGeometry)
                  .catch(() => {});
              }}
              onMarquee={(pageId, rect, modifiers) => {
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
  margin: 8,
};
