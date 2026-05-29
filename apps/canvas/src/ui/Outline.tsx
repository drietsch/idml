// Outline panel — heading-anchor hierarchy with click-to-jump.
//
// Reuses the Tier 3 NumberingMap (one entry per heading anchor,
// each carrying text + level + assigned page number) to render a
// document outline next to the page navigator. Clicking an entry
// animates the camera to fit-to-page on the anchor's page.

import { useCallback, useMemo } from "react";
import type { Camera } from "@verso/client";
import type { PageId, ResolutionResult } from "@verso/client";
import { fitCamera, layoutPages, type PageRect } from "./layout";

export interface OutlineProps {
  resolution: ResolutionResult | null;
  pageIds: ReadonlyArray<PageId>;
  pageSizesPt: ReadonlyArray<readonly [number, number]>;
  viewportSize: readonly [number, number];
  onCameraChange: (cam: Camera) => void;
}

interface OutlineEntry {
  anchorId: string;
  text: string;
  level: number;
  pageNumber: number;
  pageId: PageId | null;
}

export function Outline(props: OutlineProps) {
  const entries = useMemo<OutlineEntry[]>(() => {
    if (!props.resolution) return [];
    const out: OutlineEntry[] = [];
    for (const [anchorId, pos] of Object.entries(props.resolution.numbering)) {
      // Only render heading anchors in the outline (others get a
      // level of 0 from the resolver).
      if (pos.level === 0) continue;
      out.push({
        anchorId,
        text: pos.text || `(unnamed anchor ${anchorId})`,
        level: pos.level ?? 0,
        pageNumber: pos.pageNumber,
        pageId: pos.pageId,
      });
    }
    // Stable order: pages first, then level within page. This puts
    // the document in reading order so the panel mirrors the page
    // sequence.
    out.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.level - b.level;
    });
    return out;
  }, [props.resolution]);

  const rects = useMemo(
    () => layoutPages(props.pageSizesPt),
    [props.pageSizesPt],
  );

  const onJump = useCallback(
    (entry: OutlineEntry) => {
      if (!entry.pageId) return;
      const idx = props.pageIds.indexOf(entry.pageId);
      if (idx < 0) return;
      const [vw, vh] = props.viewportSize;
      if (vw < 10 || vh < 10) return;
      props.onCameraChange(fitCamera(vw, vh, rects[idx] as PageRect));
    },
    [props, rects],
  );

  const toc = props.resolution?.toc ?? [];
  const onJumpToPageNumber = useCallback(
    (pageNumber: number) => {
      // TOC page numbers are 1-based document-order indices; map
      // back to a page rect by index.
      const idx = pageNumber - 1;
      if (idx < 0 || idx >= rects.length) return;
      const [vw, vh] = props.viewportSize;
      if (vw < 10 || vh < 10) return;
      props.onCameraChange(fitCamera(vw, vh, rects[idx] as PageRect));
    },
    [props, rects],
  );

  if (!props.resolution) {
    return null;
  }
  if (entries.length === 0 && toc.length === 0) {
    return (
      <aside style={panelStyle}>
        <header style={headerStyle}>
          <strong>Outline</strong>
          <span style={{ opacity: 0.6 }}>0</span>
        </header>
        <div style={emptyStyle}>No heading anchors or TOC entries detected.</div>
      </aside>
    );
  }
  return (
    <aside style={panelStyle}>
      {entries.length > 0 && (
        <>
          <header style={headerStyle}>
            <strong>Outline</strong>
            <span style={{ opacity: 0.6 }}>{entries.length}</span>
          </header>
          <div style={listStyle}>
            {entries.map((entry) => (
              <button
                key={entry.anchorId}
                type="button"
                onClick={() => onJump(entry)}
                style={{
                  ...rowStyle,
                  paddingLeft: 8 + Math.max(0, entry.level - 1) * 14,
                }}
                title={`${entry.text} (page ${entry.pageNumber})`}
              >
                <span style={titleStyle}>{entry.text}</span>
                <span style={pageStyle}>{entry.pageNumber}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {toc.length > 0 && (
        <>
          <header style={{ ...headerStyle, borderTop: "1px solid #ddd" }}>
            <strong>TOC</strong>
            <span style={{ opacity: 0.6 }}>{toc.length}</span>
          </header>
          <div style={listStyle}>
            {toc.map((entry, i) => (
              <button
                key={`toc-${i}`}
                type="button"
                onClick={() => onJumpToPageNumber(entry.pageNumber)}
                style={{
                  ...rowStyle,
                  paddingLeft: 8 + Math.max(0, entry.level - 1) * 14,
                }}
                title={`${entry.text} (page ${entry.pageNumber || "?"})`}
              >
                <span style={titleStyle}>{entry.text}</span>
                <span style={pageStyle}>{entry.pageNumber || "—"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  width: 220,
  display: "flex",
  flexDirection: "column",
  borderRight: "1px solid #ddd",
  background: "#fafafa",
  flexShrink: 0,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "4px 0",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  gap: 8,
  padding: "4px 12px 4px 8px",
  border: "none",
  background: "none",
  cursor: "pointer",
  fontSize: 12,
  color: "#1f2937",
  textAlign: "left",
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pageStyle: React.CSSProperties = {
  color: "#6b7280",
  fontVariantNumeric: "tabular-nums",
  fontSize: 11,
};

const emptyStyle: React.CSSProperties = {
  padding: 12,
  fontSize: 12,
  color: "#9ca3af",
  fontStyle: "italic",
};
