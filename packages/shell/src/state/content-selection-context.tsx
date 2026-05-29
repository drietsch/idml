import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  CaretGeometry,
  ContentSelection,
  SelectionRect,
} from "@verso/client";

import { useCanvasClient } from "./canvas-client-context";

interface ContentSelectionContextValue {
  /** Canonical content selection (story + offsets + affinity). */
  contentSelection: ContentSelection | null;
  /** Setter that round-trips through the worker — every change posts
   * `SetSelection` and refreshes caret + selection geometry. */
  setContentSelection: (sel: ContentSelection | null) => void;

  /** Caret position for the current selection's start offset. */
  caret: CaretGeometry | null;
  setCaret: (caret: CaretGeometry | null) => void;

  /** One rect per visible line covered by the selection range. */
  selectionRects: SelectionRect[];
  setSelectionRects: (rects: SelectionRect[]) => void;

  /** Ref mirroring `contentSelection` so async callbacks (the
   * post-mutation refresh) can read the latest value without
   * closing over a stale state snapshot. */
  contentSelectionRef: React.MutableRefObject<ContentSelection | null>;
}

const Context = createContext<ContentSelectionContextValue | null>(null);

export function ContentSelectionProvider({ children }: PropsWithChildren) {
  const client = useCanvasClient();
  const [contentSelection, setContentSelectionRaw] =
    useState<ContentSelection | null>(null);
  const [caret, setCaret] = useState<CaretGeometry | null>(null);
  const [selectionRects, setSelectionRects] = useState<SelectionRect[]>([]);
  const contentSelectionRef = useRef<ContentSelection | null>(null);
  contentSelectionRef.current = contentSelection;

  const setContentSelection = useCallback(
    (sel: ContentSelection | null) => {
      setContentSelectionRaw(sel);
      void client.setSelection(sel);
      if (sel) {
        void client
          .caretGeometry(sel)
          .then(setCaret)
          .catch(() => setCaret(null));
        if (sel.start !== sel.end) {
          void client
            .selectionGeometry(sel)
            .then(setSelectionRects)
            .catch(() => setSelectionRects([]));
        } else {
          setSelectionRects([]);
        }
      } else {
        setCaret(null);
        setSelectionRects([]);
      }
    },
    [client],
  );

  const value = useMemo<ContentSelectionContextValue>(
    () => ({
      contentSelection,
      setContentSelection,
      caret,
      setCaret,
      selectionRects,
      setSelectionRects,
      contentSelectionRef,
    }),
    [contentSelection, setContentSelection, caret, selectionRects],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useContentSelection(): ContentSelectionContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      "useContentSelection called outside ContentSelectionProvider",
    );
  }
  return ctx;
}
