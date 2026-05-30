// File-loading orchestration extracted from CanvasApp.tsx — the
// `onFile` flow that turns a dropped file into (a) loaded
// document handle, (b) per-page snapshots, (c) Tier 3 resolution.
//
// The loader takes the canvas client + the document/loading
// callbacks (typically the setters from DocumentContext). It does
// NOT depend on React; pass it the setters and it dispatches.

// eslint-disable-next-line import/no-relative-parent-imports
import type { CanvasClient } from "@paged-media/client";
// eslint-disable-next-line import/no-relative-parent-imports
import type {
  DocumentHandle,
  PageId,
} from "@paged-media/client";

import type { LoadingState } from "./document-context";

const SNAPSHOT_WIDTH_PX = 256;

export interface DocumentLoaderCallbacks {
  setHandle: (h: DocumentHandle | null) => void;
  setLoading: (l: LoadingState | null) => void;
  setStatus: (s: string) => void;
  setSnapshotsReady: (ready: boolean) => void;
  addSnapshot: (pageId: PageId, objectUrl: string) => void;
  resetForNewDocument: () => void;
  pushWarning: (w: string) => void;
}

/**
 * Drives the load → snapshot → ready sequence for one IDML file.
 *
 * Order matters here: each step must complete before the next. The
 * worker is single-threaded; parallel requests would only queue.
 * Snapshot progress lands in the UI page-by-page (the navigator
 * shows the snapshot as soon as it lands), so the loop is
 * deliberately not Promise.all.
 *
 * Errors at the load step abort; per-page snapshot errors are
 * pushed as warnings and the loop continues — a missing snapshot
 * shouldn't block the rest of the document.
 */
export async function loadDocumentFile(
  client: CanvasClient,
  file: File,
  cb: DocumentLoaderCallbacks,
): Promise<void> {
  cb.setStatus(`loading ${file.name} (${file.size.toLocaleString()} bytes)…`);
  cb.setLoading({ name: file.name, bytes: file.size });
  cb.resetForNewDocument();

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Phase 3 — auto-fetch a default font so text is shaped + the
  // captured StoryLayout has real glyph positions. Without this the
  // caret + selection rendering has nothing to position against
  // (glyphs vec empty → no clusters captured). Inter is checked in
  // under corpus/fonts/.
  let fontBytes: Uint8Array | undefined;
  try {
    const fontResp = await fetch("/fonts/Inter.ttf");
    if (fontResp.ok) {
      fontBytes = new Uint8Array(await fontResp.arrayBuffer());
    }
  } catch {
    // Font fetch is best-effort; canvas still renders without it.
  }

  let handle: DocumentHandle;
  try {
    handle = await client.loadDocument(bytes, fontBytes);
  } catch (err) {
    cb.setLoading(null);
    cb.setStatus(`load failed: ${String(err)}`);
    return;
  }

  cb.setHandle(handle);
  cb.setLoading(null);
  cb.setStatus(
    `loaded ${handle.pageCount} page${handle.pageCount === 1 ? "" : "s"}; snapshotting…`,
  );

  // Sequential snapshot requests — see comment above re: worker
  // being single-threaded.
  for (const pageId of handle.pageIds) {
    try {
      const snap = await client.requestSnapshot(pageId, SNAPSHOT_WIDTH_PX);
      const blob = new Blob([new Uint8Array(snap.pngBytes)], {
        type: "image/png",
      });
      const url = URL.createObjectURL(blob);
      cb.addSnapshot(pageId, url);
    } catch (err) {
      cb.pushWarning(`snapshot ${pageId}: ${String(err)}`);
    }
  }

  cb.setStatus(
    `loaded ${handle.pageCount} page${handle.pageCount === 1 ? "" : "s"}`,
  );
  cb.setSnapshotsReady(true);
}
