import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  ElementGeometryItem,
  ElementId,
} from "../../../../apps/canvas/src/channel/protocol";

export type ActiveTool = "select" | "text";

interface SelectionContextValue {
  /** Currently-selected page items (text frames, rectangles, …). */
  elementSelection: ElementId[];
  setElementSelection: (ids: ElementId[]) => void;

  /** Oriented bounds + transform for every selected element. The
   * overlay multiplies bounds by the transform to draw chrome
   * without re-deriving the math in TS. */
  elementGeometry: ElementGeometryItem[];
  setElementGeometry: (items: ElementGeometryItem[]) => void;

  /** Active mode: select = element gestures, text = caret/typing. */
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;

  /** Step 5c — path-edit mode. While `true`, the path-edit overlay
   * renders anchor + handle dots on the selected polygon and the
   * pointer routes hits through `hit_path_anchor` instead of the
   * default frame hit. Enter on a single Polygon enters; Escape
   * exits. The mode auto-exits when the selection clears or the
   * active tool changes. */
  pathEditMode: boolean;
  setPathEditMode: (enabled: boolean) => void;
}

const Context = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: PropsWithChildren) {
  const [elementSelection, setElementSelection] = useState<ElementId[]>([]);
  const [elementGeometry, setElementGeometry] = useState<ElementGeometryItem[]>(
    [],
  );
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [pathEditMode, setPathEditMode] = useState<boolean>(false);

  const value = useMemo<SelectionContextValue>(
    () => ({
      elementSelection,
      setElementSelection,
      elementGeometry,
      setElementGeometry,
      activeTool,
      setActiveTool,
      pathEditMode,
      setPathEditMode,
    }),
    [elementSelection, elementGeometry, activeTool, pathEditMode],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSelection called outside SelectionProvider");
  }
  return ctx;
}
