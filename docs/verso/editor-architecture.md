# Verso: Technical Briefing — Editor Architecture

*Third document in the Verso series, after the renderer-phase concept and the scripting-layer briefing. Defines the architecture of the editor that sits on top of the renderer and scripting layer. The central claim is that the Verso editor is not a monolithic application — it is a bundle host that happens to ship a bundle suite, and every architectural decision in this document flows from that framing.*

*Revision history: the first version made an over-strong claim that "every interaction is an Operation" without acknowledging that direct manipulation (drag-to-rotate, marquee selection, live property scrubbing) cannot work that way. The second version introduced the gesture layer for ephemeral interactions and the distinction between document state and application state. The third revision added concrete integration detail for dockview as the docking substrate. This fourth revision updates the document to use the project name Verso throughout.*

## Scope

This briefing covers:

- The four-layer architecture (renderer → scripting → shell → bundles) and the invariants between layers.
- The two mutation channels: Operations (for committed state) and Gestures (for ephemeral state during direct manipulation).
- The bundle system: manifest format, contribution points, lifecycle, activation events.
- The Verso application shell: docking via dockview, panels, command palette, menu system, keybinding manager, perspectives.
- The Contribution API — the seam between the shell and bundles.
- Panel and GUI component definitions.
- The distinction between document state and application state, with selection as the canonical case.
- The visual design position, including an explicit position on the InDesign question.
- The recommended build sequence.

Out of scope: the specific design system (colors, type, spacing), individual feature bundle designs, plugin marketplace mechanics, AI-assisted editor workflows. These are downstream of the architecture this briefing specifies and can be designed once the substrate exists.

## The Four-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  Bundles (built-in and user-installed)          │
│  Declare: panels, tools, commands, menus,       │
│  keybindings, settings, themes                  │
└─────────────────────────────────────────────────┘
                       ▲
                       │ contribution registration via Contribution API
                       ▼
┌─────────────────────────────────────────────────┐
│  Verso Application Shell                        │
│  Docking (dockview), panels, menus, command     │
│  palette, perspectives, keybinding manager      │
└─────────────────────────────────────────────────┘
        ▲                              ▲
        │  Operations through          │  Gesture API
        │  the scripting layer         │  (begin, update, commit, cancel)
        ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────┐
│  Scripting Layer     │    │  Renderer Gesture Layer  │
│  (QuickJS, JS API,   │    │  (ephemeral interaction  │
│  Operation channel)  │    │   state, frame-rate)     │
└──────────────────────┘    └──────────────────────────┘
        ▲                              │
        │                              │
        └──────────────┬───────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Scene Graph (committed) + Ephemeral Overlay    │
│  Verso renderer / WASM core                     │
└─────────────────────────────────────────────────┘
```

The shell talks to the scene graph through *two* channels: the scripting layer for committed mutations (Operations), and the gesture layer for ephemeral direct-manipulation state. Both terminate in the same scene graph but operate on different layers of it — committed state vs ephemeral overlay. The distinction is essential and is unpacked below.

### Layer invariants

These are the rules that make the architecture hold together. They must be enforced by code structure and code review, not by convention.

**The renderer and scene graph know nothing about anything above them.** They expose the Operation channel for committed mutations, the Gesture API for ephemeral interactions, and change events as their notification surface. They never reach upward.

**The scripting layer knows about the renderer and scene graph and exposes the JS API and Operation channel.** It knows nothing about UI, panels, docking, or bundles. It is the same scripting layer specified in the previous briefing, unchanged.

**The application shell uses the scripting layer for committed mutations and the Gesture API for direct manipulation.** The shell has no privileged Operation path — every committed mutation goes through the same channel scripts use. The shell does have privileged access to the Gesture API, because gestures are how the GUI tells the renderer "I am directly manipulating these nodes; show the user the result in real time." Scripts cannot start gestures; they apply discrete Operations.

**Bundles contribute features to the shell.** A bundle is a self-contained unit of feature: declarative manifest plus executable code. Removing a bundle removes the feature cleanly. Bundles communicate with each other only through the scene graph (the universal medium) or through events the shell mediates. They never reach into each other's internals.

### Why this layering matters

This is the structure that makes Verso's larger ambitions tractable:

- **The GUI has no privileged Operation path.** Every committed mutation is an Operation: undoable, persistable, recordable, scriptable, collaboration-syncable, AI-drivable. The GUI's gesture machinery is how direct manipulation feels right; the result of every gesture is still a normal Operation that flows through the normal channel.
- **The shell is its own first plugin.** Anything a built-in bundle does, a user-written bundle can do too. There is no privileged API only the built-in features can access. This is the property that makes the extensibility story real rather than rhetorical.
- **The architecture is testable.** Each layer has a clean interface. The scene graph can be tested without a scripting layer. The scripting layer can be tested without a shell. The shell can be tested with mock bundles. Bundles can be tested with a mock shell.
- **The architecture is replaceable.** Any layer can be rewritten without affecting the others, as long as the interface is preserved.

### What the renderer and scene graph expose

The scene graph's public API has two surfaces:

For committed mutations (consumed by the scripting layer, indirectly by everything else):
- `apply(op: Operation) -> Result<AppliedOperation, OperationError>` — the sole *committed* mutation surface.
- `getNode(id: NodeId) -> NodeView` — read-only structured access to a node.
- `query(...)` — read-only structured queries over the graph.
- `subscribe(filter, callback) -> Unsubscribe` — change-notification stream for committed mutations.
- `version() -> u64` — monotonic version for cache invalidation.

For ephemeral direct manipulation (consumed by the shell):
- `beginGesture(nodes, type) -> GestureHandle`
- `updateGesture(handle, update)`
- `commitGesture(handle) -> AppliedOperation`
- `cancelGesture(handle)`

The next two sections unpack each surface.

## The Two Mutation Channels

The architecturally critical realization in this briefing: **not all interactions can or should go through Operations**. Discrete edits (set a property, insert a node, change a color via a swatch click) are Operations. Continuous interactions (drag-to-rotate, marquee selection, live property scrubbing) are gestures that produce *one* Operation at the end, not hundreds during.

### Why direct manipulation cannot be Operations

Consider rotating an object by dragging a rotation handle. The cursor moves at roughly 60 events per second. If each cursor movement produced a `SetProperty` Operation:

- The undo stack would have 60 entries per second of dragging. Pressing Cmd-Z would reverse one frame of cursor motion at a time. This is wrong.
- Scripts would receive 60 change notifications per second of dragging. Bindings would recompute. DuckDB projections would update. Collaboration would broadcast 60 mutations per second.
- The Operation log would be enormous and meaningless. Persistence would grind.
- Performance would be bad because every Operation has overhead — type validation, inversion computation, broadcast.

The right behavior is unambiguous: a one-second rotation drag produces *one* undo entry, *one* script notification, *one* collaboration message — for the final rotation. The 60 intermediate visual updates are real (the user needs to see them) but they are not part of the document's history.

This pattern is universal across direct-manipulation tools. Figma calls it interactive editing. Blender, Sketch, every CAD tool, and every serious creative tool has the equivalent. It is not optional.

### The Operation channel (committed mutations)

Operations are the canonical mutation primitive, defined in the scripting briefing and unchanged here:

```rust
pub enum Operation {
    SetProperty { node, path, value },
    InsertNode { parent, position, node },
    RemoveNode { node },
    MoveNode { node, new_parent, position },
    Batch(Vec<Operation>),
}
```

Operations are typed, serializable, replayable, invertible. They go through `apply(op)`, which is the sole *committed* mutation surface. Everything downstream — undo stack, scripts, collaboration, persistence — operates on Operations.

The Operation channel handles:
- Discrete edits from menus or commands (Insert Text Frame, Convert to Outlines).
- Swatch clicks, font selection from dropdown, enum selection.
- Property edits via text input (typed a value, pressed Enter).
- Programmatic mutations from scripts.
- The *result* of a gesture, produced at commit time.

### The Gesture API (ephemeral interactions)

Gestures handle continuous interactions where the visual state must update at frame rate but only the final committed value matters to the document.

```rust
pub trait GestureAPI {
    fn begin(&mut self, nodes: &[NodeId], gesture: GestureType) -> GestureHandle;
    fn update(&mut self, handle: GestureHandle, update: GestureUpdate);
    fn commit(&mut self, handle: GestureHandle) -> AppliedOperation;
    fn cancel(&mut self, handle: GestureHandle);
}

