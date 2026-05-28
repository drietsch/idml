// The shell root. Composes every provider, registers the supplied
// panels + the built-in file-open command, hosts the chrome
// (header, warnings, command palette), and mounts DockviewRoot
// as the main work area.
//
// Apps render `<VersoShell client={...} panels={...}>{integration}</VersoShell>`
// where `integration` is a (renderless) component that uses the
// editor hooks to install canvas-app-specific keyboard / camera /
// text-editing behavior. Keeping that outside VersoShell preserves
// the shell's app-agnostic surface — the canvas-specific hooks
// import from `apps/canvas/src/ui/` without dragging shell into
// canvas internals.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { CanvasClient } from "../../../apps/canvas/src/channel/client";
// eslint-disable-next-line import/no-relative-parent-imports
import { supportsSharedArrayBuffer } from "../../../apps/canvas/src/channel/camera";
// eslint-disable-next-line import/no-relative-parent-imports
import type { WorkerToMain } from "../../../apps/canvas/src/channel/protocol";

import { CanvasClientProvider, useCanvasClient } from "./state/canvas-client-context";
import { CameraProvider } from "./state/camera-context";
import { ContentSelectionProvider, useContentSelection } from "./state/content-selection-context";
import { DocumentProvider, useDocument } from "./state/document-context";
import { InstrumentationProvider, useInstrumentation } from "./state/instrumentation-context";
import { OverlaySignalsProvider } from "./state/overlay-signals-context";
import {
  SelectionProvider,
  useSelection,
  type ActiveTool,
} from "./state/selection-context";
import { VersoEditorProvider } from "./state/verso-editor";
import { useRegistries } from "./state/registries-context";
import { CommandPalette } from "./chrome/CommandPalette";
import { DockviewRoot } from "./docking/DockviewRoot";
import { DockingSubstrateProvider } from "./docking/substrate-context";
import { loadDocumentFile } from "./state/document-loader";
import {
  VERSO_FILE_OPEN_IDML,
  buildOpenIdmlCommand,
} from "./state/commands/file-commands";
import {
  PALETTE_TOGGLE_COMMAND,
  PALETTE_TOGGLE_KEYBINDING,
  PALETTE_TOGGLE_KEYBINDING_CTRL,
  PERSPECTIVE_EXPORT_COMMAND,
  PERSPECTIVE_IMPORT_COMMAND,
  PERSPECTIVE_SAVE_AS_COMMAND,
  VERSO_PALETTE_TOGGLE,
  VERSO_PERSPECTIVE_EXPORT,
  VERSO_PERSPECTIVE_IMPORT,
  VERSO_PERSPECTIVE_SAVE_AS,
  buildPanelToggleCommands,
  buildPerspectiveLifecycleCommands,
} from "./state/commands/built-in-commands";
import {
  PERSPECTIVES_CHANGED_EVENT,
  listPerspectives,
} from "./persistence/layout-persistence";
import { MenuBar } from "./chrome/MenuBar";
import type { OverlayContribution } from "./registries/overlay";
import type { PanelContribution } from "./registries/panel";
import type { Tool } from "./registries/tool";
import type { Disposable } from "./registries/types";
import { useFps } from "./hooks/useFps";

export interface VersoShellProps {
  client: CanvasClient;
  /** Panel contributions to register at shell startup. */
  panels: PanelContribution[];
  /** Overlay contributions to register at shell startup. Same
   *  pattern as `panels` — apps decide which overlays to mount,
   *  bundles add more via the registry. */
  overlays?: OverlayContribution[];
  /** Optional extra chrome inserted into the header between the
   * menu bar and the file picker. Apps use this for shell-host-
   * specific controls (zoom indicator, color profile selector,
   * fps badge, …) that don't fit the panel-or-menu pattern. */
  headerExtras?: ReactNode;
}

/**
 * Top-level shell. Wraps the chrome in every provider so consumers
 * (including the `integration` child) have access to the editor
 * hooks. `client` is created by the app and passed in — VersoShell
 * doesn't own the worker lifecycle.
 */
export function VersoShell({
  client,
  panels,
  overlays,
  headerExtras,
  children,
}: PropsWithChildren<VersoShellProps>) {
  return (
    <DebugErrorBoundary label="verso-shell">
      <CanvasClientProvider client={client}>
        <CameraProvider>
          <DocumentProvider>
            <SelectionProvider>
              <ContentSelectionProvider>
                <OverlaySignalsProvider>
                  <InstrumentationProvider>
                    {/* DockingSubstrateProvider above VersoEditorProvider so
                     *  the editor handle (`verso.substrate`) sees the live
                     *  substrate once DockviewRoot's onReady publishes it. */}
                    <DockingSubstrateProvider>
                      <VersoEditorProvider>
                        <ShellChrome
                          panels={panels}
                          overlays={overlays}
                          headerExtras={headerExtras}
                        >
                          {children}
                        </ShellChrome>
                      </VersoEditorProvider>
                    </DockingSubstrateProvider>
                  </InstrumentationProvider>
                </OverlaySignalsProvider>
              </ContentSelectionProvider>
            </SelectionProvider>
          </DocumentProvider>
        </CameraProvider>
      </CanvasClientProvider>
    </DebugErrorBoundary>
  );
}

