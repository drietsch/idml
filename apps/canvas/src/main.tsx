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
  type OverlayContribution,
  type PanelContribution,
} from "@verso/shell";
import "@verso/shell/styles/globals.css";

import { CanvasClient } from "./channel/client";
import { CanvasPanel } from "./panels/canvas-panel";
import { InspectorPanel } from "./panels/inspector-panel";
import { LayersPanel } from "./panels/layers-panel";
import { NavigatorPanel } from "./panels/navigator-panel";
import { OutlinePanel } from "./panels/outline-panel";
import { TreePanel } from "./panels/tree-panel";
import { useAnimatedCamera } from "./ui/useAnimatedCamera";
import { useKeyboardShortcuts } from "./ui/useKeyboardShortcuts";
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
    id: "verso.layers",
    title: "Layers",
    component: LayersPanel,
    defaultDock: "right",
    defaultGroup: "inspector",
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

  return null;
}

/**
 * Root: owns the CanvasClient lifecycle and hands it to VersoShell.
 */
function CanvasAppRoot() {
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
