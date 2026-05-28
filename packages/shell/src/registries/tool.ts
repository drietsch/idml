import type { Disposable } from "./types";

/**
 * Plan 2 §8.6 — declarative tool manifest. A `Tool` is a button-like
 * entry in the editor toolbar. The shell renders the registry as the
 * tool palette; bundles can register additional tools without
 * touching shell internals (mirrors `PanelContribution`).
 *
 * Today's seed registry carries the two built-in tools (select / text).
 * `accepts` is reserved for future use: when wired, the gesture spine
 * can consult the active tool's predicate before dispatching a
 * gesture — e.g. a "scissors" tool that only accepts curve clicks.
 */
export interface Tool {
  /** Stable identifier. Matches `ActiveTool` for built-in tools. */
  key: string;
  /** Short label shown in the toolbar button. */
  label: string;
  /** Keyboard shortcut (single letter, displayed in tooltips). */
  shortcut: string;
  /** Optional human-readable title for the button's `title` attribute.
   *  Defaults to `"<key> tool (<shortcut>)"` when omitted. */
  tooltip?: string;
  /** Optional predicate. Reserved — not consulted by the current
   *  gesture dispatch path. Bundles can supply one in anticipation
   *  of the bundle-driven gesture routing follow-up. */
  accepts?: (gesture: { kind: string }) => boolean;
}

export type ToolRegistryEvent =
  | { kind: "registered"; tool: Tool }
  | { kind: "unregistered"; key: string };

export interface ToolRegistry {
  register(tool: Tool): Disposable;
  unregister(key: string): void;
  get(key: string): Tool | undefined;
  list(): Tool[];
  onChange(handler: (event: ToolRegistryEvent) => void): Disposable;
}

/**
 * Default in-memory `ToolRegistry`. Insertion order is preserved so
 * the toolbar renders entries in registration order.
 */
export function createToolRegistry(): ToolRegistry {
  const byKey = new Map<string, Tool>();
  const listeners = new Set<(event: ToolRegistryEvent) => void>();

  function emit(event: ToolRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(tool) {
      if (byKey.has(tool.key)) {
        throw new Error(
          `ToolRegistry: key "${tool.key}" already registered`,
        );
      }
      byKey.set(tool.key, tool);
      emit({ kind: "registered", tool });
      return {
        dispose() {
          if (byKey.delete(tool.key)) {
            emit({ kind: "unregistered", key: tool.key });
          }
        },
      };
    },
    unregister(key) {
      if (byKey.delete(key)) {
        emit({ kind: "unregistered", key });
      }
    },
    get(key) {
      return byKey.get(key);
    },
    list() {
      return Array.from(byKey.values());
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

/**
 * Built-in tools the shell registers at startup. Bundles can
 * register additional tools later — the registry is open-ended.
 * Keys MUST match the `ActiveTool` literal union; the registry's
 * value type is `string` so future bundle-defined tools can join.
 */
export const DEFAULT_TOOLS: Tool[] = [
  { key: "select", label: "V", shortcut: "V", tooltip: "Selection tool (V)" },
  { key: "text", label: "T", shortcut: "T", tooltip: "Text tool (T)" },
];