pub enum GestureType {
    Translate,
    Rotate { pivot: Point },
    Scale { pivot: Point, lock_aspect: bool },
    Skew,
    Marquee { mode: MarqueeMode },
    PathEdit { handle_index: usize },
    PropertyScrub { property: PropertyPath },
    // Closed set, extended only with deliberation.
}
```

The lifecycle for a rotation drag:

1. **Begin.** Pointer down on the rotation handle. The shell calls `beginGesture([node_id], GestureType::Rotate { pivot })`. The renderer captures the initial rotation, allocates an ephemeral overlay entry, and returns a handle. No Operation yet.
2. **Update.** Pointer moves. The shell calls `updateGesture(handle, GestureUpdate::Angle(delta))` at frame rate. The renderer updates the ephemeral rotation, recomputes the displayed transform, and triggers a re-render of the affected region. No Operation. No undo entry. No script notification.
3. **Commit.** Pointer up. The shell calls `commitGesture(handle)`. The renderer reads the final ephemeral rotation, computes the one `SetProperty` Operation that takes the committed state from before-the-gesture to after-the-gesture, applies it through the Operation channel. Now undo, scripts, persistence, and collaboration see the result. The ephemeral overlay entry is cleared.
4. **Cancel.** If the user presses Escape during the drag, the shell calls `cancelGesture(handle)`. The ephemeral overlay is cleared. No Operation. The committed state is unchanged.

### Where gesture logic lives

The gesture layer lives **inside the renderer / Rust / WASM core**, not in the JS shell. Two reasons:

**Performance.** Gestures need to update at frame rate, often with non-trivial computation: snapping against dozens of guides, composing transforms relative to a pivot, hit-testing for handle interactions during the drag itself. Bouncing every pointer event from JS into WASM, doing the math, bouncing back the result, applying to the GPU, adds latency. Keeping the gesture state machine in WASM lets the renderer process the pointer event, update its own ephemeral state, and re-render in one round trip.

**Correctness.** Rotation around an arbitrary pivot. Scale with locked aspect. Skew with snapping. Path manipulation with correlated Bezier handles. Marquee selection over rotated objects. This is real geometry, and it belongs in the same crate as the rest of the renderer's geometry — not duplicated in TypeScript with the inevitable bugs that come from two implementations of the same math.

The shell's role is narrow:

1. Receive pointer events from the canvas element.
2. Determine which tool is active (text tool, select tool, etc.) and what was hit.
3. Call the appropriate gesture lifecycle method on the WASM core.
4. Render any 2D overlay UI on top (selection outlines, dimensions readouts, snap indicators).

This is a much smaller responsibility than "implement all the geometry of direct manipulation in TypeScript."

### Scripts cannot start gestures

This is a deliberate restriction. The Gesture API is for direct manipulation. Scripts perform discrete mutations through Operations. A script that wants to rotate an object 30 degrees just constructs a `SetProperty` Operation for the final rotation. It does not (and cannot) call `beginGesture` / `updateGesture` / `commitGesture`.

The reason: gestures are intrinsically tied to a single pointer device and a continuous user interaction. They have no meaning in a scripted context. A script applying a million rotations should produce a million Operations (or, if batched, one Operation), not a million pretend-gestures. Allowing scripts to use the Gesture API would couple them to a UI abstraction that doesn't apply.

This restriction is enforced at the type-system level: the Gesture API is exposed to the shell, not to the scripting layer.

### The amended invariant

The precise commitment, restated with the gesture layer in mind:

> The committed scene graph is mutated only through Operations applied via `apply(op)`. Direct manipulation produces one Operation per gesture, not one per frame. The ephemeral overlay used during gestures is not part of the canonical document state and follows different rules.

This preserves everything the scripting briefing committed to (script equivalence, undo, persistence, collaboration) while accommodating the realities of direct manipulation.

## Document State vs Application State

A second distinction that the previous briefing implicitly conflated and that turns out to matter just as much.

**Document state** is the canonical scene graph. It is shared, persisted, undoable, scriptable, broadcast to collaborators. Mutated only through Operations (with the gesture layer as a continuous-input shim that commits to Operations).

**Application state** is per-user UI state: selection, viewport transform, active tool, panel layout, command palette open/closed, scroll positions in panels. It is local to the user, ephemeral, not undoable in the document sense, not synced to collaborators as part of the document.

The line between them is important and easy to get wrong. Concretely:

| Concept | Document or Application? | Notes |
|---|---|---|
| Position of a frame | Document | Persisted, undoable. |
| Color of a fill | Document | Persisted, undoable. |
| Which frame is selected | **Application** | Local to user. Cmd-Z does not un-select; it undoes the last *edit*. |
| Current viewport zoom | **Application** | Each user has their own viewport. |
| Active tool (text, select, etc.) | **Application** | Per-user. |
| Which page is being viewed | **Application** | Per-user. In multiplayer, two users can view different pages. |
| Pages list, page order | Document | Structural, persisted. |
| A specific page's master assignment | Document | Persisted. |
| Panel layout (docked, floating) | **Application** | Per-user, persisted to user settings, not to the document. |
| A saved perspective | **Application** | Per-user (though shareable as a separate artifact). |
| Whether a layer is locked | Document | Persisted in the document. |
| Whether a layer is visible **in this user's view** | Application (in collaboration) | Subtle — see below. |

The last row illustrates the subtlety. A layer's "visibility" toggle in the layers panel could mean either "this layer is hidden in the document" (document state, affects all collaborators, affects export) or "I have temporarily hidden this layer in my view" (application state, only affects this user). Most tools default to the former; some offer the latter as a separate "local visibility" concept. The decision is not architectural but is worth making explicit per-feature, because conflating the two creates exactly the kind of subtle bugs that make collaborative tools feel weird.

### Selection as the canonical case

Selection is application state. This has several consequences worth being explicit about:

- **Cmd-Z does not unselect.** It undoes the last document edit. Most users expect this; conflating selection with document state creates the "why did my selection change when I pressed Ctrl-Z" frustration that some older tools have.
- **In collaboration, each user has their own selection.** Two collaborators editing the same Verso document have independent selections and can simultaneously have different things selected. This is what every modern collaborative tool does.
- **Selection is not in the operation log.** Selecting a node does not produce a `SetProperty` Operation on some "selection" field. Selection lives in the shell, stored as a typed value, mutated by tool commands and pointer events.
- **Scripts can read and modify selection through a separate API.** `verso.selection.add(nodeId)`, `verso.selection.clear()` — these are part of the shell's API to bundles and scripts, distinct from the scene graph's Operation API.

### Viewport and tools

Viewport (pan, zoom, current page) and active tool are also application state. They follow the same rules as selection: per-user, not in the document, not in the operation log, exposed through a separate shell API.

Tools deserve a small clarification. A "tool" in the shell sense is a mode the user is in: text tool, select tool, hand tool. Tools are application state. But a tool *contributes* commands and gestures that, when used, produce Operations. The text tool, when active, makes clicks on the canvas produce "insert text frame" Operations. The tool itself is application state; what the tool *does* produces document state changes.

## The Bundle System

The Verso bundle system is modeled on VS Code's extension architecture, adapted to DTP. The model is mature and battle-tested at the scale of 40,000+ extensions, and there is no reason to invent something new at this layer.

### Bundle structure

A bundle is a directory or archive containing:

```
my-bundle/
├── manifest.json         # declarative contributions and metadata
├── activate.js           # entry point, runs on activation
├── deactivate.js         # optional cleanup, runs on deactivation
├── panels/               # panel components
├── commands/             # command implementations
├── icons/                # bundle's icons
├── themes/               # optional themes
└── README.md             # human documentation
```

The manifest is the contract. The shell reads the manifest to know what the bundle contributes; the bundle's code runs only when activation events fire.

### Manifest format

```json
{
  "id": "verso.text-editing",
  "version": "1.0.0",
  "name": "Text Editing",
  "description": "Text frame creation, editing, and typography controls.",
  "publisher": "verso",
  "license": "MIT",
  "engines": {
    "verso": "^1.0.0"
  },
  "activationEvents": [
    "onNodeType:TextFrame",
    "onCommand:text.insert",
    "onPerspective:design"
  ],
  "main": "./activate.js",
  "contributes": {
    "panels": [
      {
        "id": "text.character",
        "title": "Character",
        "when": "selection.anyMatch(n => n.type === 'TextFrame')",
        "defaultDock": "right",
        "defaultGroup": "typography",
        "icon": "icons/character.svg"
      }
    ],
    "tools": [
      {
        "id": "text.tool",
        "title": "Text",
        "icon": "icons/text-tool.svg",
        "cursor": "text",
        "shortcut": "t",
        "gestures": ["click-to-insert", "click-to-edit"]
      }
    ],
    "commands": [
      {
        "id": "text.insert",
        "title": "Insert Text Frame",
        "category": "Text",
        "icon": "icons/insert-text.svg"
      }
    ],
    "menus": [
      {
        "menu": "edit",
        "command": "text.insert",
        "group": "1_modify",
        "order": 10
      }
    ],
    "keybindings": [
      {
        "key": "cmd+t",
        "command": "text.insert"
      }
    ],
    "settings": {
      "text.defaultFont": {
        "type": "string",
        "default": "Inter",
        "description": "Default font for new text frames."
      }
    }
  }
}
```

Built-in bundles use the `verso.*` namespace. Third-party bundles use their own publisher namespace. The `defaultDock` and `defaultGroup` fields on panel contributions are semantic — bundles declare intent ("this belongs near the typography panels on the right edge") and the shell translates that intent into dockview's concrete API. The mapping is described under "Bundle-to-dockview vocabulary" below.

### Activation events

Bundles do not run until needed. Activation events declare when the bundle's `activate.js` should be loaded and executed:

- `onStartup` — runs immediately on Verso start. Use sparingly.
- `onCommand:<id>` — runs when the named command is invoked.
- `onNodeType:<type>` — runs when a node of the given type is selected or appears in the document.
- `onPerspective:<id>` — runs when the named perspective is activated.
- `onFileType:<extension>` — runs when a file of the given type is opened.
- `onView:<panel-id>` — runs when the named panel becomes visible.
- `onTool:<tool-id>` — runs when the user activates the named tool.

Lazy activation keeps editor startup fast and isolates bundle bugs.

### Activation lifecycle

When activated, a bundle's `activate.js` receives the Verso Contribution API:

```typescript
export function activate(verso: VersoEditor) {
  const disposable = verso.commands.register('text.insert', async () => {
    const point = await verso.tools.captureClick();
    verso.scene.batch(() => {
      const frame = verso.scene.insertNode('TextFrame', {
        position: point,
        size: { width: 200, height: 50 },
      });
      verso.selection.set([frame.id]);
    });
  });
  
  verso.panels.register({
    id: 'text.character',
    component: CharacterPanel,
  });
  
  const subscription = verso.scene.on('selectionChange', (selection) => {
    // ...
  });
  
  verso.onDeactivate(() => {
    disposable.dispose();
    subscription.dispose();
  });
}
```

The shell guarantees that every registered contribution is removed when the bundle deactivates.

### Bundle types

Three categories worth distinguishing:

**Built-in bundles** — shipped with Verso, signed by the publisher, run with full trust. Namespace: `verso.*`.

**User-installed bundles** — installed from a registry or sideloaded, run with limited capabilities by default. Permission escalation requires explicit user approval.

**Workspace bundles** — bound to a specific document or project, useful for team-specific automations and templates.

Capability sandboxing (from the scripting briefing) applies to all bundles, with defaults varying by category.

## The Verso Application Shell

The shell is the empty container that hosts bundles. It owns:

- The main window and its docking layout (via dockview).
- The panel registry and panel lifecycle.
- The command palette and command dispatch.
- The menu bar and its dynamic population from contributions.
- The keybinding manager.
- The perspectives system (built on dockview's serialization).
- The settings system.
- The notification surface.
- The bundle loader and lifecycle manager.
- **Application state**: selection, viewport, active tool, panel layout. Stored locally, exposed via shell APIs.
- **Pointer routing**: pointer events on the canvas are routed to the active tool's gesture handlers, which call the Gesture API on the renderer.

The shell knows nothing about specific features. It can run with zero bundles loaded and will sit there empty, ready to accept contributions.

### Docking via dockview

The docking system is the shell's most user-visible feature and the part that most readily goes wrong if reinvented. **The recommendation is to use dockview** (dockview.dev) as the docking substrate, wrapped in a thin shell abstraction so bundles never depend on it directly.

#### Why dockview specifically

The library maps almost one-to-one onto Verso's needs:

- **Layout serialization** via `toJSON()` and `fromJSON()` is exactly the primitive the perspectives system needs. A perspective becomes `{ name, description, layout: dockview.toJSON() }`. Saving and restoring perspectives is one line each direction.
- **Popout windows** allow any panel group to be moved into a separate browser window while remaining connected to the layout. Designers on multi-monitor setups will absolutely want this. Without native support you would either build it yourself (which involves real complexity around `window.open`, cross-window message passing, and state sync) or skip it entirely. For a serious DTP tool this is closer to table-stakes than a nice-to-have.
- **Floating panels** allow groups to be detached as freely-positioned overlays. Photoshop, Illustrator, and Affinity Publisher all use floating palettes in some workflows; designers expect this.
- **Edge groups** are collapsible side panels docked to any edge — exactly the pattern needed for the tool palette on the left and the contextual property panel on the right.
- **Tab groups** with color-coding are useful for grouping typography panels, color panels, etc. into named clusters within a tab strip.
- **CSS variable theming** lets the shell skin dockview to match Verso's custom design system rather than living with its defaults.
- **Multi-framework support** (React, Vue, Angular, vanilla TypeScript) means the docking substrate does not lock the shell into a specific UI framework forever.

The two-to-three-week estimate for Step 3 of the build sequence (empty shell) assumes dockview is doing the docking heavy lifting. Without it, the equivalent step would be eight to twelve weeks of work and probably with rougher results.

#### The wrapping abstraction (substrate-risk insurance)

Dockview is primarily maintained by a single developer. The trajectory is positive (multi-framework support, dedicated documentation site, regular releases) but it is not a Microsoft-backed project with a guaranteed maintenance team. The realistic risk is "primary maintainer becomes unavailable for an extended period, project stalls."

The mitigation is *not* to avoid dockview — it is the best option in this category and the alternatives (rc-dock, flexlayout-react, golden-layout) are all in similar or weaker positions. The mitigation is to **wrap dockview in a thin abstraction layer in the shell**, so that no bundle ever imports from dockview directly. Bundles register panels with the shell; the shell talks to dockview internally. If at some future point the project needed to migrate to a different docking library, that's a shell-internal refactor, not an ecosystem-breaking change.

The wrapping layer is something the shell needs to build anyway, in order to translate between bundle semantic vocabulary and dockview's concrete vocabulary (described below). The substrate-risk insurance is a free side-effect of doing this translation, not extra work.

The shape of the abstraction:

```typescript
// In the shell, internal
interface DockingSubstrate {
  addPanel(spec: SemanticPanelSpec): PanelHandle;
  removePanel(handle: PanelHandle): void;
  movePanel(handle: PanelHandle, target: SemanticLocation): void;
  serialize(): LayoutSnapshot;
  restore(snapshot: LayoutSnapshot): void;
  popoutGroup(groupId: string): void;
  // ... etc.
}

