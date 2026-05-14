import { InspectorTree, NodeId, nodeKey } from "./inspector";

interface Props {
  tree: InspectorTree;
  selectedKey: string | null;
  onSelect: (node: NodeId) => void;
  onSelectPage: (pageIndex: number) => void;
}

export function Tree(props: Props) {
  return (
    <ul className="tree">
      {props.tree.spreads.map((spread) => (
        <li key={spread.index} className="tree-spread">
          <div className="tree-label tree-label-spread">{spread.label}</div>
          <ul>
            {spread.pages.map((page) => (
              <li key={page.index} className="tree-page">
                <button
                  className="tree-label tree-label-page"
                  onClick={() => props.onSelectPage(page.index)}
                >
                  {page.label}
                </button>
                <ul>
                  {page.frames.map((frame) => {
                    const key = nodeKey(frame.id);
                    const isSelected = key === props.selectedKey;
                    return (
                      <li key={key}>
                        <button
                          className={
                            "tree-label tree-label-frame" +
                            (isSelected ? " selected" : "")
                          }
                          onClick={() => {
                            props.onSelect(frame.id);
                            props.onSelectPage(page.index);
                          }}
                        >
                          {frame.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
