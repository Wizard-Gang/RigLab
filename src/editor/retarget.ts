// Play an animation authored for one rig on another rig with the same bones: rotations carry over unchanged,
// and every translation (root, pins, prop) scales by the ratio of the rigs' root heights.
import type { Pose } from "../../vendor/hexframe/src/rig";
import { validateAnimation } from "../format/animation";
import type { Key, RigLabAnimation } from "../format/animation";
import type { Prop } from "../format/constraints";
import type { RigLabRig } from "../format/rig";

/** How far the root stands from the rig origin, which sits on the ground. */
export function rootHeight(rig: RigLabRig): number {
  const root = rig.bones.find((bone) => bone.name === rig.root)!;
  return Math.hypot(...root.offset);
}

/** Translation scale from one rig to another: root height over root height, or 1 for a rig rooted at its origin. */
export function retargetScale(from: RigLabRig, to: RigLabRig): number {
  const height = rootHeight(from);
  return height > 0 ? rootHeight(to) / height : 1;
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6 || 0;

function scalePose(pose: Pose, root: string, scale: number): Pose {
  return Object.fromEntries(Object.entries(pose).map(([bone, value]) => [
    bone,
    bone === root ? { ...value, x: round((value.x ?? 0) * scale), y: round((value.y ?? 0) * scale) } : value,
  ]));
}

function scaleProp(prop: Prop, scale: number): Prop {
  return {
    ...prop,
    x: round(prop.x * scale),
    y: round(prop.y * scale),
    grips: prop.grips.map((grip) => ({ ...grip, at: [round(grip.at[0] * scale), round(grip.at[1] * scale)] as const })),
  };
}

/** Retarget onto a rig with the same bone names, root and chains; the result must validate against it. */
export function retargetAnimation(animation: RigLabAnimation, from: RigLabRig, to: RigLabRig): RigLabAnimation {
  const names = (rig: RigLabRig): string => rig.bones.map((bone) => bone.name).sort().join(",");
  if (names(from) !== names(to) || from.root !== to.root) {
    throw new Error(`retarget: '${to.name}' needs the same bones and root as '${from.name}'`);
  }
  const scale = retargetScale(from, to);
  const keys: Key[] = animation.keys.map((key) => ({
    ...key,
    pose: scalePose(key.pose, to.root, scale),
    ...(key.pins ? { pins: key.pins.map((pin) => ({ chain: pin.chain, x: round(pin.x * scale), y: round(pin.y * scale) })) } : {}),
    ...(key.prop ? { prop: scaleProp(key.prop, scale) } : {}),
  }));
  const result = validateAnimation({ ...animation, rig: to.name, keys }, to);
  if (!result.ok) throw new Error(`retarget: ${animation.name} does not fit '${to.name}': ${result.errors[0]}`);
  return result.value;
}
