import { useEffect, useMemo, useState } from "react";
import type { Manifest, PageReport, SampleEntry, ViewMode } from "./types";
import { PageView, Transform } from "./PageView";
import { renderPagesUploaded } from "./wasmClient";

const ZERO_TX: Transform = { zoom: 1, panX: 0, panY: 0 };

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<PageReport[] | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [tx, setTx] = useState<Transform>(ZERO_TX);
  const [mode, setMode] = useState<ViewMode>("corpus");
  const [uploadedPages, setUploadedPages] = useState<string[] | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Fetch the corpus manifest at boot.
  useEffect(() => {
    fetch("/samples/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((m: Manifest) => {
        setManifest(m);
        if (m.samples.length > 0 && selected === null) {
          setSelected(m.samples[0].name);
        }
      })
      .catch(() => setManifest({ samples: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sample: SampleEntry | undefined = useMemo(
    () => manifest?.samples.find((s) => s.name === selected),
    [manifest, selected],
  );

  // Reset the page index + transform when the active sample changes.
  useEffect(() => {
    setPage(1);
    setTx(ZERO_TX);
  }, [selected]);

  // Fetch the per-page diff report for the active sample.
  useEffect(() => {
    if (mode !== "corpus" || !sample) {
      setReport(null);
      return;
    }
    fetch(`/diff/report.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((rows: PageReport[]) => setReport(rows))
      .catch(() => setReport(null));
  }, [sample, mode]);

  // Drag-and-drop into the right pane: switch to upload mode.
  async function onUploadFile(file: File) {
    setMode("upload");
    setUploadStatus(`rendering ${file.name}…`);
    setUploadedPages(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const pngs = await renderPagesUploaded(buf);
      const urls = pngs.map((b) =>
        URL.createObjectURL(new Blob([new Uint8Array(b)], { type: "image/png" })),
      );
      setUploadedPages(urls);
      setPage(1);
      setUploadStatus(`${pngs.length} pages rendered`);
    } catch (e) {
      setUploadStatus(`render failed: ${(e as Error).message}`);
    }
  }

  const totalPages =
    mode === "upload"
      ? uploadedPages?.length ?? 0
      : sample?.pages ?? 0;

  const refSrc =
    mode === "corpus" && totalPages > 0
      ? `/diff/ref-${pad3(page)}.png`
      : null;
  const candSrc =
    mode === "upload"
      ? uploadedPages?.[page - 1] ?? null
      : totalPages > 0
        ? `/diff/cand-${pad3(page)}.png`
        : null;
  const heatSrc =
    mode === "corpus" && showHeatmap && totalPages > 0
      ? `/diff/heat-${pad3(page)}.png`
      : null;

  const reportRow = report?.find((r) => r.page === page);

  return (
    <>
      <header className="header">
        <label>
          Sample:
          <select
            value={selected ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setMode("corpus");
              setUploadedPages(null);
              setUploadStatus(null);
            }}
            disabled={!manifest || manifest.samples.length === 0}
          >
            {!manifest?.samples.length && <option>(none — run diff.sh)</option>}
            {manifest?.samples.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} · {s.pages}p · {s.passing}/{s.pages} pass
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          ◀
        </button>
        <span className="metric">
          page {page} / {totalPages || "?"}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          ▶
        </button>

        <button onClick={() => setTx(ZERO_TX)}>reset zoom</button>

        <label>
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
            disabled={mode !== "corpus"}
          />
          heatmap
        </label>

        <span className="spacer" />

        {mode === "upload" && uploadStatus && (
          <span className="metric muted">{uploadStatus}</span>
        )}

        {mode === "corpus" && reportRow && (
          <>
            <span className="metric">
              meanΔE={reportRow.mean_de.toFixed(2)}
            </span>
            <span className="metric">
              p99={reportRow.p99_de.toFixed(2)}
            </span>
            <span className="metric">
              ssim={reportRow.ssim.toFixed(3)}
            </span>
            <span className={`metric ${reportRow.passes ? "pass" : "fail"}`}>
              {reportRow.passes ? "pass" : "fail"}
            </span>
          </>
        )}

        {mode === "upload" && (
          <button
            onClick={() => {
              setMode("corpus");
              setUploadedPages(null);
              setUploadStatus(null);
              setPage(1);
            }}
          >
            back to corpus
          </button>
        )}
      </header>

      <main className="panes">
        <PageView
          src={refSrc}
          transform={tx}
          onTransformChange={setTx}
          label="reference (PDF)"
          empty={
            mode === "upload"
              ? "no reference for uploaded files yet"
              : "select a sample"
          }
        />
        <PageView
          src={candSrc}
          overlaySrc={heatSrc}
          transform={tx}
          onTransformChange={setTx}
          label={mode === "upload" ? "candidate (uploaded)" : "candidate (IDML render)"}
          empty="drop an IDML here"
          onDrop={onUploadFile}
        />
      </main>
    </>
  );
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
