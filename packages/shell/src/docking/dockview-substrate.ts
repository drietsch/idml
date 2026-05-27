// THE ONLY FILE that imports from dockview-react. Everything else
// in @verso/shell, every consuming app, and every third-party
// bundle interacts with the abstract `DockingSubstrate`. Keep
// this discipline absolute — a single leak and the substrate seam
// no longer protects swappability.

import type { DockviewApi, DockviewGroupPanel } from "dockview-react";

import type {
  DockingSubstrate,
  LayoutSnapshot,
  PanelHandle,
  ResolvedPanelSpec,
  SemanticLocation,
} from "./substrate";
import type { Disposable } from "../registries/types";

/**
 * Dockview-backed implementation of `DockingSubstrate`. Created by
 * `DockviewRoot` (Step 3f) after dockview-react fires its `onReady`
 * event; consumers never instantiate this directly — they receive
 * a `DockingSubstrate` through context.
 */
export class DockviewSubstrate implements DockingSubstrate {
  private layoutChangeHandlers = new Set<() => void>();
  private groupRemovedHandlers = new Set<(groupId: string) => void>();
  /** Maps a semantic group name (e.g. "structure") to the real
   * dockview group id that hosts its panels. Re-populated lazily as
   * the first panel of each semantic name arrives. */
  private semanticToGroupId = new Map<string, string>();

  constructor(private api: DockviewApi, private panelComponentName: string) {
    this.api.onDidLayoutChange(() => {
      for (const h of this.layoutChangeHandlers) h();
    });
    this.api.onDidRemoveGroup((group) => {
      // Forget any semantic mapping that pointed to this group so the
      // next panel of the same semantic name materialises fresh.
      for (const [name, id] of this.semanticToGroupId) {
        if (id === group.id) this.semanticToGroupId.delete(name);
      }
      for (const h of this.groupRemovedHandlers) h(group.id);
    });
  }

  addPanel(spec: ResolvedPanelSpec): PanelHandle {
    // Idempotency: if a previously-restored layout already contains a
    // panel with this id, reuse it. Re-add would throw — dockview's
    // panel-id uniqueness check fires before any of our state. This
    // case fires every reload once layout persistence is on: restore
    // re-creates the panel, then the registry's "registered" event
    // arrives and the bridge tries to mount it again.
    const existingPanel = this.api.getPanel(spec.id);
    if (existingPanel) {
      const groupId = existingPanel.group.id;
      // Track the semantic mapping so subsequent panels of the same
      // semantic group land in this group rather than spawning a
      // duplicate group.
      if (!this.semanticToGroupId.has(spec.semanticGroup)) {
        this.semanticToGroupId.set(spec.semanticGroup, groupId);
      }
      return { id: spec.id, groupId };
    }

    const existingGroupId = this.semanticToGroupId.get(spec.semanticGroup);

    if (existingGroupId !== undefined) {
      // Subsequent panel of an existing semantic group — drop it into
      // the same dockview group.
      this.api.addPanel({
        id: spec.id,
        component: this.panelComponentName,
        title: spec.title,
        params: { panelId: spec.id },
        position: { referenceGroup: existingGroupId },
        // hideTabHeader is honoured once a hidden-tab component is
      // registered in DockviewRoot — Step 3g's swap is the first
      // place tab chrome appears, and the canvas panel can live
      // with a default tab until then.
      });
      return { id: spec.id, groupId: existingGroupId };
    }

    // First panel of this semantic group — place it with an absolute
    // direction so dockview materialises a fresh group around it.
    // `center` has no dockview equivalent; fall through to "right"
    // (the first call ends up at the root regardless of direction).
    const direction =
      spec.defaultDock === "center" ? "right" : spec.defaultDock;
    this.api.addPanel({
      id: spec.id,
      component: this.panelComponentName,
      title: spec.title,
      params: { panelId: spec.id },
      position: { direction },
      // hideTabHeader is honoured once a hidden-tab component is
      // registered in DockviewRoot — Step 3g's swap is the first
      // place tab chrome appears, and the canvas panel can live
      // with a default tab until then.
    });

    const panel = this.api.getPanel(spec.id);
    if (!panel) {
      throw new Error(
        `DockviewSubstrate: dockview did not add panel ${spec.id}`,
      );
    }
    const groupId = panel.group.id;
    this.semanticToGroupId.set(spec.semanticGroup, groupId);
    return { id: spec.id, groupId };
  }

  removePanel(handle: PanelHandle): void {
    const panel = this.api.getPanel(handle.id);
    if (panel) {
      this.api.removePanel(panel);
    }
  }

  movePanel(handle: PanelHandle, target: SemanticLocation): void {
    const panel = this.api.getPanel(handle.id);
    if (!panel || !target.referenceGroup) return;
    const group = this.api.getGroup(target.referenceGroup);
    if (!group) return;
    // dockview's getGroup returns the public interface; moveTo
    // wants the concrete class. The runtime value is the same
    // instance — this is a TS-only widening.
    panel.api.moveTo({ group: group as DockviewGroupPanel });
  }

  serialize(): LayoutSnapshot {
    return this.api.toJSON();
  }

  restore(snapshot: LayoutSnapshot): void {
    // dockview's fromJSON owns the wire shape; the substrate just
    // forwards it. Throwing on a mismatched shape lands inside
    // dockview-react with a sensible error.
    this.api.fromJSON(snapshot as Parameters<DockviewApi["fromJSON"]>[0]);
  }

  popoutGroup(groupId: string): void {
    const group = this.api.getGroup(groupId);
    if (!group) return;
    this.api.addPopoutGroup(group as DockviewGroupPanel);
  }

  onLayoutChange(handler: () => void): Disposable {
    this.layoutChangeHandlers.add(handler);
    return {
      dispose: () => {
        this.layoutChangeHandlers.delete(handler);
      },
    };
  }

  onGroupRemoved(handler: (groupId: string) => void): Disposable {
    this.groupRemovedHandlers.add(handler);
    return {
      dispose: () => {
        this.groupRemovedHandlers.delete(handler);
      },
    };
  }

  createGroup(defaultDock: "left" | "right" | "top" | "bottom" | "center"): string {
    // dockview auto-generates group IDs; we return its id rather
    // than ours. dockview has no "center" direction — the first
    // group becomes the root regardless of direction, so we use
    // "right" as the canonical fallback for "center".
    const direction = defaultDock === "center" ? "right" : defaultDock;
    const group = this.api.addGroup({ direction });
    return group.id;
  }
}
