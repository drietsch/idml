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

let groupCounter = 0;

function nextGroupId(): string {
  groupCounter += 1;
  return `verso-group-${groupCounter}`;
}

/**
 * Dockview-backed implementation of `DockingSubstrate`. Created by
 * `DockviewRoot` (Step 3f) after dockview-react fires its `onReady`
 * event; consumers never instantiate this directly — they receive
 * a `DockingSubstrate` through context.
 */
export class DockviewSubstrate implements DockingSubstrate {
  private layoutChangeHandlers = new Set<() => void>();
  private groupRemovedHandlers = new Set<(groupId: string) => void>();

  constructor(private api: DockviewApi) {
    this.api.onDidLayoutChange(() => {
      for (const h of this.layoutChangeHandlers) h();
    });
    this.api.onDidRemoveGroup((group) => {
      for (const h of this.groupRemovedHandlers) h(group.id);
    });
  }

  addPanel(spec: ResolvedPanelSpec): PanelHandle {
    this.api.addPanel({
      id: spec.id,
      // Each panel registers under its own id in dockview's component
      // map — see DockviewRoot for the `components` registration.
      // Keeps the dockview-side mental model one-to-one.
      component: spec.id,
      title: spec.title,
      params: { panelId: spec.id },
      position: { referenceGroup: spec.groupId },
      ...(spec.hideTabHeader ? { tabComponent: "hidden" } : {}),
    });

    const panel = this.api.getPanel(spec.id);
    if (!panel) {
      throw new Error(
        `DockviewSubstrate: dockview did not add panel ${spec.id}`,
      );
    }

    // closable / movable enforcement: tab close is suppressed via
    // the `hidden` tab component for the canvas; broader closable
    // / movable constraints land alongside the locked-group work in
    // Step 3f when there's a tab component to bind them to.

    return { id: spec.id, groupId: spec.groupId };
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
    // dockview requires either a relative reference (group/panel) or
    // an absolute direction. Step 3 uses absolute placement for the
    // initial group; bundle-driven panels will switch to relative
    // when the bundle pipeline lands. `center` maps to "within"
    // which isn't valid as absolute — fall through to "right".
    const direction = defaultDock === "center" ? "right" : defaultDock;
    const group = this.api.addGroup({
      id: nextGroupId(),
      direction,
    });
    return group.id;
  }
}
