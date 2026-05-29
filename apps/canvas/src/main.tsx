import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  VersoShell,
  caretContribution,
  contentGrabberContribution,
  hitMarkerContribution,
  marqueeContribution,
  pageDecorationsContribution,
  pathEditContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  rulerGuidesContribution,
  selectionChromeContribution,
  snapLinesContribution,
  useCamera,
  useCanvasClient,
  useContentSelection,
  useDocument,
  useRegistries,
  type OverlayContribution,
  type PanelContribution,
} from "@verso/shell";
import "@verso/shell/styles/globals.css";

import { CanvasClient } from "@verso/client";
import { APP_KEYBINDINGS, APP_MENU_ITEMS, buildAppCommands } from "./app-commands";
import { CanvasPanel } from "./panels/canvas-panel";
import { CharacterPanel } from "./panels/character-panel";
import { ObjectTransformPanel } from "./panels/object-transform-panel";
import { StrokePanel } from "./panels/stroke-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { LayersPanel } from "./panels/layers-panel";
import { NavigatorPanel } from "./panels/navigator-panel";
import { OutlinePanel } from "./panels/outline-panel";
import { ReplPanel } from "./panels/repl-panel";
import { ScriptEditorPanel } from "./panels/script-editor";
import { TreePanel } from "./panels/tree-panel";
import { useAnimatedCamera } from "./ui/useAnimatedCamera";
import { useKeyboardShortcuts } from "./ui/useKeyboardShortcuts";
import { documentBounds, fitCamera, layoutPages } from "./ui/layout";
import { usePathEditMode } from "./ui/usePathEditMode";
import { useTextEditing } from "./ui/useTextEditing";
import { ZoomField } from "./ui/ZoomField";

// Default overlay contributions for the canvas app. Order is
// descriptive — actual paint order is determined by the
// contributions' `z` values inside OverlayHost.
const BUILT_IN_OVERLAYS: OverlayContribution[] = [
  pageDecorationsContribution,
  rulerGuidesContribution,
  hitMarkerContribution,
  selectionChromeContribution,
  resizeHandlesContribution,
  rotateHandleContribution,
  contentGrabberContribution,
  pathEditContribution,
  marqueeContribution,
  snapLinesContribution,
  caretContribution,
];

// The three built-in panels for the canvas app. Bundle authors
// register additional panels through the registry once Step 4's
// loader lands; for now these are the entire panel set.
const BUILT_IN_PANELS: PanelContribution[] = [
  {
    id: "verso.canvas",
    title: "Canvas",
    component: CanvasPanel,
    defaultDock: "center",
    defaultGroup: "center",
    closable: false,
    movable: false,
  },
  {
    id: "verso.pages",
    title: "Pages",
    component: NavigatorPanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.outline",
    title: "Outline",
    component: OutlinePanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.tree",
    title: "Tree",
    component: TreePanel,
    defaultDock: "left",
    defaultGroup: "structure",
  },
  {
    id: "verso.inspector",
    title: "Inspector",
    component: InspectorPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    // SDK Phase 3 — Character panel rendered as a declarative
    // composition over `@verso/catalog`. Bindings target content-
    // scope (the current text selection mapped to an
    // ElementId.storyRange); the apply arm at
    // (NodeId::StoryRange, Character*) commits each edit.
    id: "verso.character",
    title: "Character",
    component: CharacterPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 3 — Stroke panel as a declarative composition.
    // Element-scope bindings over existing FrameStrokeWeight +
    // FrameStrokeColor apply arms.
    id: "verso.stroke",
    title: "Stroke",
    component: StrokePanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    // SDK Phase 3 — Object/Transform panel. Element-scope bindings
    // over FrameBounds + FrameOpacity.
    id: "verso.object-transform",
    title: "Object",
    component: ObjectTransformPanel,
    defaultDock: "right",
    defaultGroup: "properties",
  },
  {
    id: "verso.layers",
    title: "Layers",
    component: LayersPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
  },
  {
    id: "verso.repl",
    title: "REPL",
    component: ReplPanel,
    defaultDock: "bottom",
    defaultGroup: "console",
  },
  {
    id: "verso.script-editor",
    title: "Script",
    component: ScriptEditorPanel,
    defaultDock: "bottom",
    defaultGroup: "console",
  },
];

