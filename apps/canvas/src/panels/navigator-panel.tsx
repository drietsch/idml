// Navigator panel — wraps the existing PageNavigator component to
// fit the shell's PanelProps signature. Reads everything from
// contexts so registration is `{ component: NavigatorPanel }`
// with no per-mount props plumbing.

import {
  useCamera,
  useDocument,
  type PanelProps,
} from "@paged-media/shell";
import { Navigator as PageNavigator } from "../ui/Navigator";
import { useAnimatedCamera } from "../ui/useAnimatedCamera";

export function NavigatorPanel(_props: PanelProps) {
  const { handle, snapshots } = useDocument();
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);

  if (!handle || handle.pageCount === 0) {
    return <div style={{ padding: 12, opacity: 0.5 }}>No document loaded.</div>;
  }

  return (
    <PageNavigator
      pageIds={handle.pageIds}
      pageSizesPt={handle.pageSizesPt}
      snapshots={snapshots}
      viewportSize={viewportSize}
      onCameraChange={animateCamera}
    />
  );
}