// One implementation, swappable
class DockviewSubstrate implements DockingSubstrate { /* ... */ }
```

Bundles call `verso.panels.register(...)`; the shell's panel registry calls the substrate's `addPanel(...)`; only the `DockviewSubstrate` class touches dockview's API. Total code that imports from `dockview-react` should be measured in hundreds of lines, not thousands.

#### Bundle-to-dockview vocabulary

Bundles declare panels with semantic intent: `defaultDock: "right"`, `defaultGroup: "typography"`. Dockview operates on concrete groups identified by IDs, panels added to specific groups, sizes specified in pixels or fractions. The shell maintains a mapping between the two vocabularies.

Concretely, the shell maintains a registry of *named semantic groups* — `"typography"`, `"color"`, `"pages"`, `"layers"`, `"inspection"` — each mapped to a dockview group ID at runtime. When a bundle registers a panel with `defaultGroup: "typography"`:

1. The shell checks if a dockview group exists for the `"typography"` semantic name.
2. If yes, the panel is added to that group as a new tab.
3. If no, the shell creates a new dockview group docked to the bundle's `defaultDock` edge, registers it as the `"typography"` semantic group, and adds the panel.

Users can rearrange freely after that — drag the typography panels to a different group, into a floating window, into a popout window. The semantic group concept is just for *initial placement*; once the user has rearranged, their custom layout wins.

This pattern is what VS Code does internally (its `view containers` work analogously) and it's what makes the contribution model feel natural to bundle authors. Authors say "put my panel near the typography stuff" rather than having to know the user's current layout.

#### The canvas as a permanent center panel

The canvas — the WebGPU render surface where the Verso document is displayed — is a special panel in the dockview layout. It is always present, never closable, never tab-grouped with other content. Bundle-contributed panels dock around it (left, right, top, bottom, floating, popout) but the center is always the canvas.

Configure this with dockview by initializing the layout with a permanently-pinned center panel that hosts the canvas component. The center panel's tab header is hidden (no tab strip for a single permanently-present panel). The center panel's closable property is set to false. Drag-target affordances for the center are disabled to prevent users from accidentally docking other content onto the canvas in a way that would obscure it.

In practice this means the shell's layout initialization looks like:

```typescript
const dockview = createDockview({
  components: { 'canvas': CanvasPanel, /* etc. */ },
});

