// Bridge between the declarative `PanelRegistry` and the
// imperative `DockingSubstrate`. This is the seam where data
// (contributions) meets operations (substrate calls).
//
// One panel registers via `panels.register(contribution)`; the
// bridge observes that, resolves the semantic group, and calls
// `substrate.addPanel(...)`. Same direction for unregister.
//
// Pure plumbing — no dockview-specific knowledge.

import type { DockingSubstrate, PanelHandle } from "./substrate";
import type {
  PanelContribution,
  PanelRegistry,
} from "../registries/panel";
import type { Disposable } from "../registries/types";

export class PanelBridge {
  private handles = new Map<string, PanelHandle>();
  private registryUnsub: Disposable;

  constructor(
    private panels: PanelRegistry,
    private substrate: DockingSubstrate,
    options: { skipInitialMount?: boolean } = {},
  ) {
    // Re-mount every panel already in the registry unless the
    // caller restored a persisted layout (which already populated
    // the substrate). The order of bridge construction vs. panel
    // registration isn't guaranteed; re-mount-on-mount is the safe
    // interpretation when there's no existing layout.
    if (!options.skipInitialMount) {
      for (const contribution of this.panels.list()) {
        this.mount(contribution);
      }
    }

    this.registryUnsub = this.panels.onChange((event) => {
      if (event.kind === "registered") {
        this.mount(event.contribution);
      } else if (event.kind === "unregistered") {
        this.unmount(event.id);
      }
    });
  }

  /**
   * Tear down every subscription + mounted panel handle. Call on
   * shell unmount.
   */
  dispose(): void {
    this.registryUnsub.dispose();
    for (const handle of this.handles.values()) {
      this.substrate.removePanel(handle);
    }
    this.handles.clear();
  }

  private mount(contribution: PanelContribution): void {
    const handle = this.substrate.addPanel({
      id: contribution.id,
      title: contribution.title,
      component: contribution.component,
      semanticGroup: contribution.defaultGroup ?? contribution.id,
      defaultDock: contribution.defaultDock ?? "right",
      closable: contribution.closable ?? true,
      movable: contribution.movable ?? true,
      // The canvas is the only built-in panel with chromeless tabs.
      // Bundle authors who want this opt in via a future flag on
      // PanelContribution; not exposed today.
      hideTabHeader: contribution.id === "paged.canvas",
    });
    this.handles.set(contribution.id, handle);
  }

  private unmount(id: string): void {
    const handle = this.handles.get(id);
    if (!handle) return;
    this.substrate.removePanel(handle);
    this.handles.delete(id);
  }
}
