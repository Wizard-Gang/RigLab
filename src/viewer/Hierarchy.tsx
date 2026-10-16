import { hierarchyOrder } from "../../vendor/hexframe/src/rig";
import type { Rig } from "../../vendor/hexframe/src/rig";
import type { RigLabWeapon } from "../format/weapon";

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

interface WeaponHierarchyProps {
  readonly weapon: RigLabWeapon;
  /** The selected body, and its selected grip if any. */
  readonly selected: { readonly body: string; readonly grip: string | null } | null;
  readonly onSelect: (body: string, grip: string | null) => void;
}

/** Rig setup's class weapon after the bones: each body, and under it each grip with the chain that holds it. */
export function WeaponHierarchy({ weapon, selected, onSelect }: WeaponHierarchyProps) {
  const row = (body: string, grip: string | null, depth: number, label: string, title: string) => {
    const pressed = selected?.body === body && selected.grip === grip;
    return (
      <li key={`${body}:${grip ?? ""}`}>
        <button
          type="button"
          className={pressed ? "hierarchy__bone hierarchy__bone--selected" : "hierarchy__bone"}
          style={{ paddingInlineStart: `${0.75 + depth * 0.9}rem` }}
          aria-pressed={pressed}
          title={title}
          onClick={() => onSelect(body, grip)}
        >
          <span className="truncate">{label}</span>
        </button>
      </li>
    );
  };
  return (
    <ul className="hierarchy hierarchy--weapon" aria-label={`The ${weapon.name}'s bodies and grips`}>
      {weapon.bodies.flatMap((body) => [
        row(body.name, null, 0, body.name, `The ${weapon.name}'s ${body.name}`),
        ...body.grips.map((grip) => row(body.name, grip.name, 1, `${grip.name} · ${grip.chain}`, `The ${body.name}'s ${grip.name} grip, held by ${grip.chain}`)),
      ])}
    </ul>
  );
}