dockview.addPanel({
  id: 'main-canvas',
  component: 'canvas',
  position: { referencePanel: null }, // center
  tabComponent: null,                  // no tab header
});

dockview.api.getPanel('main-canvas').api.setClosable(false);
```

All bundle-contributed panels are added after this and dock relative to the canvas.

#### Pointer event routing through the canvas

Pointer events that hit the canvas need to flow to the shell's tool router (which then calls the renderer's Gesture API), not be intercepted by dockview's drag-to-rearrange logic. This is mostly handled correctly by default: dockview's drag affordances are confined to tab headers, group borders, and edge handles. The canvas panel's content area receives pointer events normally.

Two specific cases worth being deliberate about:

**Pointer capture during a gesture.** When a gesture begins, the canvas should call `setPointerCapture` on the originating pointer so that subsequent move events are routed to the canvas even if the cursor strays outside it. This is standard direct-manipulation pattern and prevents dockview (or anything else) from intercepting the drag.

**Drag-from-canvas to dock.** Some flows might want to support "drag an item from a panel and drop it onto the canvas" or vice versa (e.g., drag a swatch from the color panel onto a frame). Dockview's drag system is for *panels*, not for *content within panels*; these intra-content drags need their own implementation (standard HTML5 drag-and-drop, or custom pointer-based dragging). Don't try to extend dockview's drag system for this.

#### Persistence scope: current layout vs saved perspectives

Dockview's serialization captures everything: which panels are where, sizes, tab order, floating positions, popout windows. The shell needs to decide what's auto-persisted, what's explicit-snapshot, and what's transient.

Recommended scope:

- **Current layout** is auto-persisted to user-global local storage on every change (debounced). When Verso reopens, the user's last layout is restored. This is the always-on persistence so users don't lose their arrangement.
- **Saved perspectives** are explicit, named snapshots. The user invokes "Save Perspective As..." from the command palette; the shell snapshots the current dockview layout and stores it as a perspective. Perspectives are exportable as JSON files.
- **Transient state** like "which tab is active in this tab group" is part of the current layout (auto-persisted) but not part of saved perspectives. When applying a saved perspective, restore the layout structure but let active-tab state come from the user's current focus.

This is roughly what VS Code does. It works.

### The command palette

The command palette is the shell's most important interaction surface and should be designed first, before the menu bar, before the toolbar.

`cmd-K` opens a fuzzy-search input over every registered command, panel toggle, perspective switch, document property, and recently-used file. Result list grouped by category. Selecting a result invokes it.

For Verso, the command palette extends to include:

- Commands: `Insert Text Frame`, `Convert to Outlines`, `Export PDF/X-4`.
- Panel toggles: `Show: Character`, `Hide: Layers`.
- Perspectives: `Switch to: Design`, `Switch to: Production`.
- Documents and recent files.
- Node-level navigation: `Go to: Page 7`, `Select: Master Spread A`.
- Settings: `Set: Default Font → Inter`.

The command palette is also the entry point for natural-language commands later. An LLM that interprets "make all the headlines bigger" emits a sequence of script commands through the same dispatch system the palette uses.

### The menu bar

A light menu bar, recognizable to designers, but not the primary interaction surface. Six or seven top-level menus — File, Edit, View, Object, Type, Window, Help. Each menu has at most twelve items at the top level, with submenus used sparingly. Every menu item is also a command (findable via the palette).

Menu items are contributed dynamically by bundles via the `menus` contribution point. Bundles do not directly manipulate the menu bar; they declare contributions and the shell renders them.

### Keybindings

Keybindings are a centralized resource managed by the shell. Bundles declare keybindings; the shell resolves conflicts and presents a unified UI for inspection and customization.

The "standard creative tool" shortcuts come from a default keybindings file shipped with Verso — V for select, T for text, H for hand tool, space-drag for pan. These are conventions worth keeping because designers' hands know them.

A keybindings inspector (accessible from the command palette) shows every binding, its source bundle, and conflicts.

### Perspectives

A perspective is a named, serialized layout state — concretely, a dockview `toJSON()` snapshot plus a name, description, and optional icon. Verso ships a small number of defaults:

- **Design** — typography panel, color panel, alignment, pages.
- **Production** — preflight, separations, color management, output preview, package.
- **Data** — bindings, data sources, DuckDB query, variable preview.
- **Review** — comments, version history, side-by-side diff.

Switching perspectives is a `dockview.fromJSON(perspective.layout)` call, possibly with a transition animation. Users save their own perspectives via the command palette (`Save Perspective As: ...`). Perspectives are exportable JSON files, distributable as Verso ecosystem artifacts.

### Settings

Settings are scoped: user-global, workspace, document. Each level overrides the previous. Bundles declare settings in their manifest; the shell renders a unified settings UI.

Settings are accessible via the command palette (`Set: text.defaultFont → Inter`).

## The Contribution API

The architecturally critical seam between the shell and bundles. Get this right and the modular story holds together.

```typescript
interface VersoEditor {
  // The scene API — same one scripts use, for committed mutations.
  scene: SceneAPI;
  
