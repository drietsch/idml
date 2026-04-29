// Inspector panel for the current selection. Reads X/Y/W/H out of
// the bbox at the current epoch; commits a `SetFrameBounds` command
// on numeric-field commit (Enter or blur). Delete button issues
// `DeleteFrame`.
//
// M1 keeps it tight: no rotation field (the bbox extraction would
// need to expose the underlying ItemTransform components — saved for
// when SetFrameBounds learns to preserve rotation), no constraint
// linking, no unit selector.

import { useEffect, useRef, useState } from "react";
import type { EditorClient } from "./editor/EditorClient";

interface Props {
  client: EditorClient | null;
  selection: string | null;
  /** Editor epoch — bumps trigger re-fetch. */
  epoch: number;
  pageIndex: number;
  /** Callback so EditorApp can reset selection / re-render. */
  onSelectionChange: (id: string | null) => void;
  onCommandApplied: () => void;
}

interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Inspector({
  client,
  selection,
  epoch,
  pageIndex,
  onSelectionChange,
  onCommandApplied,
}: Props) {
  const [bbox, setBbox] = useState<Bbox | null>(null);

  useEffect(() => {
    if (!client || !selection) {
      setBbox(null);
      return;
    }
    setBbox(client.frameBboxPagePt(pageIndex, selection));
  }, [client, selection, epoch, pageIndex]);

  if (!selection || !bbox) return null;

  function commit(field: "x" | "y" | "w" | "h", value: number) {
    if (!client || !selection || !bbox) return;
    const next = { ...bbox, [field]: value };
    // SetFrameBounds takes spread coords; the inspector exposes
    // page-relative numbers, but for M1 we treat the page origin
    // as (0,0) of the spread (single-page docs). Multi-page support
    // arrives with the page→spread map in M3.
    client.applyCommand({
      type: "SetFrameBounds",
      frame: { kind: "Frame", id: selection },
      x_pt: next.x,
      y_pt: next.y,
      w_pt: Math.max(1, next.w),
      h_pt: Math.max(1, next.h),
      transient: false,
    });
    onCommandApplied();
  }

  function deleteFrame() {
    if (!client || !selection) return;
    client.applyCommand({
      type: "DeleteFrame",
      frame: { kind: "Frame", id: selection },
    });
    onSelectionChange(null);
    onCommandApplied();
  }

  const placeInputRef = useRef<HTMLInputElement | null>(null);

  async function onPlaceFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file || !client || !selection) {
      ev.target.value = "";
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = file.type || guessMimeFromExt(file.name);
    const dataUri = await toDataUri(buf, mime);
    client.applyCommand({
      type: "PlaceImageInFrame",
      frame: { kind: "Frame", id: selection },
      link_uri: dataUri,
    });
    ev.target.value = "";
    onCommandApplied();
  }

  function clearPlacedImage() {
    if (!client || !selection) return;
    client.applyCommand({
      type: "PlaceImageInFrame",
      frame: { kind: "Frame", id: selection },
      link_uri: null,
    });
    onCommandApplied();
  }

  return (
    <aside className="inspector" onPointerDown={(e) => e.stopPropagation()}>
      <h3>Frame</h3>
      <div className="frame-id" title={selection}>
        {selection}
      </div>
      <NumericField
        label="X"
        value={bbox.x}
        onCommit={(v) => commit("x", v)}
      />
      <NumericField
        label="Y"
        value={bbox.y}
        onCommit={(v) => commit("y", v)}
      />
      <NumericField
        label="W"
        value={bbox.w}
        onCommit={(v) => commit("w", v)}
      />
      <NumericField
        label="H"
        value={bbox.h}
        onCommit={(v) => commit("h", v)}
      />
      <div className="row">
        <button
          type="button"
          onClick={() => {
            client?.applyCommand({
              type: "BringFrameToFront",
              frame: { kind: "Frame", id: selection },
            });
            onCommandApplied();
          }}
        >
          to front
        </button>
        <button
          type="button"
          onClick={() => {
            client?.applyCommand({
              type: "SendFrameToBack",
              frame: { kind: "Frame", id: selection },
            });
            onCommandApplied();
          }}
        >
          to back
        </button>
      </div>
      <div className="row">
        <button
          type="button"
          onClick={() => placeInputRef.current?.click()}
          title="place an image into this frame"
        >
          place…
        </button>
        <button type="button" onClick={clearPlacedImage}>
          clear
        </button>
      </div>
      <input
        ref={placeInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onPlaceFile}
      />
      <div className="row">
        <button type="button" className="danger" onClick={deleteFrame}>
          delete
        </button>
      </div>
    </aside>
  );
}

function guessMimeFromExt(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function toDataUri(buf: Uint8Array, mime: string): Promise<string> {
  // Use FileReader for chunked base64; cheaper than manual btoa for
  // multi-megabyte images.
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("unexpected reader result"));
    };
    reader.readAsDataURL(new Blob([new Uint8Array(buf)], { type: mime }));
  });
}

interface NumericFieldProps {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}

function NumericField({ label, value, onCommit }: NumericFieldProps) {
  const [draft, setDraft] = useState(value.toFixed(2));
  useEffect(() => {
    setDraft(value.toFixed(2));
  }, [value]);

  function tryCommit() {
    const v = parseFloat(draft);
    if (Number.isFinite(v) && v !== value) onCommit(v);
    else setDraft(value.toFixed(2));
  }

  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={tryCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            tryCommit();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(value.toFixed(2));
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
