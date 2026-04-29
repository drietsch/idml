import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  EditorClient,
  type Command,
  type ProjectStats,
} from "./editor/EditorClient";
import {
  setTypeToolHook,
  TOOL_LIST,
  TOOLS,
  toolByHotkey,
  type ToolId,
} from "./tools";
import { SelectionOverlay } from "./SelectionOverlay";
import { Inspector } from "./Inspector";
import { TextEditOverlay, type TypeContext } from "./TextEditOverlay";
import { TextInspector } from "./TextInspector";
import { SidePanels } from "./SidePanels";
import { Rulers } from "./Rulers";
import { autosaveBytes, loadAutosave } from "./persist/opfs";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

const IDENTITY_VP: Viewport = { zoom: 1, panX: 0, panY: 0 };

export function EditorApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<EditorClient | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>("select");
  const [selection, setSelection] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>(IDENTITY_VP);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const [epoch, setEpoch] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageSizePt, setPageSizePt] = useState<[number, number] | null>(null);
  const pageIndexRef = useRef(0);
  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);
  const [workerStatus, setWorkerStatus] = useState<string>("idle");
  const [showRulers, setShowRulers] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [wrapperSize, setWrapperSize] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<
    { x_a: number; y_a: number; x_b: number; y_b: number }[]
  >([]);
  const [lastSaveAt, setLastSaveAt] = useState<number | null>(null);
  const [autosaveAvailable, setAutosaveAvailable] = useState(false);
  const [, autosaveTick] = useReducer((x: number) => x + 1, 0);
  const clipboardRef = useRef<ReturnType<
    NonNullable<EditorClient["rectanglePayload"]>
  > | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    frame: string;
  } | null>(null);
  const [typeCtx, setTypeCtx] = useState<TypeContext | null>(null);
  const typeCtxRef = useRef<TypeContext | null>(null);
  useEffect(() => {
    typeCtxRef.current = typeCtx;
  }, [typeCtx]);
  const dprRef = useRef<number>(window.devicePixelRatio || 1);
  const rafRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Mutable refs that mirror state but are read by event handlers
  // without re-binding on every state change.
  const viewportRef = useRef<Viewport>(IDENTITY_VP);
  const selectionRef = useRef<string | null>(null);
  const toolRef = useRef<ToolId>("select");
  const spaceDownRef = useRef(false);
  const draggingRef = useRef(false);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const requestRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const c = clientRef.current;
      if (!c) return;
      const vp = viewportRef.current;
      try {
        c.render(pageIndexRef.current, vp.zoom, vp.panX, vp.panY, dprRef.current);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }, []);

  const applyCommands = useCallback(
    (cmds: Command[] | undefined) => {
      if (!cmds || cmds.length === 0) return;
      const c = clientRef.current;
      if (!c) return;
      let lastEpoch = epoch;
      for (const cmd of cmds) {
        const patch = c.applyCommand(cmd);
        lastEpoch = patch.epoch;
      }
      setEpoch(lastEpoch);
      requestRender();
      forceTick();
    },
    [epoch, requestRender],
  );

  // Mount: bring up wgpu Editor + worker.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    let cancelled = false;

    try {
      const w = new Worker(new URL("./editor/worker.ts", import.meta.url), {
        type: "module",
      });
      w.addEventListener("message", (ev) => {
        if (ev.data?.type === "ready") setWorkerStatus("ready");
        else if (ev.data?.type === "error")
          setWorkerStatus(`error: ${ev.data.error}`);
      });
      workerRef.current = w;
    } catch (e) {
      setWorkerStatus(`spawn failed: ${(e as Error).message}`);
    }

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const cssW = wrapper.clientWidth;
    const cssH = wrapper.clientHeight;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    EditorClient.create(canvas, w, h)
      .then((client) => {
        if (cancelled) return;
        clientRef.current = client;
        setReady(true);
        client.render(0, 1, 0, 0, dpr);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(`editor init failed: ${e.message}`);
      });

    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const ro = new ResizeObserver(() => {
      const c = clientRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const cssW = wrapper.clientWidth;
      const cssH = wrapper.clientHeight;
      setWrapperSize({ w: cssW, h: cssH });
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      c.resize(w, h);
      requestRender();
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [requestRender]);

  // Keyboard: tool hotkeys, fit/100%, undo/redo, escape, delete.
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      // Skip when typing in an input.
      const target = ev.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA")
        return;

      if (ev.code === "Space") {
        spaceDownRef.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        ev.preventDefault();
        return;
      }
      const meta = ev.metaKey || ev.ctrlKey;
      if (meta && ev.key === "0") {
        ev.preventDefault();
        fitPage();
        return;
      }
      if (meta && ev.key === "1") {
        ev.preventDefault();
        viewportRef.current = { ...viewportRef.current, zoom: 1 };
        setViewport(viewportRef.current);
        requestRender();
        return;
      }
      if (meta && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        const c = clientRef.current;
        if (!c) return;
        const patch = ev.shiftKey ? c.redo() : c.undo();
        setEpoch(patch.epoch);
        requestRender();
        forceTick();
        return;
      }
      // ⌘C / ⌘V / ⌘D — clipboard. Currently rectangle frames only.
      if (meta && ev.key.toLowerCase() === "c" && selectionRef.current) {
        ev.preventDefault();
        const c = clientRef.current;
        if (!c) return;
        const payload = c.rectanglePayload(selectionRef.current);
        if (payload) {
          clipboardRef.current = payload;
        }
        return;
      }
      if (meta && ev.key.toLowerCase() === "v") {
        ev.preventDefault();
        const c = clientRef.current;
        const payload = clipboardRef.current;
        if (!c || !payload) return;
        const offset: [number, number, number, number, number, number] = [
          1,
          0,
          0,
          1,
          (payload.item_transform?.[4] ?? 0) + 10,
          (payload.item_transform?.[5] ?? 0) + 10,
        ];
        c.applyCommand({
          type: "CreateRectangle",
          spread_idx: payload.spread_idx,
          self_id: null,
          bounds: payload.bounds,
          item_transform: offset,
          fill_color: payload.fill_color,
          stroke_color: payload.stroke_color,
          stroke_weight: payload.stroke_weight,
          applied_object_style: payload.applied_object_style,
          image_link: payload.image_link,
        });
        setEpoch(c.epoch);
        requestRender();
        forceTick();
        return;
      }
      if (meta && ev.key.toLowerCase() === "d" && selectionRef.current) {
        ev.preventDefault();
        const c = clientRef.current;
        if (!c) return;
        const payload = c.rectanglePayload(selectionRef.current);
        if (!payload) return;
        const offset: [number, number, number, number, number, number] = [
          1,
          0,
          0,
          1,
          (payload.item_transform?.[4] ?? 0) + 10,
          (payload.item_transform?.[5] ?? 0) + 10,
        ];
        c.applyCommand({
          type: "CreateRectangle",
          spread_idx: payload.spread_idx,
          self_id: null,
          bounds: payload.bounds,
          item_transform: offset,
          fill_color: payload.fill_color,
          stroke_color: payload.stroke_color,
          stroke_weight: payload.stroke_weight,
          applied_object_style: payload.applied_object_style,
          image_link: payload.image_link,
        });
        setEpoch(c.epoch);
        requestRender();
        forceTick();
        return;
      }
      if (ev.key === "Escape") {
        setSelection(null);
        return;
      }
      if (ev.key === "PageDown") {
        ev.preventDefault();
        goToPage(pageIndexRef.current + 1);
        return;
      }
      if (ev.key === "PageUp") {
        ev.preventDefault();
        goToPage(pageIndexRef.current - 1);
        return;
      }
      // Arrow-key frame nudge — only in Select tool with a frame
      // selected and no text caret active.
      if (
        toolRef.current === "select" &&
        selectionRef.current &&
        !typeCtxRef.current &&
        (ev.key === "ArrowLeft" ||
          ev.key === "ArrowRight" ||
          ev.key === "ArrowUp" ||
          ev.key === "ArrowDown")
      ) {
        ev.preventDefault();
        const step = ev.shiftKey ? 10 : 1;
        const dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
        const dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
        const c = clientRef.current;
        if (c) {
          c.applyCommand({
            type: "MoveFrame",
            frame: { kind: "Frame", id: selectionRef.current },
            dx_pt: dx,
            dy_pt: dy,
            transient: false,
          });
          setEpoch(c.epoch);
          requestRender();
          forceTick();
        }
        return;
      }
      if (
        (ev.key === "Backspace" || ev.key === "Delete") &&
        selectionRef.current
      ) {
        ev.preventDefault();
        const c = clientRef.current;
        if (!c) return;
        c.applyCommand({
          type: "DeleteFrame",
          frame: { kind: "Frame", id: selectionRef.current },
        });
        setSelection(null);
        setEpoch(c.epoch);
        requestRender();
        forceTick();
        return;
      }
      // Tool hotkeys (V/H/Z) — only when no modifier is held.
      if (!meta && !ev.altKey && !ev.shiftKey) {
        const t = toolByHotkey(ev.key);
        if (t) {
          ev.preventDefault();
          setTool(t.id);
        }
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.code === "Space") {
        spaceDownRef.current = false;
        if (canvasRef.current && !draggingRef.current) {
          canvasRef.current.style.cursor =
            TOOLS[toolRef.current].defaultCursor();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [requestRender]);

  // Tool cursor reflects active tool.
  useEffect(() => {
    if (canvasRef.current && !draggingRef.current && !spaceDownRef.current) {
      canvasRef.current.style.cursor = TOOLS[tool].defaultCursor();
    }
  }, [tool]);

  // OPFS auto-save: every 30s, serialize the project and write to
  // OPFS. Best-effort — silent no-op on browsers without OPFS.
  useEffect(() => {
    if (!stats) return;
    const id = window.setInterval(async () => {
      const c = clientRef.current;
      if (!c) return;
      const bytes = c.serializeNative();
      if (bytes) {
        const ok = await autosaveBytes(bytes);
        if (ok) setLastSaveAt(Date.now());
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [stats]);

  // Tick once a second so the "saved Xs ago" indicator updates
  // without re-rendering the whole tree.
  useEffect(() => {
    if (!lastSaveAt) return;
    const id = window.setInterval(autosaveTick, 1000);
    return () => window.clearInterval(id);
  }, [lastSaveAt]);

  // On mount, probe OPFS for a previous-session snapshot so we can
  // offer "open last session" when no doc is loaded.
  useEffect(() => {
    let cancelled = false;
    loadAutosave().then((bytes) => {
      if (cancelled) return;
      setAutosaveAvailable(!!bytes && bytes.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openLastSession() {
    const c = clientRef.current;
    if (!c) return;
    const bytes = await loadAutosave();
    if (!bytes) return;
    setError(null);
    setSelection(null);
    try {
      await c.openNativeIdmlProj(bytes);
      setStats(c.stats());
      setPageIndex(0);
      pageIndexRef.current = 0;
      setPageCount(c.pageCount);
      const sz = c.pageSizePt(0) ?? c.firstPageSizePt();
      setPageSizePt(sz);
      setEpoch(c.epoch);
      setDocName("(restored session)");
      requestAnimationFrame(() => {
        fitPage();
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Wire the type-tool hook so clicking inside a text frame opens
  // the IME bridge at the paragraph caret.
  useEffect(() => {
    setTypeToolHook((sig) => {
      const c = clientRef.current;
      if (!c) return;
      if (!sig.frame) {
        setTypeCtx(null);
        return;
      }
      const storyId = c.parentStoryOfFrame(sig.frame);
      if (!storyId) {
        setTypeCtx(null);
        return;
      }
      const text = c.paragraphText(storyId, 0) ?? "";
      // Park caret at end of first paragraph for M2.
      const byteOffset = new TextEncoder().encode(text).length;
      setTypeCtx({ storyId, paraIdx: 0, byteOffset });
    });
    return () => setTypeToolHook(null);
  }, []);

  // Pointer event routing through the active tool. Space override
  // forces the hand tool while Space is held with any other tool.
  function buildToolEvent(
    ev: React.PointerEvent<HTMLCanvasElement>,
    rect: DOMRect,
  ) {
    return {
      cssX: ev.clientX - rect.left,
      cssY: ev.clientY - rect.top,
      button: ev.button,
      altKey: ev.altKey,
      shiftKey: ev.shiftKey,
      ctrlOrMeta: ev.ctrlKey || ev.metaKey,
    };
  }

  function activeTool() {
    return spaceDownRef.current ? TOOLS.hand : TOOLS[toolRef.current];
  }

  function buildContext() {
    const c = clientRef.current!;
    const sz = pageSizePt ?? [0, 0];
    return {
      viewport: viewportRef.current,
      dpr: dprRef.current,
      page: { widthPt: sz[0], heightPt: sz[1] },
      selection: selectionRef.current,
      hitTest: (xPt: number, yPt: number) =>
        c.hitTest(pageIndex, xPt, yPt),
      frameBboxPagePt: (id: string) => c.frameBboxPagePt(pageIndex, id),
      computeSnap: (
        bbox: { x: number; y: number; w: number; h: number },
        excluded: string | null,
        threshold: number,
      ) => {
        // Spread index = 0 for M3 (single-spread docs); the page-to-
        // spread map upgrade arrives with multi-spread editing.
        const r = c.computeSnap(0, bbox.x, bbox.y, bbox.w, bbox.h, excluded, threshold);
        return { dxPt: r.dx_pt, dyPt: r.dy_pt, guides: r.guides };
      },
    };
  }

  function applyToolResult(
    res: ReturnType<ReturnType<typeof activeTool>["onPointerDown"]>,
  ) {
    if (res.selection !== undefined) {
      setSelection(res.selection);
      selectionRef.current = res.selection;
    }
    if (res.viewport) {
      viewportRef.current = { ...viewportRef.current, ...res.viewport };
      setViewport(viewportRef.current);
      requestRender();
    }
    if (res.commands) {
      applyCommands(res.commands);
    }
    if (res.cursor && canvasRef.current) {
      canvasRef.current.style.cursor = res.cursor;
    }
    if (res.guides !== undefined) {
      setGuides(res.guides);
    }
  }

  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!clientRef.current) return;
    draggingRef.current = true;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const rect = ev.currentTarget.getBoundingClientRect();
    applyToolResult(activeTool().onPointerDown(buildToolEvent(ev, rect), buildContext()));
  };
  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !clientRef.current) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    applyToolResult(activeTool().onPointerMove(buildToolEvent(ev, rect), buildContext()));
  };
  const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !clientRef.current) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    applyToolResult(activeTool().onPointerUp(buildToolEvent(ev, rect), buildContext()));
    draggingRef.current = false;
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch {
      /* pointer already released */
    }
    if (canvasRef.current) {
      canvasRef.current.style.cursor = activeTool().defaultCursor();
    }
  };

  // Right-click: open the context menu over the frame under the
  // cursor (if any). Selection follows so the menu items operate on
  // the right target.
  const onCanvasContextMenu = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    ev.preventDefault();
    const c = clientRef.current;
    if (!c) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const cssX = ev.clientX - rect.left;
    const cssY = ev.clientY - rect.top;
    const xPt = (cssX - viewportRef.current.panX) / viewportRef.current.zoom;
    const yPt = (cssY - viewportRef.current.panY) / viewportRef.current.zoom;
    const hit = c.hitTest(pageIndexRef.current, xPt, yPt);
    if (!hit) {
      setContextMenu(null);
      return;
    }
    setSelection(hit);
    selectionRef.current = hit;
    setContextMenu({ x: ev.clientX, y: ev.clientY, frame: hit });
  };

  function buildContextMenuItems(frameId: string): MenuItem[] {
    const c = clientRef.current;
    if (!c) return [];
    const refresh = () => {
      setEpoch(c.epoch);
      requestRender();
      forceTick();
    };
    return [
      {
        label: "Duplicate",
        shortcut: "⌘D",
        onClick: () => {
          const payload = c.rectanglePayload(frameId);
          if (!payload) return;
          c.applyCommand({
            type: "CreateRectangle",
            spread_idx: payload.spread_idx,
            self_id: null,
            bounds: payload.bounds,
            item_transform: [
              1,
              0,
              0,
              1,
              (payload.item_transform?.[4] ?? 0) + 10,
              (payload.item_transform?.[5] ?? 0) + 10,
            ],
            fill_color: payload.fill_color,
            stroke_color: payload.stroke_color,
            stroke_weight: payload.stroke_weight,
            applied_object_style: payload.applied_object_style,
            image_link: payload.image_link,
          });
          refresh();
        },
      },
      {
        label: "Bring to Front",
        onClick: () => {
          c.applyCommand({
            type: "BringFrameToFront",
            frame: { kind: "Frame", id: frameId },
          });
          refresh();
        },
      },
      {
        label: "Send to Back",
        onClick: () => {
          c.applyCommand({
            type: "SendFrameToBack",
            frame: { kind: "Frame", id: frameId },
          });
          refresh();
        },
      },
      {
        label: "Delete",
        shortcut: "⌫",
        danger: true,
        onClick: () => {
          c.applyCommand({
            type: "DeleteFrame",
            frame: { kind: "Frame", id: frameId },
          });
          setSelection(null);
          selectionRef.current = null;
          refresh();
        },
      },
    ];
  }

  // Double-click: enter type-mode if a text frame is under the
  // cursor. Mirrors InDesign's expectation; users with the Type tool
  // already active just single-click as usual.
  const onDoubleClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const c = clientRef.current;
    if (!c) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const cssX = ev.clientX - rect.left;
    const cssY = ev.clientY - rect.top;
    const xPt = (cssX - viewportRef.current.panX) / viewportRef.current.zoom;
    const yPt = (cssY - viewportRef.current.panY) / viewportRef.current.zoom;
    const hit = c.hitTest(pageIndexRef.current, xPt, yPt);
    if (!hit) return;
    const storyId = c.parentStoryOfFrame(hit);
    if (!storyId) return; // not a text frame
    setTool("type");
    setSelection(hit);
    selectionRef.current = hit;
    const text = c.paragraphText(storyId, 0) ?? "";
    setTypeCtx({
      storyId,
      paraIdx: 0,
      byteOffset: new TextEncoder().encode(text).length,
    });
  };

  // Wheel: pan with no modifier; zoom with ctrl/cmd around cursor.
  const onWheel = (ev: React.WheelEvent<HTMLCanvasElement>) => {
    ev.preventDefault();
    const cur = viewportRef.current;
    let next: Viewport;
    if (ev.ctrlKey || ev.metaKey) {
      const factor = Math.exp(-ev.deltaY * 0.005);
      const newZoom = Math.max(0.1, Math.min(16, cur.zoom * factor));
      const rect = ev.currentTarget.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const ratio = newZoom / cur.zoom;
      next = {
        zoom: newZoom,
        panX: cx - (cx - cur.panX) * ratio,
        panY: cy - (cy - cur.panY) * ratio,
      };
    } else {
      next = {
        ...cur,
        panX: cur.panX - ev.deltaX,
        panY: cur.panY - ev.deltaY,
      };
    }
    viewportRef.current = next;
    setViewport(next);
    requestRender();
  };

  function goToPage(idx: number) {
    const c = clientRef.current;
    if (!c) return;
    const next = Math.max(0, Math.min(c.pageCount - 1, idx));
    if (next === pageIndexRef.current) return;
    pageIndexRef.current = next;
    setPageIndex(next);
    setSelection(null);
    const sz = c.pageSizePt(next);
    if (sz) setPageSizePt(sz);
    requestAnimationFrame(() => {
      fitPage();
    });
  }

  function fitPage() {
    const c = clientRef.current;
    const wrapper = wrapperRef.current;
    if (!c || !wrapper) return;
    const sz = c.pageSizePt(pageIndexRef.current) ?? pageSizePt ?? c.firstPageSizePt();
    if (!sz) return;
    const [pw, ph] = sz;
    const cssW = wrapper.clientWidth;
    const cssH = wrapper.clientHeight - 40; /* leave space for toolbar */
    const margin = 0.95;
    const zoom = Math.min((cssW * margin) / pw, (cssH * margin) / ph);
    const panX = (cssW - pw * zoom) / 2;
    const panY = (cssH - ph * zoom) / 2;
    const next = { zoom, panX, panY };
    viewportRef.current = next;
    setViewport(next);
    requestRender();
  }

  async function onFilePick(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setError(null);
    setDocName(file.name);
    setSelection(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const c = clientRef.current;
      if (!c) throw new Error("editor not ready");
      // Native-format file? Detect by extension or by JSON envelope.
      if (file.name.endsWith(".idmlproj") || isLikelyJsonEnvelope(buf)) {
        await c.openNativeIdmlProj(buf);
      } else {
        await c.openIdml(buf);
      }
      setStats(c.stats());
      setPageIndex(0);
      pageIndexRef.current = 0;
      setPageCount(c.pageCount);
      const sz = c.pageSizePt(0) ?? c.firstPageSizePt();
      setPageSizePt(sz);
      setEpoch(c.epoch);
      requestAnimationFrame(() => {
        fitPage();
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="editor-root">
      <header className="editor-header">
        <strong>IDML Editor</strong>
        <span className="muted">M1</span>
        <label className="file-pick">
          <input
            type="file"
            accept=".idml"
            onChange={onFilePick}
            disabled={!ready}
          />
          {ready ? "Open IDML…" : "loading…"}
        </label>
        <span className="tool-palette">
          {TOOL_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? "active" : ""}
              title={`${t.label} (${t.hotkey})`}
              onClick={() => setTool(t.id)}
            >
              {t.label[0]}
            </button>
          ))}
        </span>
        {docName && <span className="metric">{docName}</span>}
        {stats && (
          <span className="metric muted">
            {stats.spreads} spread{stats.spreads === 1 ? "" : "s"} ·{" "}
            {stats.textFrames} frame{stats.textFrames === 1 ? "" : "s"}
          </span>
        )}
        {pageCount > 1 && (
          <span className="page-nav">
            <button
              type="button"
              onClick={() => goToPage(pageIndex - 1)}
              disabled={pageIndex <= 0}
              title="previous page (PgUp)"
            >
              ◀
            </button>
            <span className="metric">
              {pageIndex + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goToPage(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
              title="next page (PgDn)"
            >
              ▶
            </button>
          </span>
        )}
        <span className="spacer" />
        <button type="button" onClick={fitPage} disabled={!stats}>
          fit
        </button>
        <button
          type="button"
          onClick={() => {
            const next = { ...viewportRef.current, zoom: 1 };
            viewportRef.current = next;
            setViewport(next);
            requestRender();
          }}
          disabled={!stats}
        >
          100%
        </button>
        <button
          type="button"
          disabled={!clientRef.current?.canUndo}
          onClick={() => {
            const c = clientRef.current;
            if (!c) return;
            const patch = c.undo();
            setEpoch(patch.epoch);
            requestRender();
            forceTick();
          }}
        >
          undo
        </button>
        <button
          type="button"
          disabled={!clientRef.current?.canRedo}
          onClick={() => {
            const c = clientRef.current;
            if (!c) return;
            const patch = c.redo();
            setEpoch(patch.epoch);
            requestRender();
            forceTick();
          }}
        >
          redo
        </button>
        <button
          type="button"
          className={showRulers ? "active" : ""}
          onClick={() => setShowRulers((v) => !v)}
          title="toggle rulers"
        >
          ruler
        </button>
        <button
          type="button"
          className={showGrid ? "active" : ""}
          onClick={() => setShowGrid((v) => !v)}
          title="toggle grid"
        >
          grid
        </button>
        <button
          type="button"
          disabled={!stats}
          onClick={async () => {
            const c = clientRef.current;
            if (!c) return;
            const bytes = c.serializeNative();
            if (!bytes) return;
            const blob = new Blob([new Uint8Array(bytes)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${docName ?? "project"}.idmlproj`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          title="save project (.idmlproj)"
        >
          save
        </button>
        {lastSaveAt !== null && (
          <span className="metric muted" title="last auto-save">
            saved {Math.max(0, Math.floor((Date.now() - lastSaveAt) / 1000))}s ago
          </span>
        )}
        <span className="metric muted">worker: {workerStatus}</span>
        <a className="muted" href="/viewer/" title="Open the corpus viewer">
          /viewer
        </a>
      </header>

      <div ref={wrapperRef} className="editor-canvas-wrapper">
        <canvas
          ref={canvasRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onCanvasContextMenu}
        />
        <SelectionOverlay
          client={clientRef.current}
          selection={selection}
          viewport={viewport}
          epoch={epoch}
          pageIndex={pageIndex}
          onCommandApplied={() => {
            setEpoch(clientRef.current?.epoch ?? 0);
            requestRender();
            forceTick();
          }}
        />
        <TextEditOverlay
          client={clientRef.current}
          active={!!typeCtx && tool === "type"}
          ctx={typeCtx}
          onCtxChange={setTypeCtx}
          caretCss={typeCtx ? caretCssFromCtx(typeCtx, viewport, selection, clientRef.current, pageIndex) : null}
          onCommandApplied={() => {
            setEpoch(clientRef.current?.epoch ?? 0);
            requestRender();
            forceTick();
          }}
        />
        {selection && tool !== "type" && (
          <Inspector
            client={clientRef.current}
            selection={selection}
            epoch={epoch}
            pageIndex={pageIndex}
            onSelectionChange={setSelection}
            onCommandApplied={() => {
              setEpoch(clientRef.current?.epoch ?? 0);
              requestRender();
              forceTick();
            }}
          />
        )}
        {tool === "type" && typeCtx && (
          <TextInspector
            client={clientRef.current}
            ctx={typeCtx}
            epoch={epoch}
            onCommandApplied={() => {
              setEpoch(clientRef.current?.epoch ?? 0);
              requestRender();
              forceTick();
            }}
          />
        )}
        <Rulers
          viewport={viewport}
          width={wrapperSize.w}
          height={wrapperSize.h}
          visible={showRulers}
          showGrid={showGrid}
        />
        {guides.length > 0 && (
          <svg className="guide-overlay" width={wrapperSize.w} height={wrapperSize.h}>
            {guides.map((g, i) => (
              <line
                key={i}
                x1={g.x_a * viewport.zoom + viewport.panX}
                y1={g.y_a * viewport.zoom + viewport.panY}
                x2={g.x_b * viewport.zoom + viewport.panX}
                y2={g.y_b * viewport.zoom + viewport.panY}
                stroke="#ff4ba1"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            ))}
          </svg>
        )}
        <SidePanels
          client={clientRef.current}
          epoch={epoch}
          selection={selection}
          pageIndex={pageIndex}
          onPageNavigate={goToPage}
          typeCtx={typeCtx}
          onCommandApplied={() => {
            setEpoch(clientRef.current?.epoch ?? 0);
            requestRender();
            forceTick();
          }}
        />
        {!stats && !error && ready && (
          <div className="editor-empty">
            Open an IDML file. <kbd>V</kbd> select, <kbd>H</kbd> hand,
            <kbd>Z</kbd> zoom. ⌘+wheel zoom, space-drag pan.
            {autosaveAvailable && (
              <>
                {" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={openLastSession}
                >
                  Open last session
                </button>
              </>
            )}
          </div>
        )}
        {error && <div className="editor-error">⚠ {error}</div>}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.frame)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function isLikelyJsonEnvelope(buf: Uint8Array): boolean {
  // Cheap signature check: a JSON object starts with `{` after
  // optional whitespace; the IDML container starts with `PK` (zip
  // header). Skip leading whitespace and take a peek.
  for (let i = 0; i < Math.min(buf.length, 16); i++) {
    const b = buf[i]!;
    if (b === 0x09 || b === 0x0a || b === 0x0d || b === 0x20) continue;
    return b === 0x7b; // '{'
  }
  return false;
}

/**
 * Best-effort CSS-px caret position. M2 puts the caret at the
 * top-left corner of the selected frame's bbox, offset down by an
 * approximate line height. Glyph-precise placement arrives in M3.
 */
function caretCssFromCtx(
  _ctx: TypeContext,
  viewport: { zoom: number; panX: number; panY: number },
  selection: string | null,
  client: EditorClient | null,
  pageIndex: number,
): { x: number; y: number } | null {
  if (!client || !selection) return null;
  const bbox = client.frameBboxPagePt(pageIndex, selection);
  if (!bbox) return null;
  const x = bbox.x * viewport.zoom + viewport.panX + 4;
  const y = (bbox.y + bbox.h) * viewport.zoom + viewport.panY - 16;
  return { x, y };
}
