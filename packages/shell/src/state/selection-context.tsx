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
} from "@paged-media/client";

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

  /** Track J — flat anchor index inside the path-edit target's
   * anchor table that the user has clicked. `null` when no anchor
   * is selected. Backspace/Delete uses this to address the
   * `PathPointRemove` mutation; double-click uses it to address the
   * `PathPointCurveType` toggle. Cleared on path-edit exit, on
   * selection change, and on Escape. */
  selectedAnchorIndex: number | null;
  setSelectedAnchorIndex: (index: number | null) => void;

  /** Track L — the group the user has "entered" via double-click.
   * `null` when no group is active (default — single-click selects
   * the outermost group containing the hit). When set, single-click
   * scopes to the group's leaves and Escape exits. The held value
   * is the group's `self_id`, not an `ElementId`, because the only
   * place the value gets compared is the canvas-panel's onHit
   * handler — keeping it as a plain string sidesteps cross-package
   * ElementId imports for state-only consumers. */
  activeGroup: string | null;
  setActiveGroup: (groupId: string | null) => void;
}

const Context = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: PropsWithChildren) {
  const [elementSelection, setElementSelection] = useState<ElementId[]>([]);
  const [elementGeometry, setElementGeometry] = useState<ElementGeometryItem[]>(
    [],
  );
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [pathEditMode, setPathEditMode] = useState<boolean>(false);
  const [selectedAnchorIndex, setSelectedAnchorIndex] = useState<number | null>(
    null,
  );
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

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
      selectedAnchorIndex,
      setSelectedAnchorIndex,
      activeGroup,
      setActiveGroup,
    }),
    [
      elementSelection,
      elementGeometry,
      activeTool,
      pathEditMode,
      selectedAnchorIndex,
      activeGroup,
    ],
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