/**
 * Canvas-app integration: legacy keyboard + camera + text-editing
 * hooks that read from the shell contexts but key off canvas
 * specifics (page rect math, IDML mutation API). Renders nothing —
 * mounted inside VersoShell as a side-effect-only child.
 */
function CanvasAppIntegration() {
  const client = useCanvasClient();
  const { camera, setCamera, viewportSize } = useCamera();
  const { handle } = useDocument();
  const { contentSelection, setContentSelection } = useContentSelection();
  const registries = useRegistries();

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
  usePathEditMode();

  // SDK Phase 4 — register canvas-app commands + menu items +
  // keybindings. Closures capture the *current* camera / handle /
  // viewportSize so the zoom commands see live values; dependency
  // array re-runs on each change. The registries' dedupe-by-id
  // contract means re-registration is safe (the dispose from the
  // previous run drops the stale handler before we add the new one).
  useEffect(() => {
    const [vw, vh] = viewportSize;
    const pageSizes = handle?.pageSizesPt ?? [];
    const rects = layoutPages(pageSizes);
    const commands = buildAppCommands({
      undo: () => {
        void client.undo();
      },
      redo: () => {
        void client.redo();
      },
      zoomIn: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        const newScale = camera.scale * 1.5;
        animateCamera({ scale: newScale, tx: cx - docX * newScale, ty: cy - docY * newScale });
      },
      zoomOut: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        const newScale = camera.scale / 1.5;
        animateCamera({ scale: newScale, tx: cx - docX * newScale, ty: cy - docY * newScale });
      },
      zoom100: () => {
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - camera.tx) / camera.scale;
        const docY = (cy - camera.ty) / camera.scale;
        animateCamera({ scale: 1, tx: cx - docX, ty: cy - docY });
      },
      zoomFit: () => {
        if (rects.length === 0) return;
        animateCamera(fitCamera(vw, vh, documentBounds(rects)));
      },
    });
    const cmdDisposables = commands.map((c) => registries.commands.register(c));
    const menuDisposables = APP_MENU_ITEMS.map((m) =>
      registries.menus.register(m),
    );
    const keyDisposables = APP_KEYBINDINGS.map((k) =>
      registries.keybindings.register(k),
    );
    return () => {
      for (const d of cmdDisposables) d.dispose();
      for (const d of menuDisposables) d.dispose();
      for (const d of keyDisposables) d.dispose();
    };
  }, [registries, client, camera, viewportSize, handle, animateCamera]);

  return null;
}

/**
 * Root: owns the CanvasClient lifecycle and hands it to VersoShell.
 */
function CanvasAppRoot() {
  const [client, setClient] = useState<CanvasClient | null>(null);

  useEffect(() => {
    // SDK Phase 1 — `@verso/client` is framework-agnostic, so the
    // worker URL is constructed in the app's module graph (where
    // `import.meta.url` resolves correctly + Vite's static worker
    // chunking can pick it up).
    const c = new CanvasClient({
      workerUrl: new URL("./worker/worker.ts", import.meta.url),
    });
    setClient(c);
    return () => {
      c.dispose();
      setClient(null);
    };
  }, []);

  if (!client) {
    return (
      <div
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
          padding: 16,
        }}
      >
        initialising worker…
      </div>
    );
  }

  return (
    <VersoShell
      client={client}
      panels={BUILT_IN_PANELS}
      overlays={BUILT_IN_OVERLAYS}
      headerExtras={<ZoomField />}
    >
      <CanvasAppIntegration />
    </VersoShell>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}
// StrictMode intentionally disabled: dockview-react's React-part
// lifecycle isn't StrictMode-safe — its components are disposed
// twice on dev double-mount and throw `resource already disposed`.
// Re-enable once dockview ships a StrictMode-aware fix.
createRoot(root).render(<CanvasAppRoot />);
