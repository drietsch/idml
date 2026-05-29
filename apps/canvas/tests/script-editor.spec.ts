// Scripting Stage 2 — embedded-Boa acceptance. Tests the
// end-to-end path: TS client → worker channel → wasm-bundled
// Boa engine → idml-script bridge → apply layer → wire surface
// reflects the change.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const TEXT_FRAME_ID = "ua365e1";

interface CanvasGlobal {
  client: {
    executeScript: (
      source: string,
    ) => Promise<{ output: string[]; error: string | null }>;
    elementProperties: (id: {
      kind: string;
      id: string;
    }) => Promise<{
      entries: { path: string; value: { type: string; value: unknown } }[];
    } | null>;
    undo: () => Promise<unknown>;
  };
}

async function run(
  page: import("@playwright/test").Page,
  source: string,
): Promise<{ output: string[]; error: string | null }> {
  return page.evaluate(
    async ({ source }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.executeScript(source);
    },
    { source },
  );
}

async function opacity(
  page: import("@playwright/test").Page,
  id: string,
): Promise<unknown> {
  const props = await page.evaluate(
    async ({ id }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      return c.client.elementProperties({ kind: "textFrame", id });
    },
    { id },
  );
  if (!props) throw new Error("no props");
  return props.entries.find((e) => e.path === "frameOpacity")!.value.value;
}

test.describe("Scripting Stage 2 — embedded Boa", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-SCRIPT-1 — verso.set routes through the Operation channel", async ({
    page,
  }) => {
    const result = await run(
      page,
      `verso.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 50);`,
    );
    expect(result.error).toBeNull();
    expect(await opacity(page, TEXT_FRAME_ID)).toBe(50);
  });

  test("AC-SCRIPT-2 — console.log lines surface in output", async ({
    page,
  }) => {
    const result = await run(page, `console.log("hello", 1, true);`);
    expect(result.error).toBeNull();
    expect(result.output.some((l) => l.includes("hello"))).toBe(true);
  });

  test("AC-SCRIPT-3 — verso.frame Proxy sugar writes propagate", async ({
    page,
  }) => {
    const result = await run(
      page,
      `
        const f = verso.frame("textFrame:${TEXT_FRAME_ID}");
        f.frameOpacity = 25;
      `,
    );
    expect(result.error).toBeNull();
    expect(await opacity(page, TEXT_FRAME_ID)).toBe(25);
  });

  test("AC-SCRIPT-4 — verso.undo reverts script-side mutations", async ({
    page,
  }) => {
    const before = await opacity(page, TEXT_FRAME_ID);
    await run(
      page,
      `verso.set("textFrame:${TEXT_FRAME_ID}", "frameOpacity", 75);`,
    );
    expect(await opacity(page, TEXT_FRAME_ID)).toBe(75);
    await run(page, `verso.undo();`);
    expect(await opacity(page, TEXT_FRAME_ID)).toEqual(before);
  });

  test("AC-SCRIPT-5 — syntax errors surface as error, document untouched", async ({
    page,
  }) => {
    const before = await opacity(page, TEXT_FRAME_ID);
    const result = await run(page, "this is not js!!!");
    expect(result.error).not.toBeNull();
    expect(await opacity(page, TEXT_FRAME_ID)).toEqual(before);
  });

  test("AC-SCRIPT-6 — automation example: change every TextFrame's opacity", async ({
    page,
  }) => {
    // The kind of script an InDesign user would write — walk
    // every frame from the tree and tweak a property.
    const result = await run(
      page,
      `
        const tree = JSON.parse(verso.tree());
        let touched = 0;
        function walk(node) {
          if (node.id && node.id.kind === "textFrame") {
            verso.set(node.id.kind + ":" + node.id.id, "frameOpacity", 80);
            touched += 1;
          }
          for (const child of (node.children || [])) walk(child);
        }
        for (const root of tree) walk(root);
        console.log("touched", touched, "text frames");
      `,
    );
    expect(result.error).toBeNull();
    expect(await opacity(page, TEXT_FRAME_ID)).toBe(80);
  });

  test("AC-SCRIPT-7 — verso.selection() reflects the host's element selection", async ({
    page,
  }) => {
    // Drive selection through the client (the same channel the UI's
    // hit-test path uses on click) — proves selection state flows
    // to scripts without depending on a canvas-pixel click that the
    // headless harness can't always land. The two consumers (UI +
    // script bridge) must converge on the same id list.
    await page.evaluate(
      async ({ id }) => {
        const c = (
          globalThis as unknown as {
            __canvas: CanvasGlobal & {
              client: {
                setElementSelection: (
                  ids: { kind: string; id: string }[],
                  mode: string,
                ) => Promise<unknown>;
              };
            };
          }
        ).__canvas;
        await c.client.setElementSelection([{ kind: "textFrame", id }], "replace");
      },
      { id: TEXT_FRAME_ID },
    );
    const result = await run(
      page,
      `
        const ids = verso.selection();
        console.log("selection", JSON.stringify(ids));
      `,
    );
    expect(result.error).toBeNull();
    const line = result.output.find((l) => l.includes("selection"));
    expect(line, "verso.selection() should emit a log line").toBeDefined();
    expect(line).toContain(TEXT_FRAME_ID);
    expect(line).toContain("textFrame");
  });
});
