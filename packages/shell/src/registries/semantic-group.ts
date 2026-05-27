import type { DockEdge } from "./types";

/**
 * Bridges bundle-declared semantic placement (`defaultGroup:
 * "structure"`) to concrete dockview group IDs created at runtime.
 *
 * Resolution rule: if a semantic name has never been seen, create
 * a new dockview group docked to `defaultDock`, register the
 * mapping, return its ID. If it has been seen and the group still
 * exists, return its ID. If it has been seen but the group was
 * dissolved (user closed all its tabs), re-resolve as if new —
 * the substrate calls `forget` on dissolution.
 */
export interface SemanticGroupRegistry {
  /** Get the dockview group ID for a semantic name, creating one if
   * needed. The factory is invoked exactly when a new group must be
   * created — never when an existing mapping is reused. */
  resolve(
    name: string,
    defaultDock: DockEdge,
    create: (defaultDock: DockEdge) => string,
  ): string;

  /** Look up without creating. */
  lookup(name: string): string | undefined;

  /** Called by the substrate when a dockview group is removed
   * (user closed all tabs). */
  forget(name: string): void;
}

export function createSemanticGroupRegistry(): SemanticGroupRegistry {
  const byName = new Map<string, string>();

  return {
    resolve(name, defaultDock, create) {
      const existing = byName.get(name);
      if (existing !== undefined) {
        return existing;
      }
      const groupId = create(defaultDock);
      byName.set(name, groupId);
      return groupId;
    },
    lookup(name) {
      return byName.get(name);
    },
    forget(name) {
      byName.delete(name);
    },
  };
}