  // Application state — distinct from document state.
  selection: SelectionAPI;
  viewport: ViewportAPI;
  
  // Contribution registries.
  panels: PanelRegistry;
  tools: ToolRegistry;           // tools register gesture handlers here
  commands: CommandRegistry;
  menus: MenuRegistry;
  keybindings: KeybindingRegistry;
  themes: ThemeRegistry;
  
  // Application-level affordances.
  notifications: NotificationAPI;
  settings: SettingsAPI;
  storage: BundleStorageAPI;
  clipboard: ClipboardAPI;
  
  // Interaction primitives bundles compose.
  toolInteractions: ToolInteractionAPI; // captureClick, captureDrag, etc.
  dialogs: DialogAPI;
  
  // Lifecycle.
  onDeactivate(handler: () => void): void;
}
```

The surface is deliberately small. Bundles never reach into other bundles. They never manipulate the docking layout imperatively — they declare panel contributions and the shell handles placement via the dockview substrate. Cross-bundle communication happens through the scene graph or through shell-mediated events.

Note that `PanelRegistry` does *not* expose dockview's API. Bundles do not call dockview methods. They register panels with semantic placement intent; the shell translates that into dockview operations internally. This is the wrapping abstraction in action — it keeps the dockview dependency contained to the shell.

### What `SceneAPI` looks like

The `SceneAPI` exposed to bundles is the same one exposed to scripts. The shape from the scripting briefing applies unchanged.

```typescript
interface SceneAPI {
  document: DocumentView;
  
