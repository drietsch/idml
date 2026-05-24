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
  PageId,
  ResolutionResult,
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<[number, number]>([0, 0]);
  const sabSupported = useMemo(() => supportsSharedArrayBuffer(), []);
  const fps = useFps();

  useEffect(() => {
    const client = new CanvasClient();
    clientRef.current = client;
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
              onHit={(s) => {
                setSelection(s);
                // Phase 3 — click on text → caret at the offset.
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
              selection={selection}
              fps={fps}
              gpuActive={gpuActive}
              resolution={resolution}
              caret={caret}
              selectionRects={selectionRects}
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
