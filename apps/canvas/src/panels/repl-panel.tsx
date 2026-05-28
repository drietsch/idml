// Scripting Stage 1.b — REPL panel. Text input → parsed command →
// dispatched through the existing client (mutate / undo / redo /
// elementProperties). The output log shows the parsed command, the
// dispatch outcome, and inspect results.
//
// Same Operation channel as the inspector and gestures; this is
// the third consumer and the prerequisite for Stage 2 (QuickJS).

import { useCallback, useRef, useState } from "react";

import { useCanvasClient } from "@verso/shell";

import { parseLine, type ParsedCommand } from "../repl/parser";

interface LogEntry {
  prompt: string;
  result: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

export function ReplPanel(_: PanelProps) {
  const client = useCanvasClient();
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);

  const append = useCallback((entry: LogEntry) => {
    setLog((prev) => [...prev, entry]);
    // Defer the scroll to the next paint so the new entry is in the DOM.
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({
        top: logRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const run = useCallback(
    async (line: string): Promise<string> => {
      const parsed: ParsedCommand = parseLine(line);
      switch (parsed.kind) {
        case "error":
          return `error: ${parsed.message}`;
        case "undo":
          await client.undo();
          return "ok (undo)";
        case "redo":
          await client.redo();
          return "ok (redo)";
        case "inspect": {
          const props = await client.elementProperties(parsed.elementId);
          if (!props) return "null (element not found)";
          return JSON.stringify(props, null, 2);
        }
        case "mutation": {
          try {
            await client.mutate(parsed.mutation);
            return `ok (${parsed.mutation.op})`;
          } catch (err) {
            return `error: dispatch failed (${(err as Error).message})`;
          }
        }
      }
    },
    [client],
  );

  const submit = useCallback(() => {
    const line = draft.trim();
    if (line === "") return;
    setDraft("");
    void run(line).then((result) => {
      append({ prompt: line, result });
    });
  }, [draft, run, append]);

  return (
    <div className="flex flex-col h-full text-sm font-mono" data-repl="ready">
      <div
        ref={logRef}
        className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2"
        data-repl-log
      >
        {log.length === 0 && (
          <div className="text-muted-foreground text-xs">
            Try{" "}
            <code className="bg-muted px-1 rounded">inspect textFrame:ua365e1</code>{" "}
            or{" "}
            <code className="bg-muted px-1 rounded">
              set textFrame:ua365e1 frameOpacity length:50
            </code>
            .
          </div>
        )}
        {log.map((entry, i) => (
          <div key={i} className="space-y-0.5" data-repl-entry>
            <div className="text-foreground">
              <span className="text-muted-foreground mr-2">›</span>
              {entry.prompt}
            </div>
            <pre
              className="text-muted-foreground whitespace-pre-wrap break-words text-xs"
              data-repl-result
            >
              {entry.result}
            </pre>
          </div>
        ))}
      </div>
      <div className="border-t border-input p-1 flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="command…"
          className="flex-1 px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring"
          data-repl-input
        />
        <button
          type="button"
          onClick={submit}
          className="px-2 py-1 rounded hover:bg-muted/60"
          data-repl-submit
        >
          run
        </button>
      </div>
    </div>
  );
}
