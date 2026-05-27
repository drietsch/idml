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
import type { SemanticGroupRegistry } from "../registries/semantic-group";
import type { Disposable } from "../registries/types";

export class PanelBridge {
  private handles = new Map<string, PanelHandle>();
  private registryUnsub: Disposable;
  private groupRemovedUnsub: Disposable;

  constructor(
    private panels: PanelRegistry,
    private substrate: DockingSubstrate,
    private semanticGroups: SemanticGroupRegistry,
  ) {
    // Re-mount every panel already in the registry (the order of
    // bridge construction vs. panel registration isn't guaranteed,
    // and re-mount-on-mount is the safe interpretation).
    for (const contribution of this.panels.list()) {
      this.mount(contribution);
    }

    this.registryUnsub = this.panels.onChange((event) => {
      if (event.kind === "registered") {
        this.mount(event.contribution);
      } else if (event.kind === "unregistered") {
        this.unmount(event.id);
      }
    });

    // When dockview dissolves a group (user closed all its tabs),
    // tell the semantic registry so subsequent contributions
    // targeting the same semantic name create a fresh group.
    this.groupRemovedUnsub = this.substrate.onGroupRemoved((groupId) => {
      // The semantic registry stores name → groupId, not the reverse.
      // Walk every panel handle to find which semantic name(s) had
      // this groupId. Cheap at Step 3 panel counts (<10).
      for (const [semanticName] of this.iterateSemanticReverse(groupId)) {
        this.semanticGroups.forget(semanticName);
      }
    });
  }

  /**
   * Tear down every subscription + mounted panel handle. Call on
   * shell unmount.
   */
  dispose(): void {
    this.registryUnsub.dispose();
    this.groupRemovedUnsub.dispose();
    for (const handle of this.handles.values()) {
      this.substrate.removePanel(handle);
    }
    this.handles.clear();
  }

  private mount(contribution: PanelContribution): void {
    const semanticName = contribution.defaultGroup ?? contribution.id;
    const groupId = this.semanticGroups.resolve(
      semanticName,
      contribution.defaultDock ?? "right",
      (dock) => this.substrate.createGroup(dock),
    );
    const handle = this.substrate.addPanel({
      id: contribution.id,
      title: contribution.title,
      component: contribution.component,
      groupId,
      closable: contribution.closable ?? true,
      movable: contribution.movable ?? true,
      // The canvas is the only built-in panel with chromeless tabs.
      // Bundle authors who want this opt in via a future flag on
      // PanelContribution; not exposed today.
      hideTabHeader: contribution.id === "verso.canvas",
    });
    this.handles.set(contribution.id, handle);
  }

  private unmount(id: string): void {
    const handle = this.handles.get(id);
    if (!handle) return;
    this.substrate.removePanel(handle);
    this.handles.delete(id);
  }

  /**
   * Yields every semantic name whose resolved group equals
   * `targetGroupId`. The semantic registry doesn't expose a reverse
   * index because its primary use is forward lookups; the bridge
   * walks its mounted-panel handles to reconstruct the mapping when
   * a group dissolves. Tied to handle bookkeeping so any panel
   * whose semantic group dissolves naturally reflects the change.
   */
  private *iterateSemanticReverse(targetGroupId: string): Iterable<[string, string]> {
    for (const [panelId, handle] of this.handles.entries()) {
      if (handle.groupId === targetGroupId) {
        const contribution = this.panels.get(panelId);
        const semanticName = contribution?.defaultGroup ?? panelId;
        yield [semanticName, targetGroupId];
      }
    }
  }
}
