import {
  useCallback,
  useEffect,
  useRef,
  type FunctionComponent,
} from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";

import { useRegistries } from "../state/registries-context";
import { useVerso } from "../state/verso-editor";
import {
  restoreLayoutOrDefault,
  setupLayoutPersistence,
} from "../persistence/layout-persistence";
import type { Disposable } from "../registries/types";
import { DockviewSubstrate } from "./dockview-substrate";
import { PanelBridge } from "./panel-bridge";
import {
  DockingSubstrateProvider,
  useSetDockingSubstrate,
} from "./substrate-context";

/** Component name dockview uses for every panel — a single stable
 * router rather than per-panel registrations. Each panel passes its
 * id through `params.panelId`; the router resolves the contribution
 * at render time. Avoids the components-map-capture issue where
 * dockview snapshots the prop at mount and won't pick up later
 * additions. */
const PANEL_COMPONENT_NAME = "verso-panel";

/**
 * Single panel renderer registered with dockview. Looks up the panel
 * id from `params.panelId`, pulls the contribution from the panel
 * registry, and renders its `component` with `{ verso, api }`.
 *
 * Defined at module scope so the components map passed to
 * `DockviewReact` is referentially stable across renders.
 */
const PanelRouter: FunctionComponent<IDockviewPanelProps> = (props) => {
  const verso = useVerso();
  const { panels } = useRegistries();
  const panelId = (props.params as { panelId?: string } | undefined)?.panelId;
  if (!panelId) {
    return <div style={{ padding: 12, opacity: 0.6 }}>Missing panel id.</div>;
  }
  const contribution = panels.get(panelId);
  if (!contribution) {
    return (
      <div style={{ padding: 12, opacity: 0.6 }}>
        Panel <code>{panelId}</code> not registered.
      </div>
    );
  }
  const Component = contribution.component;
  return <Component verso={verso} api={{ id: panelId }} />;
};

// Stable components map. dockview captures the prop at mount and
// doesn't refresh later additions, so we register a single router
// and route by id at render time.
const DOCKVIEW_COMPONENTS = { [PANEL_COMPONENT_NAME]: PanelRouter };

/**
 * Mounts dockview, builds the substrate on ready, and instantiates
 * the panel bridge. Must be wrapped inside the editor providers
 * (CanvasClientProvider, …, VersoEditorProvider) — it reads from
 * the registries and from `useVerso`.
 *
 * Wraps itself in a `DockingSubstrateProvider` so any nested
 * consumer can call `useDockingSubstrate()`.
 */
export function DockviewRoot(props: { className?: string }) {
  return (
    <DockingSubstrateProvider>
      <DockviewRootInner className={props.className} />
    </DockingSubstrateProvider>
  );
}

function DockviewRootInner({ className }: { className?: string }) {
  const { panels } = useRegistries();
  const setSubstrate = useSetDockingSubstrate();
  const bridgeRef = useRef<PanelBridge | null>(null);
  const substrateRef = useRef<DockviewSubstrate | null>(null);
  const persistRef = useRef<Disposable | null>(null);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const substrate = new DockviewSubstrate(event.api, PANEL_COMPONENT_NAME);
      substrateRef.current = substrate;

      // Restore a persisted layout if one exists; otherwise fall
      // through to the bridge's initial-mount path which iterates
      // panels.list() and adds each via substrate.addPanel.
      let restored = false;
      restoreLayoutOrDefault(substrate, () => {
        /* default = bridge's initial mount below */
      });
      // restoreLayoutOrDefault calls substrate.restore on success;
      // we infer "restored" from the substrate's current panels. If
      // dockview has any panels after restore, treat it as restored.
      restored = (event.api.panels?.length ?? 0) > 0;

      const bridge = new PanelBridge(panels, substrate, {
        skipInitialMount: restored,
      });
      bridgeRef.current = bridge;
      setSubstrate(substrate);

      // Start the debounced-write persistence loop.
      persistRef.current = setupLayoutPersistence(substrate);
    },
    [panels, setSubstrate],
  );

  // Tear down bridge + substrate on unmount.
  useEffect(() => {
    return () => {
      persistRef.current?.dispose();
      persistRef.current = null;
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
      substrateRef.current = null;
      setSubstrate(null);
    };
  }, [setSubstrate]);

  return (
    <DockviewReact
      components={DOCKVIEW_COMPONENTS}
      onReady={onReady}
      className={className ?? "dockview-theme-light"}
    />
  );
}
