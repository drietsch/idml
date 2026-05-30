// Step 3d / 3h — the canonical file-open command. The header file
// picker and (3h+) the Cmd+K palette both resolve through this
// contribution so there's a single load path.

import { loadDocumentFile } from "../document-loader";
import type { PagedEditor } from "../paged-editor";
import type { CommandContribution } from "../../registries";

export const PAGED_FILE_OPEN_IDML = "paged.file.openIdml";

/**
 * Build the file-open command contribution. The `pickFile` thunk
 * is supplied at registration time so the shell stays decoupled
 * from the DOM-level mechanism (file input, drag-drop, palette
 * invocation, OS file dialog) — every entry point hands in its
 * own picker and the loader runs identically afterward.
 */
export function buildOpenIdmlCommand(options: {
  pickFile: () => Promise<File | null>;
  setStatus: (s: string) => void;
  pushWarning: (w: string) => void;
}): CommandContribution {
  return {
    id: PAGED_FILE_OPEN_IDML,
    title: "Open IDML…",
    category: "File",
    handler: async (paged) => {
      const editor = paged as PagedEditor;
      const file = await options.pickFile();
      if (!file) return;
      await loadDocumentFile(editor.client, file, {
        setHandle: editor.document.setHandle,
        setLoading: editor.document.setLoading,
        setStatus: options.setStatus,
        setSnapshotsReady: editor.document.setSnapshotsReady,
        addSnapshot: (pageId, url) => {
          editor.document.setSnapshots((prev) => {
            const next = new Map(prev);
            next.set(pageId, url);
            return next;
          });
        },
        resetForNewDocument: editor.document.resetForNewDocument,
        pushWarning: options.pushWarning,
      });
    },
  };
}
