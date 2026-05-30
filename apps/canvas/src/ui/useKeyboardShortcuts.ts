// Keyboard shortcuts for the canvas.
//
// Window-level keydown listener. Behaviours mirror common viewer
// conventions:
//
//   Cmd/Ctrl + 0  → fit-to-document (animated)
//   Cmd/Ctrl + 1  → 100% zoom centred on the viewport
//   Page Down     → next page (fit-to-page animated)
//   Page Up       → previous page (fit-to-page animated)
//   Home          → first page
//   End           → last page
//
// Handlers are skipped when an interactive element has focus
// (input, textarea, contenteditable) so the shortcuts don't
// fight ordinary typing.

import { useEffect } from "react";
import type { Camera } from "@paged-media/client";
import { documentBounds, fitCamera, layoutPages } from "./layout";
import type { PageId } from "@paged-media/client";

export interface ShortcutContext {
  pageIds: ReadonlyArray<PageId>;
  pageSizesPt: ReadonlyArray<readonly [number, number]>;
  camera: Camera;
  viewportSize: readonly [number, number];
  animateCamera: (target: Camera) => void;
}

export function useKeyboardShortcuts(ctx: ShortcutContext) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const cmd = e.metaKey || e.ctrlKey;
      const [vw, vh] = ctx.viewportSize;
      if (vw < 10 || vh < 10) return;

      const rects = layoutPages(ctx.pageSizesPt);

      if (cmd && e.key === "0") {
        e.preventDefault();
        if (rects.length === 0) return;
        ctx.animateCamera(fitCamera(vw, vh, documentBounds(rects)));
        return;
      }

      if (cmd && e.key === "1") {
        e.preventDefault();
        // Zoom to 100% centred on whatever's currently at the
        // viewport centre.
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - ctx.camera.tx) / ctx.camera.scale;
        const docY = (cy - ctx.camera.ty) / ctx.camera.scale;
        ctx.animateCamera({
          scale: 1,
          tx: cx - docX,
          ty: cy - docY,
        });
        return;
      }

      if (e.key === "PageDown" || e.key === "PageUp" || e.key === "Home" || e.key === "End") {
        if (rects.length === 0) return;
        // Determine the page closest to viewport centre — used as
        // the "current" page for relative navigation.
        const cx = vw / 2;
        const cy = vh / 2;
        const docX = (cx - ctx.camera.tx) / ctx.camera.scale;
        const docY = (cy - ctx.camera.ty) / ctx.camera.scale;
        let currentIdx = 0;
        let bestDistSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          const px = r.x + r.w / 2;
          const py = r.y + r.h / 2;
          const dsq = (px - docX) ** 2 + (py - docY) ** 2;
          if (dsq < bestDistSq) {
            bestDistSq = dsq;
            currentIdx = i;
          }
        }
        let target: number;
        switch (e.key) {
          case "PageDown":
            target = Math.min(rects.length - 1, currentIdx + 1);
            break;
          case "PageUp":
            target = Math.max(0, currentIdx - 1);
            break;
          case "Home":
            target = 0;
            break;
          case "End":
            target = rects.length - 1;
            break;
          default:
            return;
        }
        if (target === currentIdx) return;
        e.preventDefault();
        ctx.animateCamera(fitCamera(vw, vh, rects[target]));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
