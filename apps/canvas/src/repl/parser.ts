// Scripting Stage 1.b — text-to-Mutation grammar. Per
// docs/verso/scripting-layer.md §269 the v1 commands are
// `set / insert / remove / move / undo / redo / inspect`. v1
// covers element-property writes, layer-level structural ops,
// undo/redo, and inspect. Scene-graph-level insert/remove/move
// (page items) wait on the apply layer's broader NodeSpec
// coverage.

import type {
  ElementId,
  Mutation,
  PropertyPath,
  Value,
} from "../channel/protocol";

export type ParsedCommand =
  | { kind: "mutation"; mutation: Mutation }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "inspect"; elementId: ElementId }
  | { kind: "error"; message: string };

const ELEMENT_KIND_LITERALS: Record<string, ElementId["kind"]> = {
  textFrame: "textFrame",
  textframe: "textFrame",
  rectangle: "rectangle",
  rect: "rectangle",
  oval: "oval",
  polygon: "polygon",
  graphicLine: "graphicLine",
  graphicline: "graphicLine",
  group: "group",
};

const KNOWN_PROPERTY_PATHS: PropertyPath[] = [
  "frameBounds",
  "frameFillColor",
  "frameStrokeColor",
  "frameStrokeWeight",
  "frameOpacity",
  "frameTransform",
  "imageContentTransform",
  "framePathPoint",
  "pathPointInsert",
  "pathPointRemove",
  "pathPointCurveType",
];

export function parseLine(input: string): ParsedCommand {
  const line = input.trim();
  if (line === "") return { kind: "error", message: "empty input" };
  const tokens = tokenize(line);
  const cmd = tokens[0];
  switch (cmd) {
    case "undo":
      return { kind: "undo" };
    case "redo":
      return { kind: "redo" };
    case "inspect":
      return parseInspect(tokens.slice(1));
    case "set":
      return parseSet(tokens.slice(1));
    case "insert":
      return parseInsert(tokens.slice(1));
    case "remove":
      return parseRemove(tokens.slice(1));
    case "move":
      return parseMove(tokens.slice(1));
    default:
      return { kind: "error", message: `unknown command: ${cmd}` };
  }
}

function parseInspect(args: string[]): ParsedCommand {
  if (args.length !== 1) {
    return { kind: "error", message: "inspect: expected one element-id arg" };
  }
  const id = parseElementId(args[0]);
  if (id === null) {
    return { kind: "error", message: `inspect: bad element id "${args[0]}"` };
  }
  return { kind: "inspect", elementId: id };
}

function parseSet(args: string[]): ParsedCommand {
  // Two shapes:
  //   set <element-id> <propertyPath> <value-spec>
  //   set layer:<id> <visible|locked|printable|name> <bool|text>
  if (args.length < 3) {
    return {
      kind: "error",
      message:
        'set: expected "<element-id> <path> <value>" (3 args)',
    };
  }
  const [nodeSpec, pathSpec, ...valueParts] = args;
  const rawValue = valueParts.join(" ");

  // Layer fast paths — produce typed LayerSet* mutations.
  if (nodeSpec.startsWith("layer:")) {
    const layerId = nodeSpec.slice("layer:".length);
    return parseLayerSet(layerId, pathSpec, rawValue);
  }

  const elementId = parseElementId(nodeSpec);
  if (elementId === null) {
    return { kind: "error", message: `set: bad element id "${nodeSpec}"` };
  }
  if (!KNOWN_PROPERTY_PATHS.includes(pathSpec as PropertyPath)) {
    return {
      kind: "error",
      message: `set: unknown property path "${pathSpec}"`,
    };
  }
  const value = parseValue(rawValue);
  if (value === null) {
    return {
      kind: "error",
      message: `set: cannot parse value "${rawValue}"`,
    };
  }
  return {
    kind: "mutation",
    mutation: {
      op: "setElementProperty",
      args: { elementId, path: pathSpec as PropertyPath, value },
    },
  };
}

