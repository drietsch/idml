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
 * Cmd+K-driven command palette. Reads from the active
 * `CommandRegistry` and invokes the selected command through the
 * registry so visibility predicates + the editor handle wiring
 * apply uniformly. Mount once at the shell root; it overlays the
 * rest of the chrome via shadcn's `CommandDialog`.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { commands } = useRegistries();
  const [version, setVersion] = useState(0);

  // Subscribe to registry changes so newly registered commands show
  // up in the palette without remounting. Current CommandRegistry
  // doesn't yet emit an `onChange` event (Step 4 will add it
  // alongside the bundle loader); for now we re-evaluate on open.
  void version;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        setVersion((v) => v + 1);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const grouped = useMemo(() => groupByCategory(commands.list()), [commands, open]);

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
