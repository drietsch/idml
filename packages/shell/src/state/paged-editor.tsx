import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

import { useCanvasClient } from "./canvas-client-context";
import { useCamera, type ViewportSize } from "./camera-context";
import { useDocument } from "./document-context";
import { useSelection } from "./selection-context";
import { useContentSelection } from "./content-selection-context";
import {
  RegistriesProvider,
  useRegistries,
  type ShellRegistries,
} from "./registries-context";
import { useDockingSubstrate } from "../docking/substrate-context";
import type { DockingSubstrate } from "../docking/substrate";

// eslint-disable-next-line import/no-relative-parent-imports
import type { CanvasClient } from "@paged-media/client";

/**
 * Aggregate handle: the single argument every panel + command
 * handler receives. Each field is a slice the consumer can pull
 * by name without subscribing to the rest. Stable identity across
 * renders is NOT guaranteed — consumers should destructure and
 * pin sub-slices via context hooks for re-render isolation.
 */
export interface PagedEditor {
  /** The worker client. Stable for the shell's lifetime. */
  client: CanvasClient;

  /** Document state — handle, snapshots, resolution, loading. */
  document: ReturnType<typeof useDocument>;

  /** Viewport camera + size. */
  camera: ReturnType<typeof useCamera>;

  /** Visual element selection. */
  selection: ReturnType<typeof useSelection>;

  /** Text caret + range. */
  contentSelection: ReturnType<typeof useContentSelection>;

  /** The four shell registries. */
  registries: ShellRegistries;

  /** Docking substrate. Null until DockviewRoot's `onReady` fires;
   * commands that need the substrate should guard for that. */
  substrate: DockingSubstrate | null;
}

/**
 * Wraps the registries provider with a stable `getEditor` thunk so
 * the command registry can resolve the current editor at `invoke`
 * time without React re-renders causing handler bindings to drift.
 *
 * Must be mounted *inside* the five state-context providers (it
 * reads from them).
 */
export function PagedEditorProvider({ children }: PropsWithChildren) {
  // Thunk hands the registry a way to materialize `PagedEditor` on
  // demand — defined before the inner consumer so the registry can
  // be constructed in a `useRef` (which fires once per mount).
  const editorRef = useRef<PagedEditor | null>(null);
  const getEditor = () => {
    const editor = editorRef.current;
    if (!editor) {
      throw new Error("PagedEditor accessed before mount");
    }
    return editor;
  };

  return (
    <RegistriesProvider getEditor={getEditor}>
      <PagedEditorBinder editorRef={editorRef}>{children}</PagedEditorBinder>
    </RegistriesProvider>
  );
}

/**
 * Inner component that has access to every context (registries +
 * the five state contexts) and assembles the `PagedEditor`. It
 * writes the assembled handle into `editorRef` so the registry's
 * `getEditor` thunk can read the current value.
 */
function PagedEditorBinder({
  editorRef,
  children,
}: PropsWithChildren<{
  editorRef: React.MutableRefObject<PagedEditor | null>;
}>) {
  const client = useCanvasClient();
  const document = useDocument();
  const camera = useCamera();
  const selection = useSelection();
  const contentSelection = useContentSelection();
  const registries = useRegistries();
  const substrate = useDockingSubstrate();

  const editor = useMemo<PagedEditor>(
    () => ({
      client,
      document,
      camera,
      selection,
      contentSelection,
      registries,
      substrate,
    }),
    [client, document, camera, selection, contentSelection, registries, substrate],
  );
  editorRef.current = editor;

  return <EditorContextProvider editor={editor}>{children}</EditorContextProvider>;
}

// React-context surface for the editor handle. Distinct from the
// editorRef the command registry uses — components consume via the
// `usePaged` hook; the ref exists for non-React consumers
// (registry invoke handlers that fire outside React's lifecycle).
const EditorContext = createContext<PagedEditor | null>(null);

function EditorContextProvider({
  editor,
  children,
}: PropsWithChildren<{ editor: PagedEditor }>) {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}

/**
 * Composite hook returning the aggregate editor handle. Panels
 * that only need a single slice should prefer the focused hook
 * (`useDocument`, `useCamera`, …) for finer re-render control.
 */
export function usePaged(): PagedEditor {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("usePaged called outside PagedEditorProvider");
  }
  return ctx;
}

/** Same as `usePaged` but returns `null` outside the provider. */
export function useOptionalPaged(): PagedEditor | null {
  return useContext(EditorContext);
}

export type { ViewportSize };
