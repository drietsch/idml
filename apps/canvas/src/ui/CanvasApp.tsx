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
import type { DocumentHandle, PageId, WorkerToMain } from "../channel/protocol";
import { Navigator as PageNavigator } from "./Navigator";
import { ViewportCanvas, type SelectionState } from "./ViewportCanvas";

const SNAPSHOT_WIDTH_PX = 256;

export function CanvasApp() {
  const clientRef = useRef<CanvasClient | null>(null);
  const [handle, setHandle] = useState<DocumentHandle | null>(null);
  const [status, setStatus] = useState<string>("initialising worker…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<Map<PageId, string>>(new Map());
  const [camera, setCameraState] = useState<Camera>(IDENTITY_CAMERA);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<[number, number]>([0, 0]);
  const sabSupported = useMemo(() => supportsSharedArrayBuffer(), []);

  useEffect(() => {
    const client = new CanvasClient();
    clientRef.current = client;
    const off = client.subscribe((msg: WorkerToMain) => {
      if (msg.kind === "warning") {
        setWarnings((prev) => [...prev, `${msg.payload.kind}: ${msg.payload.details}`]);
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Revoke any object URLs from a prior document — the snapshot
    // tier per spec is never evicted, but a new document means the
    // previous snapshots are unreferenced and would leak.
    setSnapshots((prev) => {
      for (const url of prev.values()) URL.revokeObjectURL(url);
      return new Map();
    });
    try {
      const h = await clientRef.current.loadDocument(bytes);
      setHandle(h);
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
            onCameraChange={setCamera}
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
              onHit={setSelection}
              selection={selection}
            />
          ) : (
            <EmptyState />
          )}
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
