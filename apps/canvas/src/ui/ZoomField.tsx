// Header zoom indicator + scrub control. First consumer of
// @paged-media/ui's `NumberInput` — establishes the round-trip for the
// new gesture-pipeline primitive in a low-stakes corner of the
// shell (changing zoom is non-destructive). Drag the leading "%"
// chip horizontally to scrub; native keyboard editing still works.

import { useCamera } from "@paged-media/shell";
import { NumberInput } from "@paged-media/ui";

const MIN_ZOOM_PERCENT = 5;
const MAX_ZOOM_PERCENT = 1600;
/** Horizontal pixels per percent of zoom change when dragging. */
const ZOOM_STEP = 0.5;

export function ZoomField() {
  const { camera, setCamera } = useCamera();
  const percent = Math.round(camera.scale * 100);

  const apply = (nextPercent: number) => {
    const clamped = Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, nextPercent));
    setCamera({ ...camera, scale: clamped / 100 });
  };

  return (
    <NumberInput
      value={percent}
      label="%"
      step={ZOOM_STEP}
      min={MIN_ZOOM_PERCENT}
      max={MAX_ZOOM_PERCENT}
      precision={0}
      aria-label="zoom percent"
      onChange={apply}
      className="w-20"
    />
  );
}
