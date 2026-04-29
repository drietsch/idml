// Typed wrapper around the idml-edit-wasm module. The plan calls for
// the model (Project) to live in a worker eventually; M0 keeps it on
// the main thread alongside the Editor (wgpu surface presenter)
// because the wgpu Surface must run wherever the canvas does and
// there's no benefit to splitting yet without real commands flowing.
//
// `worker.ts` exists as a stub that proves the build chain end-to-
// end; M1 will move ProjectHandle to it once we have the first
// transient command (MoveFrame) where main-thread jitter would
// actually bite.

let modulePromise: Promise<typeof import("../wasm/idml_edit_wasm")> | null =
  null;

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = await import("../wasm/idml_edit_wasm");
      const init = mod.default as (url?: string | URL) => Promise<unknown>;
      await init();
      return mod;
    })();
  }
  return modulePromise;
}

export interface ProjectStats {
  spreads: number;
  stories: number;
  masterSpreads: number;
  textFrames: number;
}

export interface FrameRef {
  kind: "Frame";
  id: string;
}

export interface StoryId {
  /** Story self_id, e.g. "u100". */
  id: string;
}

export type RunAttrPatch =
  | { key: "Font"; value: string | null }
  | { key: "FontStyle"; value: string | null }
  | { key: "PointSize"; value: number | null }
  | { key: "FillColor"; value: string | null }
  | { key: "FillTint"; value: number | null }
  | { key: "Tracking"; value: number | null }
  | { key: "BaselineShift"; value: number | null }
  | { key: "Capitalization"; value: string | null }
  | { key: "Underline"; value: boolean | null }
  | { key: "Strikethru"; value: boolean | null }
  | { key: "CharacterStyle"; value: string | null };

export type ParagraphAttrPatch =
  | { key: "Justification"; value: string | null }
  | { key: "FirstLineIndent"; value: number | null }
  | { key: "SpaceBefore"; value: number | null }
  | { key: "SpaceAfter"; value: number | null }
  | { key: "ParagraphStyle"; value: string | null };

export interface NoopCommand {
  type: "Noop";
}
export interface MoveFrameCommand {
  type: "MoveFrame";
  frame: FrameRef;
  dx_pt: number;
  dy_pt: number;
  transient: boolean;
}
export interface SetFrameBoundsCommand {
  type: "SetFrameBounds";
  frame: FrameRef;
  x_pt: number;
  y_pt: number;
  w_pt: number;
  h_pt: number;
  transient: boolean;
}
export interface BringFrameToFrontCommand {
  type: "BringFrameToFront";
  frame: FrameRef;
}
export interface SendFrameToBackCommand {
  type: "SendFrameToBack";
  frame: FrameRef;
}
export interface DeleteFrameCommand {
  type: "DeleteFrame";
  frame: FrameRef;
}
export interface InsertTextCommand {
  type: "InsertText";
  story: { id: string };
  para: number;
  byte_offset: number;
  text: string;
  coalesce: number | null;
}
export interface DeleteRangeCommand {
  type: "DeleteRange";
  story: { id: string };
  para: number;
  byte_from: number;
  byte_to: number;
  coalesce: number | null;
}
export interface ReplaceRangeCommand {
  type: "ReplaceRange";
  story: { id: string };
  para: number;
  byte_from: number;
  byte_to: number;
  text: string;
  coalesce: number | null;
}
export interface SetRunAttrCommand {
  type: "SetRunAttr";
  story: { id: string };
  para: number;
  byte_from: number;
  byte_to: number;
  attr: RunAttrPatch;
}
export interface SetParagraphAttrCommand {
  type: "SetParagraphAttr";
  story: { id: string };
  para: number;
  attr: ParagraphAttrPatch;
}
export interface SplitParagraphCommand {
  type: "SplitParagraph";
  story: { id: string };
  para: number;
  byte_offset: number;
}
export interface MergeParagraphCommand {
  type: "MergeParagraph";
  story: { id: string };
  para: number;
}
export interface LinkFramesCommand {
  type: "LinkFrames";
  from: FrameRef;
  to: FrameRef;
}
export interface UnlinkFramesCommand {
  type: "UnlinkFrames";
  from: FrameRef;
}
export interface ApplyObjectStyleCommand {
  type: "ApplyObjectStyle";
  frame: FrameRef;
  style: string | null;
}
export interface PageRef {
  kind: "Page";
  id: string;
}
export interface ApplyMasterToPageCommand {
  type: "ApplyMasterToPage";
  page: PageRef;
  master: string | null;
}
export interface SetLayerVisibleCommand {
  type: "SetLayerVisible";
  layer_id: string;
  visible: boolean;
}
export interface SetLayerLockedCommand {
  type: "SetLayerLocked";
  layer_id: string;
  locked: boolean;
}
export interface PlaceImageInFrameCommand {
  type: "PlaceImageInFrame";
  frame: FrameRef;
  link_uri: string | null;
}
export interface SetFrameFillCommand {
  type: "SetFrameFill";
  frame: FrameRef;
  color: string | null;
}
export interface SetFrameStrokeCommand {
  type: "SetFrameStroke";
  frame: FrameRef;
  color: string | null;
  weight_pt: number | null;
}
export interface RectanglePayloadBounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}
export interface CreateRectangleCommand {
  type: "CreateRectangle";
  spread_idx: number;
  self_id: string | null;
  bounds: RectanglePayloadBounds;
  item_transform: [number, number, number, number, number, number] | null;
  fill_color: string | null;
  stroke_color: string | null;
  stroke_weight: number | null;
  applied_object_style: string | null;
  image_link: string | null;
}
export type Command =
  | NoopCommand
  | MoveFrameCommand
  | SetFrameBoundsCommand
  | BringFrameToFrontCommand
  | SendFrameToBackCommand
  | DeleteFrameCommand
  | InsertTextCommand
  | DeleteRangeCommand
  | ReplaceRangeCommand
  | SetRunAttrCommand
  | SetParagraphAttrCommand
  | SplitParagraphCommand
  | MergeParagraphCommand
  | LinkFramesCommand
  | UnlinkFramesCommand
  | ApplyObjectStyleCommand
  | ApplyMasterToPageCommand
  | SetLayerVisibleCommand
  | SetLayerLockedCommand
  | PlaceImageInFrameCommand
  | SetFrameFillCommand
  | SetFrameStrokeCommand
  | CreateRectangleCommand;

