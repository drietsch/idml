// Public surface for the sample bundle. Apps + tests import this
// to construct the worker URL via `import.meta.url`, which gives
// Vite the static reference it needs to bundle the worker as an
// entry point (`new URL("./sample-bundle.worker.ts", import.meta.url)`).

import type { BundleManifest } from "./manifest";

export function sampleBundleManifest(): BundleManifest {
  return {
    id: "verso.sample",
    name: "Verso Sample Bundle",
    version: "0.0.0",
    kernel: new URL("./sample-bundle.worker.ts", import.meta.url),
    contributes: {
      commands: ["verso.sample.hello"],
      keybindings: ["cmd+shift+h"],
      menus: ["Tools/Sample Bundle Hello"],
    },
  };
}
