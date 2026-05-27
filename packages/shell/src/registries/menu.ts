import type { Disposable, VisibilityPredicate } from "./types";

/**
 * Declarative menu item. Items contribute themselves to a path-based
 * tree — `"File/Open IDML…"` → File menu, "Open IDML…" leaf. The
 * shell renders top-level path segments as drop-down menus; nested
 * paths nest as sub-menus.
 *
 * Menu items are commands underneath: selecting one invokes
 * `commands.invoke(command)`. Reuse beats parallel surfaces, so
 * keybindings, palette entries, and menu items all dispatch to the
 * same command id.
 */
export interface MenuItemContribution {
  /** Slash-separated path. `"File/Open IDML…"`, `"View/Show: Pages"`. */
  path: string;

  /** Command id this item invokes when selected. */
  command: string;

  /** Lower numbers float up within their menu group. Default 100. */
  order?: number;

  /** Optional separator group. Items with the same group cluster;
   * different groups render with a visual separator between them. */
  group?: string;

  /** Optional visibility predicate. Same shape + Step-3 semantics
   * (function evaluated against application state; DSL string is
   * inert until the evaluator lands in a later step). */
  when?: VisibilityPredicate;
}

export type MenuRegistryEvent =
  | { kind: "registered"; contribution: MenuItemContribution }
  | { kind: "unregistered"; path: string };

export interface MenuRegistry {
  register(contribution: MenuItemContribution): Disposable;
  unregister(path: string): void;
  get(path: string): MenuItemContribution | undefined;
  list(): MenuItemContribution[];
  onChange(handler: (event: MenuRegistryEvent) => void): Disposable;
}

/**
 * Default in-memory `MenuRegistry`. Path is the dedupe key; two
 * items at the same path conflict the way two panels at the same id
 * conflict. Insertion order is preserved within a sort-by-order tie.
 */
export function createMenuRegistry(): MenuRegistry {
  const byPath = new Map<string, MenuItemContribution>();
  const listeners = new Set<(event: MenuRegistryEvent) => void>();

  function emit(event: MenuRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(contribution) {
      if (byPath.has(contribution.path)) {
        throw new Error(
          `MenuRegistry: path "${contribution.path}" already registered`,
        );
      }
      byPath.set(contribution.path, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byPath.delete(contribution.path)) {
            emit({ kind: "unregistered", path: contribution.path });
          }
        },
      };
    },
    unregister(path) {
      if (byPath.delete(path)) {
        emit({ kind: "unregistered", path });
      }
    },
    get(path) {
      return byPath.get(path);
    },
    list() {
      return Array.from(byPath.values());
    },
    onChange(handler) {
      listeners.add(handler);
      return {
        dispose() {
          listeners.delete(handler);
        },
      };
    },
  };
}
