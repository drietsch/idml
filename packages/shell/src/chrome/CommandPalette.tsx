import { useEffect, useMemo, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../components/ui/command";
import type { CommandContribution } from "../registries";
import { useRegistries } from "../state/registries-context";

/**
 * Module-level event emitter for the palette's open/toggle state.
 * Listeners are the mounted palette components; emitters are
 * registered commands (`verso.palette.toggle`, `…open`, `…close`)
 * + the keybinding registry that routes Cmd+K through them.
 *
 * Module scope so external command handlers can fire the toggle
 * without crossing the React context boundary.
 */
type PaletteAction = "toggle" | "open" | "close";
const listeners = new Set<(action: PaletteAction) => void>();

/** Emit a palette action. Idempotent — safe to call from anywhere. */
export function notifyPalette(action: PaletteAction): void {
  for (const fn of listeners) fn(action);
}

/**
 * Cmd+K-driven command palette. Reads from the active
 * `CommandRegistry` and invokes the selected command through the
 * registry so visibility predicates + the editor handle wiring
 * apply uniformly. Mount once at the shell root.
 *
 * The Cmd+K shortcut itself is registered through the
 * KeybindingRegistry (in `built-in-commands.ts`) and dispatches to
 * the `verso.palette.toggle` command, which calls
 * `notifyPalette("toggle")` to flip the local React state.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { commands } = useRegistries();
  const [version, setVersion] = useState(0);
  void version;

  useEffect(() => {
    const handler = (action: PaletteAction) => {
      if (action === "toggle") {
        setOpen((v) => !v);
        setVersion((v) => v + 1);
      } else if (action === "open") {
        setOpen(true);
        setVersion((v) => v + 1);
      } else {
        setOpen(false);
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const grouped = useMemo(
    () => groupByCategory(commands.list()),
    [commands, open],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {grouped.map(([category, items], idx) => (
          <div key={category}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={category}>
              {items.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={`${category} ${cmd.title} ${cmd.id}`}
                  onSelect={() => {
                    setOpen(false);
                    void commands.invoke(cmd.id);
                  }}
                >
                  <span>{cmd.title}</span>
                  <span className="ml-auto text-xs opacity-50">{cmd.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

function groupByCategory(
  items: CommandContribution[],
): Array<[string, CommandContribution[]]> {
  const groups = new Map<string, CommandContribution[]>();
  for (const cmd of items) {
    const category = cmd.category ?? "Other";
    const bucket = groups.get(category);
    if (bucket) {
      bucket.push(cmd);
    } else {
      groups.set(category, [cmd]);
    }
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}