function parseLayerSet(
  layerId: string,
  field: string,
  raw: string,
): ParsedCommand {
  switch (field) {
    case "visible":
    case "locked":
    case "printable": {
      const b = parseBool(raw);
      if (b === null) {
        return {
          kind: "error",
          message: `set layer:<id> ${field}: expected true/false`,
        };
      }
      const op =
        field === "visible"
          ? "layerSetVisible"
          : field === "locked"
            ? "layerSetLocked"
            : "layerSetPrintable";
      const args =
        field === "visible"
          ? { layerId, visible: b }
          : field === "locked"
            ? { layerId, locked: b }
            : { layerId, printable: b };
      return {
        kind: "mutation",
        // The literal union type-narrows on `op` so each branch
        // matches the matching arg shape.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutation: { op, args } as any,
      };
    }
    case "name":
      return {
        kind: "mutation",
        mutation: {
          op: "layerSetName",
          args: { layerId, name: raw },
        },
      };
    default:
      return {
        kind: "error",
        message: `set layer:<id> ${field}: unsupported field`,
      };
  }
}

function parseInsert(args: string[]): ParsedCommand {
  // v1: `insert layer <position> <name>`. Scene-graph inserts
  // (page items) wait on the apply layer's broader NodeSpec.
  if (args.length >= 3 && args[0] === "layer") {
    const position = Number.parseInt(args[1], 10);
    if (!Number.isFinite(position)) {
      return { kind: "error", message: "insert layer: bad position" };
    }
    const name = args.slice(2).join(" ");
    return {
      kind: "mutation",
      mutation: { op: "layerInsert", args: { position, name } },
    };
  }
  return {
    kind: "error",
    message: "insert: only `insert layer <position> <name>` supported in v1",
  };
}

function parseRemove(args: string[]): ParsedCommand {
  // v1: `remove layer:<id>`.
  if (args.length !== 1) {
    return { kind: "error", message: "remove: expected one arg" };
  }
  if (args[0].startsWith("layer:")) {
    const layerId = args[0].slice("layer:".length);
    return {
      kind: "mutation",
      mutation: { op: "layerRemove", args: { layerId } },
    };
  }
  return {
    kind: "error",
    message: "remove: only `remove layer:<id>` supported in v1",
  };
}

function parseMove(args: string[]): ParsedCommand {
  // v1: `move layer:<id> <new-index>`.
  if (args.length !== 2) {
    return { kind: "error", message: "move: expected two args" };
  }
  if (args[0].startsWith("layer:")) {
    const layerId = args[0].slice("layer:".length);
    const newIndex = Number.parseInt(args[1], 10);
    if (!Number.isFinite(newIndex)) {
      return { kind: "error", message: "move layer: bad new-index" };
    }
    return {
      kind: "mutation",
      mutation: { op: "layerMove", args: { layerId, newIndex } },
    };
  }
  return {
    kind: "error",
    message: "move: only `move layer:<id> <new-index>` supported in v1",
  };
}

function parseElementId(token: string): ElementId | null {
  const colon = token.indexOf(":");
  if (colon < 0) return null;
  const kind = token.slice(0, colon);
  const id = token.slice(colon + 1);
  const resolved = ELEMENT_KIND_LITERALS[kind];
  if (!resolved || id === "") return null;
  return { kind: resolved, id };
}

function parseBool(s: string): boolean | null {
  const trimmed = s.trim().toLowerCase();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return null;
}

function parseValue(raw: string): Value | null {
  const colon = raw.indexOf(":");
  if (colon < 0) return null;
  const kind = raw.slice(0, colon);
  const payload = raw.slice(colon + 1).trim();
  switch (kind) {
    case "bool": {
      const b = parseBool(payload);
      return b === null ? null : ({ type: "bool", value: b } as Value);
    }
    case "length": {
      if (payload === "null") return { type: "length", value: null } as Value;
      const n = Number.parseFloat(payload);
      if (!Number.isFinite(n)) return null;
      return { type: "length", value: n } as Value;
    }
    case "colorRef": {
      const value = payload === "null" ? null : payload;
      return { type: "colorRef", value } as Value;
    }
    case "text":
      return { type: "text", value: payload } as Value;
    case "bounds": {
      const parts = payload.split(",").map((s) => Number.parseFloat(s.trim()));
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        return null;
      }
      return { type: "bounds", value: parts as [number, number, number, number] } as Value;
    }
    case "transform": {
      if (payload === "null") return { type: "transform", value: null } as Value;
      const parts = payload.split(",").map((s) => Number.parseFloat(s.trim()));
      if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) {
        return null;
      }
      return {
        type: "transform",
        value: parts as [number, number, number, number, number, number],
      } as Value;
    }
    default:
      return null;
  }
}

function tokenize(line: string): string[] {
  return line.split(/\s+/).filter((t) => t.length > 0);
}
