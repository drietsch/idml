// Step 3g — the swap.
//
// Layout structure stays roughly the same shape (header on top,
// docked panels below) but the body is now mounted through
// `<DockviewRoot />`. The three built-in panels (canvas, pages,
// outline) register at shell startup; users can rearrange / close
// them via dockview's standard tab interactions.
//
// All cross-cutting state continues to live in the `@verso/shell`
// contexts; this file is now ~150 lines of providers + worker
// message router + header chrome. Step 3i will move what remains
// into packages/shell/src/index.tsx as `<VersoShell />`.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Minimal error boundary so a panel / dockview crash leaves a
 * visible diagnostic instead of unmounting the whole shell.
 */
class DebugErrorBoundary extends React.Component<
  React.PropsWithChildren<{ label: string }>,
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] caught:`, error);
    (globalThis as unknown as { __versoCrash?: string }).__versoCrash =
      `[${this.props.label}] ${error.message}\n${error.stack ?? ""}`;
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 16, color: "#b91c1c", fontFamily: "monospace" }}>
          [{this.props.label}] {this.state.error.message}
          {"\n"}
          {this.state.error.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}
import {
  CanvasClientProvider,
  CameraProvider,
  ContentSelectionProvider,
  DockviewRoot,
  DocumentProvider,
  InstrumentationProvider,
  SelectionProvider,
  VersoEditorProvider,
  buildOpenIdmlCommand,
  loadDocumentFile,
  useCanvasClient,
  useCamera,
  useContentSelection,
  useDocument,
  useInstrumentation,
  useRegistries,
  useSelection,
} from "@verso/shell";
import { CanvasClient } from "../channel/client";
import { supportsSharedArrayBuffer } from "../channel/camera";
import type { WorkerToMain } from "../channel/protocol";
import { CanvasPanel } from "../panels/canvas-panel";
import { NavigatorPanel } from "../panels/navigator-panel";
import { OutlinePanel } from "../panels/outline-panel";
import { useAnimatedCamera } from "./useAnimatedCamera";
import { useFps } from "./useFps";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useTextEditing } from "./useTextEditing";

/**
 * Top-level shell — owns the CanvasClient lifecycle and wraps the
 * inner shell in every provider. The inner shell reads everything
 * from context hooks.
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
    <DebugErrorBoundary label="canvas-app">
      <CanvasClientProvider client={client}>
        <CameraProvider>
          <DocumentProvider>
            <SelectionProvider>
              <ContentSelectionProvider>
                <InstrumentationProvider>
                  <VersoEditorProvider>
                    <CanvasShell />
                  </VersoEditorProvider>
                </InstrumentationProvider>
              </ContentSelectionProvider>
            </SelectionProvider>
          </DocumentProvider>
        </CameraProvider>
      </CanvasClientProvider>
    </DebugErrorBoundary>
  );
}

/**
 * Inner shell — runs the consolidated worker-message subscribe,
 * registers the built-in panels, hosts the header. The actual
 * panel UI mounts through DockviewRoot below.
 */
function CanvasShell() {
  const client = useCanvasClient();
  const { camera, setCamera, viewportSize } = useCamera();
  const {
    handle,
    snapshotsReady,
    setHandle,
    setLoading,
    setSnapshots,
    setSnapshotsReady,
    setResolution,
    resetForNewDocument,
  } = useDocument();
  const {
    elementSelection,
    elementGeometry,
    activeTool,
    setActiveTool,
  } = useSelection();
  const {
    contentSelection,
    setContentSelection,
    setCaret,
    setSelectionRects,
    contentSelectionRef,
  } = useContentSelection();
  const { setFps, setGpuActive, setLayoutCacheStats } = useInstrumentation();
  const registries = useRegistries();

  const [status, setStatus] = useState<string>("initialising worker…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const sabSupported = useMemo(() => supportsSharedArrayBuffer(), []);

  // Sample FPS centrally and publish into the instrumentation
  // context so the canvas panel's HUD can read it.
  const fps = useFps();
  useEffect(() => {
    setFps(fps);
  }, [fps, setFps]);

  // Register the three built-in panels exactly once. Disposal on
  // unmount keeps the registry clean across Strict-Mode dev
  // double-mounts.
  const panelsRegistered = useRef(false);
  useEffect(() => {
    if (panelsRegistered.current) return;
    panelsRegistered.current = true;
    const disposables = [
      registries.panels.register({
        id: "verso.canvas",
        title: "Canvas",
        component: CanvasPanel,
        defaultDock: "center",
        defaultGroup: "center",
        closable: false,
        movable: false,
      }),
      registries.panels.register({
        id: "verso.pages",
        title: "Pages",
        component: NavigatorPanel,
        defaultDock: "left",
        defaultGroup: "structure",
      }),
      registries.panels.register({
        id: "verso.outline",
        title: "Outline",
        component: OutlinePanel,
        defaultDock: "left",
        defaultGroup: "structure",
      }),
    ];
    return () => {
      for (const d of disposables) d.dispose();
      panelsRegistered.current = false;
    };
  }, [registries]);

  // Register the verso.file.openIdml command once the shell mounts.
  useEffect(() => {
    const handle = registries.commands.register(
      buildOpenIdmlCommand({
        pickFile: async () => {
          return new Promise<File | null>((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept =
              ".idml,application/vnd.adobe.indesign-idml-package";
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.click();
          });
        },
        setStatus,
        pushWarning: (w) => setWarnings((prev) => [...prev, w]),
      }),
    );
    return () => handle.dispose();
  }, [registries]);

  // Dev-only test hook. Playwright + ad-hoc browser scripts read
  // `window.__canvas`. Re-published on every render so it always
  // reflects current state — used by tests to drive the editor.
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
      registries,
    };
  }

  // Consolidated worker-message subscribe.
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
    setGpuActive,
    setLayoutCacheStats,
    setResolution,
    setSelectionRects,
  ]);

  // Keyboard shortcuts (legacy hook; the bundle-loader registry
  // takes over in Step 4).
  const animateCamera = useAnimatedCamera(camera, setCamera);
  useKeyboardShortcuts({
    pageIds: handle?.pageIds ?? [],
    pageSizesPt: handle?.pageSizesPt ?? [],
    camera,
    viewportSize,
    animateCamera,
  });

  // Text editing (caret + typing) — driven from the keyboard;
  // unchanged from earlier steps.
  useTextEditing({
    client,
    selection: contentSelection,
    setSelection: setContentSelection,
  });

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

      <div style={dockviewContainerStyle}>
        <DockviewRoot />
      </div>
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

const dockviewContainerStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
};

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
