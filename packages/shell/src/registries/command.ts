import type { Disposable, VisibilityPredicate } from "./types";

/**
 * Canonical action primitive. Every menu item, every keybinding,
 * every command-palette entry resolves to a command. The handler
 * receives the editor handle (and an optional payload for
 * parameterised commands like `verso.page.goto`).
 */
export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  icon?: string;
  handler: (verso: unknown, payload?: unknown) => void | Promise<void>;
  /** Optional enablement predicate. Disabled commands appear greyed. */
  when?: VisibilityPredicate;
}

export interface CommandRegistry {
  register(contribution: CommandContribution): Disposable;
  unregister(id: string): void;
  invoke(id: string, payload?: unknown): Promise<void>;
  get(id: string): CommandContribution | undefined;
  list(): CommandContribution[];
}

/**
 * Backing for `invoke`: callers expect the registered handler to
 * run against the current `VersoEditor`. The registry holds a thunk
 * provided at construction so the shell can rebind the editor
 * reference without recreating the registry.
 */
export function createCommandRegistry(
  getEditor: () => unknown,
): CommandRegistry {
  const byId = new Map<string, CommandContribution>();

  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `CommandRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      return {
        dispose() {
          byId.delete(contribution.id);
        },
      };
    },
    unregister(id) {
      byId.delete(id);
    },
    async invoke(id, payload) {
      const cmd = byId.get(id);
      if (!cmd) {
        throw new Error(`CommandRegistry: unknown command "${id}"`);
      }
      const editor = getEditor();
      await cmd.handler(editor, payload);
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values());
    },
  };
}
