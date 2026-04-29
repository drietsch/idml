// OPFS persistence — auto-save of the active project's native bytes.
// M3 ships best-effort: if `navigator.storage.getDirectory` doesn't
// exist (older browsers) the calls no-op. The user-facing "Save"
// button always works via download.
//
// File layout under OPFS root:
//   /idml-editor/
//     last-session.idmlproj     latest auto-save
//
// Auto-save runs every 30s while a project is loaded. Reopen looks
// for `last-session.idmlproj` on editor mount; if found, the user
// gets an "open last session?" link.

const DIR = "idml-editor";
const FILE = "last-session.idmlproj";

async function root(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    return null;
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

export async function autosaveBytes(bytes: Uint8Array): Promise<boolean> {
  try {
    const dir = await root();
    if (!dir) return false;
    const handle = await dir.getFileHandle(FILE, { create: true });
    const writable = await handle.createWritable();
    // Wrap the bytes in a Blob so the writable accepts them across
    // TS lib targets (recent lib.dom narrowed Uint8Array typing).
    await writable.write(new Blob([new Uint8Array(bytes)]));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadAutosave(): Promise<Uint8Array | null> {
  try {
    const dir = await root();
    if (!dir) return null;
    const handle = await dir.getFileHandle(FILE);
    const file = await handle.getFile();
    const buf = new Uint8Array(await file.arrayBuffer());
    return buf;
  } catch {
    return null;
  }
}
