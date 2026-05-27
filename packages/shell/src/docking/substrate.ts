// The docking-substrate seam. The single architectural commitment
// that absolutely cannot leak: no code outside
// `dockview-substrate.ts` imports from `dockview-react`. Every
// consumer talks to this interface; swapping the underlying
// library means rewriting exactly one file.

import type { ComponentType } from "react";

import type { Disposable } from "../registries/types";
import type { PanelProps } from "../registries/panel";

/**
 * Opaque layout snapshot — the substrate's `serialize()` returns a
 * value of this type; `restore()` accepts it. The internal shape
 * depends on the substrate (for dockview, it's a JSON blob). The
 * outside world never inspects it.
 */
export type LayoutSnapshot = unknown;

/**
 * Where a panel sits inside its parent group. `referenceGroup`
 * keys into the substrate's group registry; everything else is
 * a relative direction. Step 3 only uses `referenceGroup` (panels
 * are added to a pre-resolved semantic group); `direction` joins
 * later when bundle authors place panels by relation.
 */
export interface SemanticLocation {
  referenceGroup?: string;
  direction?: "left" | "right" | "top" | "bottom" | "within";
}

/**
 * Fully-resolved panel specification handed to the substrate. By
 * the time this lands, the `defaultGroup` semantic name has been
 * resolved to a concrete `groupId` by the SemanticGroupRegistry.
 */
export interface ResolvedPanelSpec {
  id: string;
  title: string;
  component: ComponentType<PanelProps>;
  /** Semantic group name (e.g. "structure", "center"). The substrate
   * lazily creates a real dockview group the first time a panel of a
   * given semantic name arrives; subsequent panels with the same
   * name land in the existing group. */
  semanticGroup: string;
  /** Initial dock edge used when materialising the semantic group. */
  defaultDock: "left" | "right" | "top" | "bottom" | "center";
  closable: boolean;
  movable: boolean;
  /** True for the canvas panel — suppresses the tab header so the
   * center looks like a chromeless viewport. */
  hideTabHeader?: boolean;
}

/**
 * Handle returned by `addPanel`. Identifies the panel + its current
 * group; consumers retain it for `removePanel` / `movePanel` calls.
 */
export interface PanelHandle {
  readonly id: string;
  readonly groupId: string;
}

export interface DockingSubstrate {
  /** Add a panel and return a handle. */
  addPanel(spec: ResolvedPanelSpec): PanelHandle;

  /** Remove a panel. */
  removePanel(handle: PanelHandle): void;

  /** Move a panel to a different semantic location. */
  movePanel(handle: PanelHandle, target: SemanticLocation): void;

  /** Serialize the entire layout for persistence. */
  serialize(): LayoutSnapshot;

  /** Restore a previously serialized layout. */
  restore(snapshot: LayoutSnapshot): void;

  /** Pop a group out into a separate browser window. */
  popoutGroup(groupId: string): void;

  /** Subscribe to layout changes (for auto-persistence). */
  onLayoutChange(handler: () => void): Disposable;

  /** Subscribe to group lifecycle (the SemanticGroupRegistry
   * uses this to forget mappings when the user dissolves a group). */
  onGroupRemoved(handler: (groupId: string) => void): Disposable;
}
