// Manifest written by `corpus/samples/diff.sh` after each successful run.
export interface Manifest {
  samples: SampleEntry[];
}

export interface SampleEntry {
  name: string;
  idml: string;
  pdf: string;
  pages: number;
  passing: number;
  diff_dir: string;
  report: string;
}

// One row per page of the per-page report emitted by `paged-diff` /
// `paged-fidelity`. The diff harness collects these into a JSON array.
export interface PageReport {
  page: number;
  mean_de: number;
  p99_de: number;
  ssim: number;
  passes: boolean;
}

// Shape of `render_report(...)` from paged-sdk.
export interface RenderReport {
  pages: { index: number; width_pt: number; height_pt: number }[];
  stats: {
    spreads: number;
    pages: number;
    frames: number;
    stories: number;
    paragraphs: number;
    runs: number;
  };
}

export type ViewMode = "corpus" | "upload";
