import { createRoot } from "react-dom/client";
import "@verso/shell/styles/globals.css";
import { CanvasApp } from "./ui/CanvasApp";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}
// StrictMode intentionally disabled: dockview-react's React-part
// lifecycle isn't StrictMode-safe — its components are disposed
// twice on dev double-mount and throw `resource already disposed`.
// Re-enable once dockview ships a StrictMode-aware fix.
createRoot(root).render(<CanvasApp />);
