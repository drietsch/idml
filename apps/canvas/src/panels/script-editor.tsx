// Scripting Stage 2 — embedded-Boa script editor. Multi-line
// textarea for JS source + run button + output log. Each `Run`
// dispatches `client.executeScript(source)` against the loaded
// document; the worker's embedded Boa engine evaluates the script
// and returns captured console.* lines + any thrown error.
//
// Same Operation channel as the gestures + Inspector + REPL —
// every `paged.set(...)` lands as a SetProperty mutation and the
// existing mutationApplied notification updates the rest of the UI.

import { useCallback, useRef, useState } from "react";

import { useCanvasClient } from "@paged-media/shell";

interface LogEntry {
  source: string;
  output: string[];
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

const EXAMPLE = `// Try editing the textFrame's opacity from JS.
// All scene-graph writes go through the Operation channel,
// so Cmd-Z undoes them.
paged.set("textFrame:ua365e1", "frameOpacity", 50);
console.log("set opacity to 50");
`;

export function ScriptEditorPanel(_: PanelProps) {
  const client = useCanvasClient();
  const [source, setSource] = useState<string>(EXAMPLE);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      const result = await client.executeScript(source);
      setLog((prev) => [
        ...prev,
        { source, output: result.output, error: result.error },
      ]);
      requestAnimationFrame(() => {
        logRef.current?.scrollTo({
          top: logRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    } catch (err) {
      setLog((prev) => [
        ...prev,
        {
          source,
          output: [],
          error: `dispatch failed: ${(err as Error).message}`,
        },
      ]);
    } finally {
      setRunning(false);
    }
  }, [client, source, running]);

  return (
    <div className="flex flex-col h-full text-sm" data-script-editor="ready">
      <div className="flex items-center justify-between p-1 border-b border-input">
        <span className="text-xs text-muted-foreground px-1">
          JS — embedded Boa
        </span>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="px-2 py-0.5 rounded hover:bg-muted/60 disabled:opacity-50"
          data-action="run"
        >
          {running ? "running…" : "Run ▶"}
        </button>
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="font-mono text-xs p-2 flex-1 min-h-0 bg-background outline-none focus:ring-1 focus:ring-ring resize-none border-b border-input"
        spellCheck={false}
        data-script-source
        onKeyDown={(e) => {
          // Cmd-Enter (or Ctrl-Enter) runs the script — standard
          // creative-tool convention for script panes.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void run();
          }
        }}
      />
      <div
        ref={logRef}
        className="font-mono text-xs p-2 overflow-y-auto bg-muted/30 max-h-48"
        data-script-log
      >
        {log.length === 0 ? (
          <div className="text-muted-foreground">
            Cmd-Enter to run. Output appears here.
          </div>
        ) : (
          log.map((entry, i) => (
            <div key={i} className="border-b border-input/30 mb-1 pb-1">
              {entry.output.map((line, j) => (
                <div key={j}>{line}</div>
              ))}
              {entry.error && (
                <div className="text-red-600" data-script-error>
                  ✗ {entry.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
