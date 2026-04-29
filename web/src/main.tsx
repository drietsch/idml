import React from "react";
import ReactDOM from "react-dom/client";
import { ViewerApp } from "./ViewerApp";
import { EditorApp } from "./EditorApp";
import "./viewer.css";
import "./editor.css";

// Path-based routing: /viewer or /viewer/* shows the corpus diff
// viewer (the existing tool). Everything else shows the editor.
// No router dep — pathname check is enough for two routes.
const isViewer = window.location.pathname.startsWith("/viewer");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isViewer ? <ViewerApp /> : <EditorApp />}</React.StrictMode>,
);
