// Canvas-side Tailwind config. Inherits the shell's design tokens
// + theme variables, then adds the canvas's own JSX paths so its
// inline styles can migrate to Tailwind classes incrementally.
//
// Tailwind only scans paths listed in `content`, so we must enumerate
// both the canvas-side source and every workspace package whose JSX
// participates in the rendered tree.

import shellConfig from "@verso/shell/tailwind.config";
import type { Config } from "tailwindcss";

const config: Config = {
  ...shellConfig,
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/shell/src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