  insertNode(type: string, props: object, parent?: NodeId): NodeView;
  removeNode(id: NodeId): void;
  setProperty(id: NodeId, path: PropertyPath, value: any): void;
  
  batch<T>(fn: () => T): T;
  
  undo(): void;
  redo(): void;
  
  query(sql: string): Promise<QueryResult>;
  findAll(predicate: (node: NodeView) => boolean): NodeView[];
  
  on(event: SceneEvent, handler: Function): Subscription;
}
```

The fact that a bundle's `verso.scene` is identical to a script's `verso.scene` is what makes "the GUI is its own first plugin" real. Note that selection is *not* part of `SceneAPI` — it's `verso.selection`, reflecting its status as application state.

### What `SelectionAPI` looks like

Selection is application state, exposed separately:

```typescript
interface SelectionAPI {
  // Read
  get(): NodeId[];
  has(id: NodeId): boolean;
  isEmpty(): boolean;
  firstOf(type: string): NodeView | null;
  anyMatch(predicate: (node: NodeView) => boolean): boolean;
  
  // Mutate (these do NOT produce Operations)
  set(ids: NodeId[]): void;
  add(id: NodeId): void;
  remove(id: NodeId): void;
  toggle(id: NodeId): void;
  clear(): void;
  
  // Events
  onChange(handler: (selection: NodeId[]) => void): Subscription;
}
```

Selection mutations are *not* Operations. They are local state changes. Scripts can read and modify selection, but doing so does not produce undo entries, does not broadcast to collaborators, does not get persisted as part of the document.

## Panel and GUI Component Definitions

Bundles register panels declaratively. The component inside a panel is imperative — a React component that uses the Contribution API.

### Panel component contract

```typescript
interface PanelProps {
  verso: VersoEditor;
  context: PanelContext;
}

