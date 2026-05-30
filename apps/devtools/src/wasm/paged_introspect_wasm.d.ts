/* tslint:disable */
/* eslint-disable */

export class Inspector {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply a mutation. Returns a JSON `MutationResultJson`.
     */
    apply(mutation_json: string): string;
    /**
     * Open an IDML by bytes.
     */
    constructor(idml: Uint8Array);
    /**
     * Return property descriptors for a node. `node_json` matches
     * `NodeIdJson` (e.g. `{"kind":"TextFrame","id":"TextFrame/u1"}`).
     */
    properties(node_json: string): string;
    /**
     * Render a page as PNG bytes. Requires the `render` feature.
     */
    renderPage(page_index: number, dpi: number): Uint8Array;
    /**
     * Return the inspector tree as a JSON string.
     */
    tree(): string;
}

export function on_start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_inspector_free: (a: number, b: number) => void;
    readonly inspector_apply: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_new: (a: number, b: number) => [number, number, number];
    readonly inspector_properties: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_renderPage: (a: number, b: number, c: number) => [number, number, number, number];
    readonly inspector_tree: (a: number) => [number, number, number, number];
    readonly on_start: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
