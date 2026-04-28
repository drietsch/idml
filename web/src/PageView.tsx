import { useEffect, useRef } from "react";

export interface Transform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PageViewProps {
  /** URL of the base image (PDF page raster or candidate render). */
  src: string | null;
  /** Optional overlay image (heatmap). Drawn on top at `overlayOpacity`. */
  overlaySrc?: string | null;
  overlayOpacity?: number;
  /** Shared transform — both panes consume the same object. */
  transform: Transform;
  /** Called when the user wheels / drags inside this pane. */
  onTransformChange: (next: Transform) => void;
  label: string;
  empty?: string;
  onDrop?: (file: File) => void;
  className?: string;
}

/**
 * One-side image viewport. The image draws into a `<canvas>` via
 * `ctx.setTransform`, so the parent can keep both panes in lock-step
 * by sharing a single `Transform` object across them.
 *
 * Wheel events change zoom around the cursor; pointer drags pan. The
 * viewport always letterboxes the image to fit at zoom = 1, then
 * scales further when the user zooms in.
 */
export function PageView(props: PageViewProps) {
  const {
    src,
    overlaySrc,
    overlayOpacity = 0.6,
    transform,
    onTransformChange,
    label,
    empty,
    onDrop,
    className,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImg = useRef<HTMLImageElement | null>(null);
  const overlayImg = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Load the base image whenever the URL changes.
  useEffect(() => {
    if (!src) {
      baseImg.current = null;
      paint();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImg.current = img;
      paint();
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);

  // Same wiring for the heatmap overlay.
  useEffect(() => {
    if (!overlaySrc) {
      overlayImg.current = null;
      paint();
      return;
    }
    const img = new Image();
    img.onload = () => {
      overlayImg.current = img;
      paint();
    };
    img.src = overlaySrc;
    return () => {
      img.onload = null;
    };
  }, [overlaySrc]);

  // Repaint whenever the transform updates.
  useEffect(() => {
    paint();
  });

  // Resize observer keeps the canvas's pixel buffer in sync with its
  // CSS box. Without this, zooming + the parent grid resize cause the
  // canvas to stretch the bitmap rather than redrawing crisply.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      paint();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  });

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = baseImg.current;
    if (!img) return;
    const dpr = window.devicePixelRatio || 1;
    // Fit the image inside the viewport at zoom = 1.
    const fit = Math.min(canvas.width / img.width, canvas.height / img.height);
    const scale = fit * transform.zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const cx = (canvas.width - drawW) * 0.5 + transform.panX * dpr;
    const cy = (canvas.height - drawH) * 0.5 + transform.panY * dpr;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, cx, cy, drawW, drawH);
    if (overlayImg.current) {
      ctx.globalAlpha = overlayOpacity;
      ctx.drawImage(overlayImg.current, cx, cy, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextZoom = Math.max(0.2, Math.min(8, transform.zoom * factor));
    // Anchor zoom around the cursor — keeps the pixel under the
    // mouse stationary while zoom changes.
    const canvas = canvasRef.current;
    if (canvas && baseImg.current) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width * 0.5;
      const my = e.clientY - rect.top - rect.height * 0.5;
      const ratio = nextZoom / transform.zoom;
      onTransformChange({
        zoom: nextZoom,
        panX: transform.panX * ratio + mx * (1 - ratio),
        panY: transform.panY * ratio + my * (1 - ratio),
      });
    } else {
      onTransformChange({ ...transform, zoom: nextZoom });
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    onTransformChange({
      ...transform,
      panX: transform.panX + dx,
      panY: transform.panY + dy,
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!onDrop) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).classList.add("dropzone-active");
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!onDrop) return;
    (e.currentTarget as HTMLDivElement).classList.remove("dropzone-active");
  }

  function onDropEvent(e: React.DragEvent<HTMLDivElement>) {
    if (!onDrop) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).classList.remove("dropzone-active");
    const file = e.dataTransfer.files[0];
    if (file) onDrop(file);
  }

  return (
    <div
      className={`pane ${className ?? ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDropEvent}
    >
      {src ? (
        <canvas
          ref={canvasRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ) : (
        <div className="pane-empty">{empty ?? "no image"}</div>
      )}
      <div className="pane-label">{label}</div>
    </div>
  );
}
