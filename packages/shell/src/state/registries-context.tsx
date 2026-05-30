import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

import {
  createCommandRegistry,
  createKeybindingRegistry,
  createMenuRegistry,
  createOverlayRegistry,
  createPanelRegistry,
  createSemanticGroupRegistry,
  createToolRegistry,
  DEFAULT_TOOLS,
  type CommandRegistry,
  type KeybindingRegistry,
  type MenuRegistry,
  type OverlayRegistry,
  type PanelRegistry,
  type SemanticGroupRegistry,
  type ToolRegistry,
} from "../registries";

/**
 * The shell registries. Lifetime is the shell's: created at mount,
 * kept across renders so dispose handles registered by panels /
 * overlays stay valid as React re-renders.
 */
export interface ShellRegistries {
  panels: PanelRegistry;
  commands: CommandRegistry;
  semanticGroups: SemanticGroupRegistry;
  keybindings: KeybindingRegistry;
  menus: MenuRegistry;
  overlays: OverlayRegistry;
  tools: ToolRegistry;
}

const Context = createContext<ShellRegistries | null>(null);

/**
 * Mounts the four registry instances at the shell root. The command
 * registry needs a `getEditor` thunk so its `invoke` can pass the
 * current `PagedEditor` into handlers; the caller (typically the
 * PagedEditor provider) supplies it.
 */
export function RegistriesProvider({
  getEditor,
  children,
}: PropsWithChildren<{ getEditor: () => unknown }>) {
  // Stable instances across renders. useRef beats useMemo here
  // because we want guaranteed identity even if React invokes the
  // memo factory twice (Strict Mode does this in dev).
  const ref = useRef<ShellRegistries | null>(null);
  const keybindingsDisposeRef = useRef<(() => void) | null>(null);
  if (!ref.current) {
    const commands = createCommandRegistry(getEditor);
    const keybindings = createKeybindingRegistry(commands);
    keybindingsDisposeRef.current = () => keybindings.dispose();
    const tools = createToolRegistry();
    // Plan 2 §8.6 — seed the registry with the built-in tools so
    // bundles that haven't run yet still get a populated toolbar.
    // Future bundle authors register additional tools via
    // `useRegistries().tools.register(...)`.
    for (const t of DEFAULT_TOOLS) tools.register(t);
    ref.current = {
      panels: createPanelRegistry(),
      commands,
      semanticGroups: createSemanticGroupRegistry(),
      keybindings,
      menus: createMenuRegistry(),
      overlays: createOverlayRegistry(),
      tools,
    };
  }

  // Tear down the global keydown listener on unmount.
  useEffect(() => {
    return () => {
      keybindingsDisposeRef.current?.();
      keybindingsDisposeRef.current = null;
    };
  }, []);

  // Wrap in useMemo so consumers see a stable object reference.
  const value = useMemo(() => ref.current!, []);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRegistries(): ShellRegistries {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useRegistries called outside RegistriesProvider");
  }
  return ctx;
}
