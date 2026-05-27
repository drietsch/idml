import { useEffect, useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import type { MenuItemContribution } from "../registries";
import { useRegistries } from "../state/registries-context";

/**
 * Top-level menu bar. Reads from `MenuRegistry`, groups items by the
 * leading path segment (e.g. `"File"`, `"View"`), and renders each
 * group as a shadcn `DropdownMenu`. Items are dispatched through the
 * command registry — selecting one calls
 * `commands.invoke(item.command)`.
 *
 * Step 4 ships one level of grouping. Nested submenus aren't
 * supported yet; a path like `"View/Theme/Light"` collapses to a
 * "Theme/Light" leaf under the View group. Sub-menus land if a
 * later bundle needs them.
 */
export function MenuBar() {
  const { menus, commands } = useRegistries();
  const [version, setVersion] = useState(0);

  // Re-render when items are added or removed so palette-toggle
  // commands etc. show up as soon as the shell registers them.
  useEffect(() => {
    const sub = menus.onChange(() => {
      setVersion((v) => v + 1);
    });
    return () => sub.dispose();
  }, [menus]);

  const groups = useMemo(() => groupByTopLevel(menus.list()), [menus, version]);

  if (groups.length === 0) return null;

  return (
    <nav aria-label="Main menu" style={menuBarStyle}>
      {groups.map(([label, items]) => (
        <DropdownMenu key={label}>
          <DropdownMenuTrigger style={triggerStyle}>
            {label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            {renderItems(items, (id) => void commands.invoke(id))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </nav>
  );
}

interface GroupedItem {
  /** Display label — every path segment after the top-level group,
   * joined with " ▸ " for any nested labels. */
  label: string;
  command: string;
  order: number;
  group?: string;
}

function groupByTopLevel(
  items: MenuItemContribution[],
): Array<[string, GroupedItem[]]> {
  const groups = new Map<string, GroupedItem[]>();
  for (const item of items) {
    const segments = item.path.split("/").filter(Boolean);
    if (segments.length < 2) continue; // Drop items with no group prefix.
    const [top, ...rest] = segments;
    const grouped: GroupedItem = {
      label: rest.join(" ▸ "),
      command: item.command,
      order: item.order ?? 100,
      group: item.group,
    };
    const bucket = groups.get(top);
    if (bucket) bucket.push(grouped);
    else groups.set(top, [grouped]);
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }
  return Array.from(groups.entries()).sort(([a], [b]) =>
    topLevelOrder(a) - topLevelOrder(b),
  );
}

/** Canonical top-level menu ordering. Anything not listed lands
 * after the named menus in alphabetical order. */
function topLevelOrder(label: string): number {
  const i = ["File", "Edit", "View", "Tools", "Help"].indexOf(label);
  return i >= 0 ? i : 100 + label.charCodeAt(0);
}

function renderItems(
  items: GroupedItem[],
  invoke: (commandId: string) => void,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastGroup: string | undefined;
  items.forEach((item, idx) => {
    if (idx > 0 && item.group !== lastGroup) {
      out.push(<DropdownMenuSeparator key={`sep-${idx}`} />);
    }
    lastGroup = item.group;
    out.push(
      <DropdownMenuItem
        key={item.command}
        onSelect={() => invoke(item.command)}
      >
        {item.label}
      </DropdownMenuItem>,
    );
  });
  return out;
}

const menuBarStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 0,
};

const triggerStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "4px 10px",
  fontSize: 13,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  cursor: "pointer",
  color: "#374151",
  borderRadius: 4,
};
