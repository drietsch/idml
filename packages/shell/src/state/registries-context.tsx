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
  createPanelRegistry,
  createSemanticGroupRegistry,
  type CommandRegistry,
  type KeybindingRegistry,
  type PanelRegistry,
  type SemanticGroupRegistry,
} from "../registries";

/**
 * The four shell registries. Lifetime is the shell's: created at
 * mount, kept across renders so dispose handles registered by
 * panels stay valid as React re-renders.
 */
export interface ShellRegistries {
  panels: PanelRegistry;
  commands: CommandRegistry;
  semanticGroups: SemanticGroupRegistry;
  keybindings: KeybindingRegistry;
}

const Context = createContext<ShellRegistries | null>(null);

/**
 * Mounts the four registry instances at the shell root. The command
 * registry needs a `getEditor` thunk so its `invoke` can pass the
 * current `VersoEditor` into handlers; the caller (typically the
 * VersoEditor provider) supplies it.
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
    ref.current = {
      panels: createPanelRegistry(),
      commands,
      semanticGroups: createSemanticGroupRegistry(),
      keybindings,
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
