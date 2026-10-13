import { hierarchyOrder } from "../../vendor/hexframe/src/rig";
import type { Rig } from "../../vendor/hexframe/src/rig";

interface HierarchyProps {
  readonly rig: Rig;
  readonly selected: string | null;
  readonly onSelect: (bone: string) => void;
}

function depthOf(rig: Rig, name: string): number {
  let depth = 0;
  for (let parent = rig.byName.get(name)?.parent ?? null; parent !== null; parent = rig.byName.get(parent)?.parent ?? null) {
    depth += 1;
  }
  return depth;
}

/** The bone tree in Hexframe's hierarchy order: every parent precedes its children. */
export function Hierarchy({ rig, selected, onSelect }: HierarchyProps) {
  return (
    <ul className="hierarchy" aria-label="Bone hierarchy">
      {hierarchyOrder(rig).map((bone) => (
        <li key={bone.name}>
          <button
            type="button"
            className={bone.name === selected ? "hierarchy__bone hierarchy__bone--selected" : "hierarchy__bone"}
            style={{ paddingInlineStart: `${0.75 + depthOf(rig, bone.name) * 0.9}rem` }}
            aria-pressed={bone.name === selected}
            title={bone.name}
            onClick={() => onSelect(bone.name)}
          >
            <span className="truncate">{bone.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