const CharacterPanel: React.FC<PanelProps> = ({ verso, context }) => {
  const selection = useSelection(verso);
  const textFrame = selection.firstOf('TextFrame');
  
  if (!textFrame) {
    return <EmptyState message="Select a text frame." />;
  }
  
  return (
    <PanelLayout>
      <PropertyRow label="Font">
        <FontSelector
          value={textFrame.text.font}
          onChange={(font) => textFrame.text.font = font}
        />
      </PropertyRow>
      <PropertyRow label="Size">
        <LengthInput
          value={textFrame.text.size}
          unit="pt"
          onChange={(size) => textFrame.text.size = size}
          onScrubStart={() => verso.scene.beginPropertyScrub(textFrame.id, ['text', 'size'])}
          onScrubEnd={() => verso.scene.commitPropertyScrub()}
        />
      </PropertyRow>
    </PanelLayout>
  );
};
```

Several specific notes:

- **`useSelection`, `useNode`, `useProperty` are shell-provided hooks.** They handle subscription to scene-graph changes and re-render on update. Bundles do not directly subscribe; they use these hooks.
- **Discrete property mutations look like direct assignment.** `textFrame.text.font = font` internally constructs a `SetProperty` Operation. This is the Proxy pattern from the scripting briefing.
- **Continuous property scrubbing uses the gesture lifecycle.** Dragging a slider begins a `PropertyScrub` gesture, updates at frame rate without producing Operations, and commits one Operation on release. The `LengthInput` component handles this internally, exposing `onScrubStart` and `onScrubEnd` hooks to the panel.
- **Shared layout components** come from the Verso design system.
- **The panel component is not aware of dockview.** It receives `PanelProps` from the shell and renders its content; how the panel is sized, where it is docked, whether it's floating or popped out — all of that is dockview's concern, mediated by the shell's wrapping layer.

### The shared design system

The shell ships a design system used by all built-in bundles. shadcn-style copy-into-project primitives, customized to Verso's visual language. This includes:

- Layout: `PanelLayout`, `PropertyRow`, `ToolbarRow`, `Accordion`, `Tabs`, `Stack`.
- Inputs: `LengthInput`, `ColorInput`, `FontSelector`, `EnumSelector`, `Toggle`, `Slider`, `NumberInput`.
- Interaction: `Button`, `IconButton`, `Menu`, `ContextMenu`, `Popover`, `Tooltip`.
- Display: `EmptyState`, `LoadingState`, `ErrorState`, `Thumbnail`, `Swatch`.

Inputs that support scrubbing (`LengthInput`, `NumberInput`, `Slider`) wire up the gesture lifecycle automatically. Bundle authors get scrubbing behavior for free.

## Visual Design Position

Verso's visual design should be **recognizably-of-the-genre without being a clone of any existing tool**. Designers who have used InDesign, Figma, Sketch, or Affinity Publisher should be able to sit down and start working without a tutorial. But nothing about the visual design should make them think "this is trying to be InDesign with a different engine."

Every other architectural decision in Verso has been about *not being InDesign*. A UI that copies InDesign visually contradicts all of that.

The name itself supports the positioning. *Verso* — the left-hand page of a spread — is a publisher's word, drawing on the European publishing tradition that long predates Adobe. The product positions itself in that lineage, not as a successor to a 1999 Adobe product.

### Keep these conventions

- Vertical tool palette on the left, with a tight curated tool set (8–12 tools, not 30).
- Contextual property panel on the right that updates with selection.
- Pages or navigator panel as a recognizable element.
- Standard keyboard shortcuts shared across creative tools: V, T, H, space, etc.
- Modifier conventions: shift to constrain, alt/opt to duplicate.
- Marquee selection with click-drag.
- Drag-to-resize handles on selected objects.

### Drop these InDesign-specific elements

- **The visual chrome.** Adobe's twenty-five-year visual accretion. Use modern, flat, neutral chrome — closer to Linear or Figma. Dockview's CSS-variable theming makes this configurable without forking the library.
- **The menu structure.** Six levels of nesting, archaeological organization. Use a flat menu bar plus command palette.
- **The panel proliferation.** Character, Paragraph, OpenType, Glyphs as four panels. Use a single typography panel with progressive disclosure.
- **Tool-modal interaction.** Modern tools detect intent from context — click on text, you are in text mode.
- **Workspace names that mimic InDesign.** Use names that reflect what Verso does.

### How to talk about Verso externally

Avoid:
- "Open-source InDesign."
- "InDesign for the web."
- "InDesign-compatible editor."

Prefer:
- "Verso — an open publishing platform built for structured data and modern workflows."
- "Verso — design composition with native data bindings and full scriptability."
- "Verso — a new kind of publishing tool, in the tradition that predates Adobe."

## Build Sequence

The right order: extensibility-first, with features added as bundles on top of a host that already works.

### Step 1: Decide the visual design language

An hour of mood-boarding and reference-gathering. The output is a written design brief, not a Figma mockup.

### Step 2: Pick the shell technology

Recommended stack:
- React 18+ with TypeScript.
- Tailwind for utility CSS.
- shadcn-style primitives for the inspector; custom design system for editor chrome.
- **dockview** for docking, accessed via the `dockview-react` package, wrapped in a shell-internal abstraction layer.
- ES modules for bundle loading.
- Vite for the build.

### Step 3: Build the empty shell

Empty window, dockview-based panel system, command palette, empty menu bar, keybinding manager. Runnable with zero bundles loaded.

Specific deliverables for this step:
- The `DockingSubstrate` abstraction with a `DockviewSubstrate` implementation.
- The canvas as a permanently-pinned center panel.
- The semantic-group registry mapping bundle vocabulary to dockview group IDs.
- Auto-persistence of the current layout to local storage on every change.
- The default "empty" perspective definition.

Two to three weeks.

### Step 4: Build the bundle loader and Contribution API

Hello-world bundle first, then commands, then menus, then keybindings. The Contribution API surface is fully implemented at this stage, including the `selection` and `viewport` APIs. Two to three weeks.

### Step 5: Wire up the canvas and gesture pipeline

Add the WebGPU surface inside the center panel. Connect pointer events to the shell's tool router. Wire the tool router to the renderer's Gesture API. Build the gesture lifecycle hooks. This is the bridge between the React shell and the WASM renderer for direct manipulation, and it's worth getting right before any tool bundle is built. Two to three weeks.

Deliverables:
- WebGPU canvas element hosted in the dockview center panel.
- Pointer capture on gesture begin, release on commit or cancel.
- Pointer event routing to the active tool.
- Tool router invoking the Gesture API on begin/update/commit/cancel.
- Overlay layer for selection outlines, snap indicators, etc.
- Pan/zoom viewport with application-state storage.

### Step 6: Ship the inspector as the first bundle

The inspector already exists. Refactor it into the bundle format as `verso.inspector`. One to two weeks.

### Step 7: Build the core editor bundles

This is where Verso proper starts taking shape. Approximate order:

1. **`verso.selection`** — the selection state model, marquee selection (using the gesture layer), click-to-select.
2. **`verso.transform`** — move, rotate, scale (all using the gesture layer).
3. **`verso.pages`** — page navigation and management.
4. **`verso.text`** — text frames, character panel, paragraph panel, live text editing.
5. **`verso.color`** — swatches, color picker, gradients.
6. **`verso.images`** — image placement and properties.
7. **`verso.shapes`** — rectangles, ellipses, lines, paths.
8. **`verso.layers`** — layer panel and management.
9. **`verso.export`** — PDF/X export, package, preflight.

Each is two to four weeks of focused work.

### Step 8: Bundle SDK and third-party authoring

Once the architecture is proven, publish the Verso Bundle SDK as a separate artifact. The SDK explicitly does not expose dockview — bundles work through the semantic panel-registration API only.

### Step 9: Verso is in production

Continued development is mostly building or refining bundles rather than touching shell code.

## What Not to Do

- **Don't build features directly into the shell.** Every feature is a bundle.
- **Don't write a custom docking engine.** Use dockview.
- **Don't expose dockview's API to bundles.** Bundles register panels via the shell's semantic panel-registration API. Only the shell's `DockviewSubstrate` class imports from `dockview-react`. This is the wrapping abstraction; preserving it is what insures against substrate risk.
- **Don't add API surface to the Contribution API without deliberation.** Every addition is a permanent commitment.
- **Don't let bundles reach into each other.** Cross-bundle communication is through the scene graph or shell-mediated events.
- **Don't ship a marketplace before there are bundle authors.** Build the SDK first.
- **Don't replicate InDesign's UI.** Conventions yes, clone no.
- **Don't add menu items without also adding them as commands.** Every menu item is findable via the palette.
- **Don't make direct manipulation produce per-frame Operations.** Use the gesture layer.
- **Don't put document state in the shell.** Document state belongs in the scene graph, mutated through Operations.
- **Don't put application state in the scene graph.** Selection, viewport, active tool stay in the shell.
- **Don't expose the Gesture API to scripts.** Gestures are for direct manipulation by the GUI; scripts apply Operations.
- **Don't let dockview's drag system intercept canvas pointer events.** Pointer capture on gesture begin; release on commit or cancel.
- **Don't try to extend dockview's drag system to intra-panel content drags.** Use standard HTML5 drag-and-drop or custom pointer-based dragging for those.

## Time Budget Sanity Check

For solo or near-solo work:

- Step 1 (design language brief): 1–2 days.
- Step 2 (stack decisions): 1–2 days.
- Step 3 (empty shell with dockview substrate): 2–3 weeks.
- Step 4 (bundle loader + Contribution API): 2–3 weeks.
- Step 5 (canvas + gesture pipeline): 2–3 weeks.
- Step 6 (inspector as bundle): 1–2 weeks.
- Step 7 (core editor bundles): 4–9 months total, depending on scope per bundle.
- Step 8 (bundle SDK published): 1–2 weeks.

The shell, bundle loader, canvas pipeline, and inspector-as-bundle together are about eight to ten weeks of work producing no user-visible features but establishing the foundation everything else builds on. This is the right investment.

## Decision Triggers

Four checkpoints to revisit this briefing:

1. **When the empty shell plus three bundles is in working condition** → review the Contribution API with real usage.
2. **When the gesture pipeline is exercised by the first manipulation bundle (selection or transform)** → review the gesture types and the Gesture API ergonomics. Are common patterns awkward? Are there gestures that should be added to the closed set?
3. **When five or more core bundles are in production** → review the design system and the application-state vs document-state line. Has it held up? Have bundles started smuggling document state into application state or vice versa?
4. **Annually, or whenever dockview releases a major version** → review the wrapping abstraction. Is the `DockingSubstrate` interface still appropriate? Are there dockview features the shell could expose more directly? Is the substrate-risk picture changing (single maintainer becoming a team, project getting Microsoft-backed, etc.)?

## Summary in One Paragraph

Verso is not a monolithic application — it is a bundle host that happens to ship a bundle suite. The architecture has four layers: renderer and scene graph at the bottom, scripting layer above that, application shell on top, and bundles at the top. The shell talks to the scene graph through *two* channels: Operations (via the scripting layer) for committed mutations, and the Gesture API (directly) for ephemeral direct-manipulation state during drags. A one-second rotation produces one Operation at commit time, not sixty per second during the drag. Document state lives in the scene graph and is mutated only through Operations; application state — selection, viewport, active tool — lives in the shell and follows different rules. The shell uses **dockview** as its docking substrate, wrapped in a shell-internal `DockingSubstrate` abstraction so that no bundle ever depends on dockview directly — preserving freedom to swap substrates later and isolating the single-maintainer risk. The canvas is a permanently-pinned center panel; bundle-contributed panels dock around it via semantic group names that the shell translates into dockview operations. Perspectives are dockview `toJSON()` snapshots plus metadata, distributable as JSON artifacts. Bundles use the `verso.*` namespace if built-in or their own publisher namespace if third-party; they declare contributions via manifest and receive a small Contribution API on activation; cross-bundle communication is mediated by the shell. The visual design is recognizably-of-the-genre but explicitly not a clone of InDesign — Verso positions itself in the European publishing tradition that predates Adobe, not as a successor to a 1999 product. Build the empty shell first (with the dockview substrate and the canvas centering pattern), then the bundle loader, then the canvas and gesture pipeline, then refactor the inspector as the first bundle, then build core editor bundles in parallel. Add to the Contribution API and the Gesture API closed sets only with deliberation. The result is an editor whose entire feature surface is replaceable, extensible, and scriptable from day one, where direct manipulation feels right because it has its own architectural layer rather than being forced through a model built for discrete edits, and whose docking substrate is a swappable implementation detail rather than a permanent commitment.