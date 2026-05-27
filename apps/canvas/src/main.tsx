import React from "react";
import { createRoot } from "react-dom/client";
import "@verso/shell/styles/globals.css";
import { CanvasApp } from "./ui/CanvasApp";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}
createRoot(root).render(
  <React.StrictMode>
    <CanvasApp />
  </React.StrictMode>,
);
