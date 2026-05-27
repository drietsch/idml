export type { Disposable, DockEdge, VisibilityPredicate } from "./types";

export {
  createPanelRegistry,
  type PanelApi,
  type PanelContribution,
  type PanelProps,
  type PanelRegistry,
  type PanelRegistryEvent,
} from "./panel";

export {
  createCommandRegistry,
  type CommandContribution,
  type CommandRegistry,
} from "./command";

export {
  createSemanticGroupRegistry,
  type SemanticGroupRegistry,
} from "./semantic-group";

export {
  createKeybindingRegistry,
  type KeybindingContribution,
  type KeybindingRegistry,
} from "./keybinding";
