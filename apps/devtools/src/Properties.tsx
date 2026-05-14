import { useState } from "react";
import {
  Mutation,
  NodeId,
  PropertyDescriptor,
  PropertyValue,
} from "./inspector";

interface Props {
  descriptors: PropertyDescriptor[];
  selected: NodeId;
  onMutate: (mutation: Mutation) => void;
}

export function Properties(props: Props) {
  return (
    <div className="properties">
      <div className="properties-header">
        <strong>{props.selected.kind}</strong>
        <code>{props.selected.id}</code>
      </div>
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Value</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {props.descriptors.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td>
                <Widget
                  descriptor={d}
                  onChange={(value) =>
                    props.onMutate({
                      node: props.selected,
                      property: d.key,
                      value,
                    })
                  }
                />
              </td>
              <td className="source">
                {d.source.kind === "InheritedFrom"
                  ? `inherits: ${d.source.name}`
                  : d.source.kind === "Default"
                  ? "default"
                  : "local"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Widget(props: {
  descriptor: PropertyDescriptor;
  onChange: (value: PropertyValue) => void;
}) {
  const { descriptor, onChange } = props;
  if (!descriptor.settable) {
    return <ReadOnlyValue value={descriptor.authored} />;
  }
  switch (descriptor.kind) {
    case "bounds":
      return <BoundsWidget value={descriptor.authored} onChange={onChange} />;
    case "color":
      return <ColorRefWidget value={descriptor.authored} onChange={onChange} />;
    default:
      return <ReadOnlyValue value={descriptor.authored} />;
  }
}

function ReadOnlyValue(props: { value: PropertyValue }) {
  return <code>{stringify(props.value)}</code>;
}

function BoundsWidget(props: {
  value: PropertyValue;
  onChange: (value: PropertyValue) => void;
}) {
  const initial = props.value.type === "bounds" ? props.value.value : [0, 0, 0, 0];
  const [b, setB] = useState<[number, number, number, number]>([
    initial[0],
    initial[1],
    initial[2],
    initial[3],
  ]);
  const commit = (next: [number, number, number, number]) => {
    setB(next);
    props.onChange({ type: "bounds", value: next });
  };
  const labels = ["top", "left", "bottom", "right"] as const;
  return (
    <div className="bounds-widget">
      {labels.map((label, i) => (
        <label key={label}>
          <span>{label}</span>
          <input
            type="number"
            step="1"
            value={b[i]}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isNaN(v)) return;
              const next = [...b] as [number, number, number, number];
              next[i] = v;
              commit(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function ColorRefWidget(props: {
  value: PropertyValue;
  onChange: (value: PropertyValue) => void;
}) {
  const initial = props.value.type === "colorRef" ? props.value.value : null;
  const [val, setVal] = useState<string>(initial ?? "");
  const commit = (v: string) => {
    setVal(v);
    props.onChange({ type: "colorRef", value: v === "" ? null : v });
  };
  return (
    <input
      type="text"
      placeholder="Color/<id>"
      value={val}
      onChange={(e) => commit(e.target.value)}
    />
  );
}

function stringify(value: PropertyValue): string {
  switch (value.type) {
    case "bounds":
      return `[${value.value.join(", ")}]`;
    case "colorRef":
      return value.value ?? "<unset>";
    case "length":
      return `${value.value}`;
    case "text":
      return value.value;
    case "bool":
      return value.value ? "true" : "false";
    case "enum":
      return value.value;
    case "none":
      return "—";
  }
}
