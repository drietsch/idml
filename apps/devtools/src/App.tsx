import { useCallback, useEffect, useState } from "react";
import {
  InspectorClient,
  Mutation,
  NodeId,
  PropertyDescriptor,
  nodeKey,
} from "./inspector";
import { Tree } from "./Tree";
import { Properties } from "./Properties";
import { RenderPane } from "./RenderPane";

export function App() {
  const [client, setClient] = useState<InspectorClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [descriptors, setDescriptors] = useState<PropertyDescriptor[]>([]);
  const [renderEpoch, setRenderEpoch] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    try {
      setError(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const c = await InspectorClient.open(bytes);
      setClient(c);
      setSelected(null);
      setDescriptors([]);
      setPageIndex(0);
      setRenderEpoch((e) => e + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!client || !selected) {
      setDescriptors([]);
      return;
    }
    try {
      setDescriptors(client.properties(selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, selected, renderEpoch]);

  const applyMutation = useCallback(
    (mutation: Mutation) => {
      if (!client) return;
      try {
        client.apply(mutation);
        // Trigger re-fetch of descriptors + re-render of PNG. This is
        // the "live, not snapshot" stand-in for M0; a real subscription
        // path lands once paged-mutate's Notifier surfaces through the
        // bridge.
        setRenderEpoch((e) => e + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client],
  );

  return (
    <div className="app">
      <header>
        <h1>IDML DevTools</h1>
        <FileInput onFile={handleFile} disabled={false} />
        {error ? <span className="error">{error}</span> : null}
      </header>
      <main>
        <aside className="pane pane-tree">
          {client ? (
            <Tree
              tree={client.tree()}
              selectedKey={selected ? nodeKey(selected) : null}
              onSelect={setSelected}
              onSelectPage={setPageIndex}
            />
          ) : (
            <Empty>Drop or pick an IDML to begin.</Empty>
          )}
        </aside>
        <section className="pane pane-render">
          {client ? (
            <RenderPane
              client={client}
              pageIndex={pageIndex}
              epoch={renderEpoch}
            />
          ) : (
            <Empty />
          )}
        </section>
        <aside className="pane pane-properties">
          {selected && client ? (
            <Properties
              descriptors={descriptors}
              selected={selected}
              onMutate={applyMutation}
            />
          ) : (
            <Empty>Select a node to inspect its properties.</Empty>
          )}
        </aside>
      </main>
    </div>
  );
}

function FileInput(props: { onFile: (file: File) => void; disabled: boolean }) {
  return (
    <label className="file-input">
      <input
        type="file"
        accept=".idml"
        disabled={props.disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onFile(f);
        }}
      />
      <span>Open IDML…</span>
    </label>
  );
}

function Empty(props: { children?: React.ReactNode }) {
  return <div className="empty">{props.children ?? null}</div>;
}
