// SDK Phase 5 (D1) — document-collection + document-meta hooks.
//
// React side of the `documentCollection:<name>` ReadSpec form. Each
// hook subscribes to `mutationApplied` / `undoApplied` / `redoApplied`
// and re-fetches, matching the snapshot discipline `useBindings`
// uses (sdk.md §11.1: every panel reads from the same one snapshot
// the Operation log applies to).
//
// Generic over the consumer's expected summary type — callers
// pass the typed shape they want:
//
//   const swatches = useCollection<SwatchSummary>("swatches");
//   const styles   = useCollection<ParagraphStyleSummary>("paragraphStyles");
//
// `null` represents "fetch pending"; an empty array means "fetched,
// no entries" (the wire-shape-only collections also return this).
// Same convention `useBindings` follows.

import { useEffect, useState } from "react";
import type { CollectionName, DocumentMeta } from "@paged-media/client";

import { useCanvasClient } from "../state/canvas-client-context";

/**
 * Hook returning the live array for a named document collection.
 * Re-fetches on every Operation-log push (mutation / undo / redo).
 *
 * The cast to `T[]` is the deliberate boundary where the caller
 * commits to a typed `*Summary` shape — the wire-format
 * `CollectionReply.items` is `any` so one envelope serves every
 * collection. Use the matching summary type from `@paged-media/client`
 * (e.g. `SwatchSummary`, `ParagraphStyleSummary`,
 * `CharacterStyleSummary`, `GradientSummary`, `LayerSummary`,
 * `StorySummary`).
 *
 * Returns `null` until the first fetch completes; empty arrays
 * after that for collections with no entries or not yet wired
 * to a backing accessor.
 */
export function useCollection<T>(name: CollectionName): T[] | null {
  const client = useCanvasClient();
  const [items, setItems] = useState<T[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      void client
        .collection<T>(name)
        .then((next) => {
          if (cancelled) return;
          setItems(next as T[]);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([] as T[]);
        });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "documentLoaded"
      ) {
        refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, name]);

  return items;
}

/**
 * Hook returning the live document-meta snapshot — `pageCount`,
 * `activePage`, `units`, `colorMode`, `documentName`, `dirty`.
 * Re-fetches on Operation-log pushes. `null` until first fetch.
 *
 * The Info panel and status bar bind individual `documentMeta:<key>`
 * ReadSpecs against this object; binding-renderer support lives in
 * a follow-up. For v1 the hook is consumed directly by expert
 * leaves.
 */
export function useDocumentMeta(): DocumentMeta | null {
  const client = useCanvasClient();
  const [meta, setMeta] = useState<DocumentMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      void client
        .documentMeta()
        .then((next) => {
          if (cancelled) return;
          setMeta(next);
        })
        .catch(() => {
          if (cancelled) return;
          setMeta(null);
        });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "documentLoaded"
      ) {
        refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client]);

  return meta;
}