export interface PatchEntry {
  node: unknown;
  kind: string;
}
export interface Patch {
  epoch: number;
  entries: PatchEntry[];
}

/**
 * Editor client. Owns:
 *  - one wgpu-bound `Editor` for canvas presentation
 *  - one optional `ProjectHandle` (the currently-loaded document)
 *
 * Construction is async; mount the canvas, get its device-pixel
 * size, then `await EditorClient.create(canvas, w, h)`.
 */
export class EditorClient {
  private constructor(
    private readonly mod: Awaited<ReturnType<typeof loadModule>>,
    private editor: import("../wasm/idml_edit_wasm").Editor,
    private project: import("../wasm/idml_edit_wasm").ProjectHandle | null,
  ) {}

  static async create(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
  ): Promise<EditorClient> {
    const mod = await loadModule();
    const editor = await mod.Editor.new(canvas, width, height);
    return new EditorClient(mod, editor, null);
  }

  async openIdml(bytes: Uint8Array): Promise<void> {
    const handle = this.mod.open_project(bytes);
    this.project = handle;
    this.editor.attach_project(handle);
  }

  async openNativeIdmlProj(bytes: Uint8Array): Promise<void> {
    const handle = this.mod.open_native_project(bytes);
    this.project = handle;
    this.editor.attach_project(handle);
  }

  /** Render the page at `pageIdx` of the attached project. */
  render(
    pageIdx: number,
    zoom: number,
    panX: number,
    panY: number,
    dpr: number,
  ): void {
    this.editor.render(pageIdx, zoom, panX, panY, dpr);
  }

  /** Total number of pages in the attached project. */
  get pageCount(): number {
    return this.editor.page_count;
  }

  /** Page size for a given index, or null if out of range. */
  pageSizePt(pageIdx: number): [number, number] | null {
    const arr = this.editor.page_size_pt(pageIdx);
    return arr.length === 2 ? [arr[0] as number, arr[1] as number] : null;
  }

  resize(width: number, height: number): void {
    this.editor.resize(width, height);
  }

  applyCommand(cmd: Command): Patch {
    if (!this.project) {
      return { epoch: 0, entries: [] };
    }
    return JSON.parse(this.project.apply_command(JSON.stringify(cmd)));
  }

  /**
   * Hit-test a click in *page-relative* pt for the page at
   * `pageIndex`. Returns the topmost frame's id or null. The
   * EditorApp converts canvas-CSS-px → page-pt via the viewport
   * before calling.
   */
  hitTest(pageIndex: number, xPt: number, yPt: number): string | null {
    if (!this.project) return null;
    const json = this.project.hit_test(pageIndex, xPt, yPt);
    if (json === "null") return null;
    const parsed = JSON.parse(json) as { frame: { id: string } };
    return parsed.frame.id;
  }

  /** Story id (self_id) for a frame's ParentStory, or null. */
  parentStoryOfFrame(frameId: string): string | null {
    if (!this.project) return null;
    const id = this.project.parent_story_of_frame(frameId);
    return id ?? null;
  }

  /** Spread index containing the frame, or -1. */
  spreadIndexOfFrame(frameId: string): number {
    if (!this.project) return -1;
    return this.project.spread_index_of_frame(frameId);
  }

  /** Snapshot of a rectangle frame's payload for clipboard. */
  rectanglePayload(frameId: string): {
    spread_idx: number;
    bounds: RectanglePayloadBounds;
    item_transform:
      | [number, number, number, number, number, number]
      | null;
    fill_color: string | null;
    stroke_color: string | null;
    stroke_weight: number | null;
    applied_object_style: string | null;
    image_link: string | null;
  } | null {
    if (!this.project) return null;
    const json = this.project.rectangle_payload_json(frameId);
    return json === "null" ? null : JSON.parse(json);
  }