/**
 * Inner shell — reads from the contexts and renders the actual
 * chrome. Registers the supplied panels + the file-open command at
 * mount; runs the consolidated worker-message subscribe; publishes
 * fps into the instrumentation context.
 */
function ShellChrome({
  panels,
  overlays,
  headerExtras,
  children,
}: PropsWithChildren<{
  panels: PanelContribution[];
  overlays?: OverlayContribution[];
  headerExtras?: ReactNode;
}>) {
  const client = useCanvasClient();
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
    activeGroup,
    setActiveGroup,
  } = useSelection();
  const { setCaret, setSelectionRects, contentSelectionRef } =
    useContentSelection();
  const { setFps, setGpuActive, setLayoutCacheStats } = useInstrumentation();
  const registries = useRegistries();

  const [status, setStatus] = useState<string>("initialising worker…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const sabSupported = useMemo(() => supportsSharedArrayBuffer(), []);

  // Publish main-thread FPS for the canvas HUD.
  const fps = useFps();
  useEffect(() => {
    setFps(fps);
  }, [fps, setFps]);

  // Register the supplied panels + auto-generate show/hide
  // commands for each. The ref guards against the StrictMode
  // double-mount cycle.
  const panelsRegistered = useRef(false);
  useEffect(() => {
    if (panelsRegistered.current) return;
    panelsRegistered.current = true;
    const disposables = panels.flatMap((p) => {
      const [show, hide] = buildPanelToggleCommands(p);
      return [
        registries.panels.register(p),
        registries.commands.register(show),
        registries.commands.register(hide),
      ];
    });
    return () => {
      for (const d of disposables) d.dispose();
      panelsRegistered.current = false;
    };
  }, [registries, panels]);

  // Register the supplied overlay contributions. Same ref guard
  // for StrictMode double-mount; OverlayHost re-renders when the
  // registry fires its onChange events.
  const overlaysRegistered = useRef(false);
  useEffect(() => {
    if (overlaysRegistered.current) return;
    if (!overlays || overlays.length === 0) return;
    overlaysRegistered.current = true;
    const disposables = overlays.map((o) => registries.overlays.register(o));
    return () => {
      for (const d of disposables) d.dispose();
      overlaysRegistered.current = false;
    };
  }, [registries, overlays]);

  // Register the built-in file-open command. Programmatic file
  // dialog so the palette can invoke it without depending on the
  // header's `<input type="file">`.
  useEffect(() => {
    const handle = registries.commands.register(
      buildOpenIdmlCommand({
        pickFile: async () =>
          new Promise<File | null>((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".idml,application/vnd.adobe.indesign-idml-package";
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.click();
          }),
        setStatus,
        pushWarning: (w) => setWarnings((prev) => [...prev, w]),
      }),
    );
    return () => handle.dispose();
  }, [registries]);

  // Register the palette-toggle command + Cmd+K keybinding. The
  // command body (notifyPalette) is shell-internal; binding via
  // the registry means it shows up in the palette itself (handy
  // for discovery) and lets bundles re-bind the key if needed.
  useEffect(() => {
    const cmd = registries.commands.register(PALETTE_TOGGLE_COMMAND);
    const k1 = registries.keybindings.register(PALETTE_TOGGLE_KEYBINDING);
    const k2 = registries.keybindings.register(PALETTE_TOGGLE_KEYBINDING_CTRL);
    return () => {
      cmd.dispose();
      k1.dispose();
      k2.dispose();
    };
  }, [registries]);

  // Perspective save/export/import commands — the always-on triplet.
  // Per-perspective load/delete commands are auto-generated below.
  useEffect(() => {
    const cmds = [
      registries.commands.register(PERSPECTIVE_SAVE_AS_COMMAND),
      registries.commands.register(PERSPECTIVE_EXPORT_COMMAND),
      registries.commands.register(PERSPECTIVE_IMPORT_COMMAND),
    ];
    return () => {
      for (const c of cmds) c.dispose();
    };
  }, [registries]);

  // Auto-generate verso.perspective.load.<name> + delete.<name>
  // commands from the persisted list. Re-runs on the custom
  // `verso:perspectives-changed` event the persistence layer emits
  // every time a perspective is saved/deleted/imported.
  useEffect(() => {
    let disposables: Disposable[] = [];
    const refresh = () => {
      for (const d of disposables) d.dispose();
      disposables = listPerspectives().flatMap((name) => {
        const [load, del] = buildPerspectiveLifecycleCommands(name);
        return [
          registries.commands.register(load),
          registries.commands.register(del),
        ];
      });
    };
    refresh();
    window.addEventListener(PERSPECTIVES_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(PERSPECTIVES_CHANGED_EVENT, refresh);
      for (const d of disposables) d.dispose();
    };
  }, [registries]);

  // Default menu items. Static — they reference always-on commands;
  // per-panel and per-perspective entries are deferred to the
  // command registry surface (the palette already shows them).
  useEffect(() => {
    const items = registries.menus;
    const handles = [
      items.register({ path: "File/Open IDML…", command: VERSO_FILE_OPEN_IDML, order: 10 }),
      items.register({
        path: "View/Toggle Command Palette",
        command: VERSO_PALETTE_TOGGLE,
        order: 10,
      }),
      items.register({
        path: "View/Save Perspective…",
        command: VERSO_PERSPECTIVE_SAVE_AS,
        order: 90,
        group: "perspective",
      }),
      items.register({
        path: "View/Export Perspective…",
        command: VERSO_PERSPECTIVE_EXPORT,
        order: 91,
        group: "perspective",
      }),
      items.register({
        path: "View/Import Perspective…",
        command: VERSO_PERSPECTIVE_IMPORT,
        order: 92,
        group: "perspective",
      }),
    ];
    return () => {
      for (const h of handles) h.dispose();
    };
  }, [registries]);

  // Dev hook. Playwright + ad-hoc browser scripts read
  // `window.__canvas`. Re-published on every render so it always
  // reflects current state. Stripped from production builds via
  // Vite's `import.meta.env.PROD` constant — typed loosely here so
  // shell's tsconfig (which doesn't include Vite's ambient types)
  // still passes.
  const isProd = ((import.meta as unknown as { env?: { PROD?: boolean } }).env
    ?.PROD) === true;
  if (!isProd) {
    (globalThis as unknown as { __canvas?: unknown }).__canvas = {
      client,
      handle,
      ready: handle != null,
      snapshotsReady,
      elementSelection,
      elementGeometry,
      activeTool,
      setActiveTool,
      // Track L — exposed for tests that drive the panel's double-
      // click descent / Escape exit state machine. The selection
      // context owns the source of truth; this just lets Playwright
      // observe and drive it.
      activeGroup,
      setActiveGroup,
      registries,
    };
  }

  // Consolidated worker-message subscribe. Routes the discrete
  // events into the right contexts; bulk traffic (camera, gestures)
  // bypasses this path via SAB / direct method calls.
  useEffect(() => {
    const off = client.subscribe((msg: WorkerToMain) => {
      if (msg.kind === "warning") {
        setWarnings((prev) => [
          ...prev,
          `${msg.payload.kind}: ${msg.payload.details}`,
        ]);
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
          void client
            .caretGeometry(sel)
            .then(setCaret)
            .catch(() => setCaret(null));
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
        <MenuBar />
        <FileDrop onFile={onFile} compact />
        <ToolToggle
          tools={registries.tools.list()}
          active={activeTool}
          onChange={setActiveTool}
        />
        {headerExtras}
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

      <CommandPalette />

      {/* Canvas-app-specific integration: legacy hooks (keyboard
       *   shortcuts, camera tweens, text editing) that read from
       *   the editor contexts but live in apps/canvas because they
       *   key off canvas-specific helpers. Renders nothing. */}
      {children}
    </div>
  );
}

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

function ToolToggle(props: {
  tools: readonly Tool[];
  active: string;
  onChange: (t: ActiveTool) => void;
}) {
  return (
    <div role="tablist" style={toolToggleStyle}>
      {props.tools.map((tool) => {
        const isActive = tool.key === props.active;
        const title = tool.tooltip ?? `${tool.label} tool (${tool.shortcut})`;
        return (
          <button
            key={tool.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={title}
            // Tools that map to a known `ActiveTool` flow into the
            // selection-context state. Bundle-registered tools with
            // other keys are accepted by the registry but currently
            // ignored by selection-context — that's the bundle hook
            // plan 2 §8.6 reserves for the bundle follow-up.
            onClick={() => props.onChange(tool.key as ActiveTool)}
            style={
              isActive
                ? { ...toolButtonStyle, ...toolButtonActiveStyle }
                : toolButtonStyle
            }
          >
            {tool.label}
          </button>
        );
      })}
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
