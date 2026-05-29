import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import { IDENTITY_CAMERA, type Camera } from "@verso/client";

import { useCanvasClient } from "./canvas-client-context";

export type ViewportSize = readonly [number, number];

interface CameraContextValue {
  camera: Camera;
  setCamera: (cam: Camera) => void;
  viewportSize: ViewportSize;
  setViewportSize: (size: ViewportSize) => void;
}

const Context = createContext<CameraContextValue | null>(null);

/**
 * Owns the viewport camera (scale + translation) and the measured
 * size of its host element. `setCamera` writes through to the
 * client's SAB so the worker sees the new transform on its next
 * frame; React state mirrors the value so the viewport's CSS
 * transform re-renders in the same tick.
 */
export function CameraProvider({ children }: PropsWithChildren) {
  const client = useCanvasClient();
  const [camera, setCameraState] = useState<Camera>(IDENTITY_CAMERA);
  const [viewportSize, setViewportSize] = useState<ViewportSize>([0, 0]);

  const setCamera = useCallback(
    (cam: Camera) => {
      setCameraState(cam);
      client.setCamera(cam);
    },
    [client],
  );

  const value = useMemo<CameraContextValue>(
    () => ({ camera, setCamera, viewportSize, setViewportSize }),
    [camera, setCamera, viewportSize],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCamera(): CameraContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useCamera called outside CameraProvider");
  }
  return ctx;
}
