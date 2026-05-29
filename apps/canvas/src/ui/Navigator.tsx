// Navigator side panel.
//
// Scrollable column of page thumbnails. Click to fit-camera onto
// that page. Reuses the snapshot tier directly — no extra
// rendering. Per spec §8.5 the navigator's scroll position is
// independent of the canvas's, so users can browse pages while
// keeping their work in view.

import { useCallback, useMemo } from "react";
import type { Camera } from "@verso/client";
import type { PageId } from "@verso/client";
import { fitCamera, layoutPages, type PageRect } from "./layout";

export interface NavigatorProps {
  pageIds: ReadonlyArray<PageId>;
  pageSizesPt: ReadonlyArray<readonly [number, number]>;
  snapshots: ReadonlyMap<PageId, string>;
  viewportSize: readonly [number, number];
  onCameraChange: (cam: Camera) => void;
}

const THUMB_WIDTH_PX = 120;

export function Navigator(props: NavigatorProps) {
  const rects = useMemo(
    () => layoutPages(props.pageSizesPt),
    [props.pageSizesPt],
  );

  const onJumpTo = useCallback(
    (rect: PageRect) => {
      const [vw, vh] = props.viewportSize;
      if (vw < 10 || vh < 10) return;
      props.onCameraChange(fitCamera(vw, vh, rect));
    },
    [props],
  );

  return (
    <aside style={panelStyle}>
      <header style={headerStyle}>
        <strong>Pages</strong>
        <span style={{ opacity: 0.6 }}>
          {props.snapshots.size}/{props.pageIds.length}
        </span>
      </header>
      <div style={listStyle}>
        {props.pageIds.map((id, i) => {
          const rect = rects[i];
          const url = props.snapshots.get(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onJumpTo(rect)}
              style={tileStyle}
              title={`Jump to page ${i + 1} (${id})`}
            >
              <div
                style={{
                  width: THUMB_WIDTH_PX,
                  aspectRatio: `${rect.w} / ${rect.h}`,
                  border: "1px solid #ccc",
                  background: "#f6f6f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#999",
                  fontSize: 10,
                }}
              >
                {url ? (
                  <img
                    src={url}
                    alt={`Page ${i + 1}`}
                    style={{ width: "100%", height: "100%", display: "block" }}
                    draggable={false}
                  />
                ) : (
                  "…"
                )}
              </div>
              <span style={captionStyle}>{i + 1}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  width: 160,
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
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 8,
};

const tileStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
};

const captionStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#555",
};
