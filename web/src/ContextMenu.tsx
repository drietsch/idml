// Lightweight context menu for the editor canvas. Right-click on a
// frame opens it; click outside or Escape dismisses. Items are wired
// to the same command vocabulary the toolbar / Inspector use, so the
// menu is purely an alternate input surface.

import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface Props {
  /** CSS-px position relative to the viewport (clientX/Y). */
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocPointerDown(ev: PointerEvent) {
      if (!ref.current) return;
      if (ref.current.contains(ev.target as Node)) return;
      onClose();
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onDocPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className={`context-menu-item${item.danger ? " danger" : ""}`}
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}