  /** Concatenated text of paragraph `para` in `storyId`. */
  paragraphText(storyId: string, para: number): string | null {
    if (!this.project) return null;
    return this.project.paragraph_text(storyId, para) ?? null;
  }

  /** Number of paragraphs in `storyId`. */
  paragraphCount(storyId: string): number {
    if (!this.project) return 0;
    return this.project.paragraph_count(storyId);
  }

  /** Paragraph attributes snapshot. */
  paragraphAttrs(
    storyId: string,
    para: number,
  ): {
    justification: string | null;
    firstLineIndent: number | null;
    spaceBefore: number | null;
    spaceAfter: number | null;
    paragraphStyle: string | null;
  } | null {
    if (!this.project) return null;
    const json = this.project.paragraph_attrs_json(storyId, para);
    if (json === "null") return null;
    return JSON.parse(json);
  }

  /** Document-level lists for the Styles panel. */
  paragraphStyleList(): { id: string; name: string }[] {
    if (!this.project) return [];
    return JSON.parse(this.project.paragraph_style_list_json());
  }
  characterStyleList(): { id: string; name: string }[] {
    if (!this.project) return [];
    return JSON.parse(this.project.character_style_list_json());
  }
  objectStyleList(): { id: string; name: string }[] {
    if (!this.project) return [];
    return JSON.parse(this.project.object_style_list_json());
  }
  layerList(): {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
  }[] {
    if (!this.project) return [];
    return JSON.parse(this.project.layer_list_json());
  }
  masterSpreadList(): { id: string; name: string }[] {
    if (!this.project) return [];
    return JSON.parse(this.project.master_spread_list_json());
  }
  pageList(): { id: string; master: string | null }[] {
    if (!this.project) return [];
    return JSON.parse(this.project.page_list_json());
  }
  swatchList(): { id: string; name: string }[] {
    if (!this.project) return [];
    return JSON.parse(this.project.swatch_list_json());
  }
  computeSnap(
    spreadIdx: number,
    xPt: number,
    yPt: number,
    wPt: number,
    hPt: number,
    excludedFrameId: string | null,
    thresholdPt: number,
  ): {
    dx_pt: number;
    dy_pt: number;
    guides: { x_a: number; y_a: number; x_b: number; y_b: number }[];
  } {
    if (!this.project) return { dx_pt: 0, dy_pt: 0, guides: [] };
    return JSON.parse(
      this.project.compute_snap_json(
        spreadIdx,
        xPt,
        yPt,
        wPt,
        hPt,
        excludedFrameId ?? undefined,
        thresholdPt,
      ),
    );
  }
  serializeNative(): Uint8Array | null {
    if (!this.project) return null;
    return this.project.serialize_native();
  }
  static async openNativeProject(
    bytes: Uint8Array,
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
  ): Promise<EditorClient> {
    const mod = await loadModule();
    const editor = await mod.Editor.new(canvas, width, height);
    const handle = mod.open_native_project(bytes);
    editor.attach_project(handle);
    return new EditorClient(mod, editor, handle);
  }

  /** First-run attributes snapshot — proxy for the caret. */
  firstRunAttrs(
    storyId: string,
    para: number,
  ): {
    font: string | null;
    fontStyle: string | null;
    pointSize: number | null;
    fillColor: string | null;
    tracking: number | null;
    underline: boolean | null;
    strikethru: boolean | null;
  } | null {
    if (!this.project) return null;
    const json = this.project.first_run_attrs_json(storyId, para);
    if (json === "null") return null;
    return JSON.parse(json);
  }

  /**
   * Bounding box of `frameId` in page-relative pt for the page at
   * `pageIndex`. Returns null if the frame isn't on this page (or
   * doesn't exist).
   */
  frameBboxPagePt(
    pageIndex: number,
    frameId: string,
  ): { x: number; y: number; w: number; h: number } | null {
    if (!this.project) return null;
    const json = this.project.frame_bbox_page_pt(pageIndex, frameId);
    if (json === "null") return null;
    return JSON.parse(json) as { x: number; y: number; w: number; h: number };
  }

  undo(): Patch {
    return this.project
      ? JSON.parse(this.project.undo())
      : { epoch: 0, entries: [] };
  }

  redo(): Patch {
    return this.project
      ? JSON.parse(this.project.redo())
      : { epoch: 0, entries: [] };
  }

  stats(): ProjectStats | null {
    return this.project ? JSON.parse(this.project.stats) : null;
  }

  firstPageSizePt(): [number, number] | null {
    if (!this.project) return null;
    const arr = this.project.first_page_size_pt;
    return arr.length === 2
      ? [arr[0] as number, arr[1] as number]
      : null;
  }

  get epoch(): number {
    return this.project ? Number(this.project.epoch) : 0;
  }

  get canUndo(): boolean {
    return this.project?.can_undo ?? false;
  }
  get canRedo(): boolean {
    return this.project?.can_redo ?? false;
  }
}
