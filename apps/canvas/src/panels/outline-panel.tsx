// Outline panel — wraps the existing Outline component for the
// docking substrate. Same pattern as NavigatorPanel: all data
// from context hooks, no props.

import {
  useCamera,
  useDocument,
  type PanelProps,
} from "@verso/shell";
import { Outline } from "../ui/Outline";
import { useAnimatedCamera } from "../ui/useAnimatedCamera";

export function OutlinePanel(_props: PanelProps) {
  const { handle, resolution } = useDocument();
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);

  if (!handle || handle.pageCount === 0 || !resolution) {
    return (
      <div style={{ padding: 12, opacity: 0.5 }}>
        Outline unavailable. Load a document with heading anchors to populate.
      </div>
    );
  }

  return (
    <Outline
      resolution={resolution}
      pageIds={handle.pageIds}
      pageSizesPt={handle.pageSizesPt}
      viewportSize={viewportSize}
      onCameraChange={animateCamera}
    />
  );
}
