import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FunctionComponent,
} from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";

import type { PanelProps } from "../registries/panel";
import { useRegistries } from "../state/registries-context";
import { useVerso } from "../state/verso-editor";
import { DockviewSubstrate } from "./dockview-substrate";
import { PanelBridge } from "./panel-bridge";
import {
  DockingSubstrateProvider,
  useSetDockingSubstrate,
} from "./substrate-context";

/**
 * Generic dockview panel wrapper. Each registered panel id maps
 * to a component-name registered with dockview; the actual React
 * component lives in the registry. This wrapper looks up the
 * panel-id from `params.panelId`, pulls the contribution, and
 * renders its `component` with the `PanelProps` shape.
 *
 * Closing over `panelId` here (vs reading it from the registry on
 * each render) is wrong — registry changes wouldn't refresh the
 * dockview side. Instead the components map below is rebuilt when
 * the registry changes and each component captures the
 * contribution at build time.
 */
function makePanelComponent(
  panelId: string,
  Component: ComponentType<PanelProps>,
): FunctionComponent<IDockviewPanelProps> {
  const Wrapper: FunctionComponent<IDockviewPanelProps> = () => {
    const verso = useVerso();
    return <Component verso={verso} api={{ id: panelId }} />;
  };
  Wrapper.displayName = `DockviewPanel(${panelId})`;
  return Wrapper;
}

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
  const { panels, semanticGroups } = useRegistries();
  const setSubstrate = useSetDockingSubstrate();
  const [registryVersion, setRegistryVersion] = useState(0);
  const bridgeRef = useRef<PanelBridge | null>(null);
  const substrateRef = useRef<DockviewSubstrate | null>(null);

  // Re-render when the panel registry changes so the components
  // map below picks up newly-registered contributions. The version
  // counter is a cheap signal — we don't need to know what changed.
  useEffect(() => {
    const sub = panels.onChange(() => {
      setRegistryVersion((v) => v + 1);
    });
    return () => sub.dispose();
  }, [panels]);

  // Build the dockview components map: one entry per panel id.
  // Rebuilt whenever the registry version bumps.
  const components = useMemo<Record<string, FunctionComponent<IDockviewPanelProps>>>(() => {
    void registryVersion;
    const out: Record<string, FunctionComponent<IDockviewPanelProps>> = {};
    for (const c of panels.list()) {
      out[c.id] = makePanelComponent(c.id, c.component);
    }
    return out;
  }, [panels, registryVersion]);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const substrate = new DockviewSubstrate(event.api);
      const bridge = new PanelBridge(panels, substrate, semanticGroups);
      substrateRef.current = substrate;
      bridgeRef.current = bridge;
      setSubstrate(substrate);
      // Layout-persistence wiring lands in 3h.
    },
    [panels, semanticGroups, setSubstrate],
  );

  // Tear down bridge + substrate on unmount.
  useEffect(() => {
    return () => {
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
      substrateRef.current = null;
      setSubstrate(null);
    };
  }, [setSubstrate]);

  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      className={className ?? "dockview-theme-light"}
    />
  );
}
