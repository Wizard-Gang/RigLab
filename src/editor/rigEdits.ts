// Rig setup edits. Each returns a whole new document that passes validateDocument, or a reason it was refused.
import type { DepthProfiles, DepthSides, Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import { validateDocument } from "../format/document";
import type { RigLabDocument } from "../format/document";
import { validateRig } from "../format/rig";
import type { AngleLimits, Chain, RigLabBone, RigLabRig } from "../format/rig";
import { isValidName, uniqueName } from "./animations";

export type RigEdit =
  | { readonly kind: "moveJoint"; readonly bone: string; readonly offset: readonly [number, number] }
  | { readonly kind: "setTip"; readonly bone: string; readonly tip: readonly [number, number] | null }
  | { readonly kind: "renameBone"; readonly bone: string; readonly name: string }
  | { readonly kind: "setSlot"; readonly bone: string; readonly slot: string }
  | { readonly kind: "setLimits"; readonly bone: string; readonly limits: AngleLimits | null }
  | { readonly kind: "addChild"; readonly bone: string }
  | { readonly kind: "deleteBone"; readonly bone: string }
  | { readonly kind: "addChain"; readonly upper: string }
  | { readonly kind: "removeChain"; readonly chain: string }
  | { readonly kind: "setBend"; readonly chain: string; readonly bend: 1 | -1 };

export type RigEditResult =
  | { readonly ok: true; readonly document: RigLabDocument; readonly message: string; readonly select?: string | null }
  | { readonly ok: false; readonly error: string };

const refuse = (error: string): RigEditResult => ({ ok: false, error });

function mapBones(rig: RigLabRig, change: (bone: RigLabBone) => RigLabBone): RigLabRig {
  return { ...rig, bones: rig.bones.map(change) };
}

function mapPoses(animations: readonly RigLabAnimation[], change: (pose: Pose) => Pose): RigLabAnimation[] {
  return animations.map((animation) => ({ ...animation, keys: animation.keys.map((key) => ({ ...key, pose: change(key.pose) })) }));
}

/** The bone and every bone below it. */
export function subtreeOf(rig: RigLabRig, name: string): Set<string> {
  const names = new Set([name]);
  for (let grew = true; grew;) {
    grew = false;
    for (const bone of rig.bones) {
      if (bone.parent !== null && names.has(bone.parent) && !names.has(bone.name)) {
        names.add(bone.name);
        grew = true;
      }
    }
  }
  return names;
}

/** Accept the edited document only if the whole document still validates; report the first failure. */
function commit(document: RigLabDocument, message: string, select?: string | null): RigEditResult {
  const result = validateDocument(document);
  if (!result.ok) return refuse(result.errors[0]!.replace(/^\$\.rig/, "rig"));
  return select === undefined ? { ok: true, document, message } : { ok: true, document, message, select };
}

function renameDepth(depth: DepthProfiles, swap: (name: string) => string): DepthProfiles {
  const pair = (sides: { readonly far: string; readonly near: string }) => ({ far: swap(sides.far), near: swap(sides.near) });
  const facing = (sides: DepthSides): DepthSides => ({ arms: pair(sides.arms), legs: pair(sides.legs) });
  return { ...depth, sides: { facingRight: facing(depth.sides.facingRight), facingLeft: facing(depth.sides.facingLeft) } };
}

function renameIn(rig: RigLabRig, from: string, to: string): RigLabRig {
  const swap = (name: string): string => (name === from ? to : name);
  return {
    ...rig,
    root: swap(rig.root),
    bones: rig.bones.map((bone) => ({ ...bone, name: swap(bone.name), parent: bone.parent === null ? null : swap(bone.parent) })),
    chains: rig.chains.map((chain) => ({ ...chain, upper: swap(chain.upper), lower: swap(chain.lower) })),
    ...(rig.depthProfiles ? { depthProfiles: renameDepth(rig.depthProfiles, swap) } : {}),
  };
}

function deleteFrom(document: RigLabDocument, removed: ReadonlySet<string>): { document: RigLabDocument; droppedDepth: boolean } {
  const { depthProfiles, ...rest } = document.rig;
  const rig: RigLabRig = {
    ...rest,
    bones: document.rig.bones.filter((bone) => !removed.has(bone.name)),
    chains: document.rig.chains.filter((chain) => !removed.has(chain.upper) && !removed.has(chain.lower)),
  };
  // Layering hints that name a deleted bone can no longer place it; they go rather than block the edit.
  const keepDepth = depthProfiles !== undefined && validateRig({ ...rig, depthProfiles }).ok;
  const animations = mapPoses(document.animations, (pose) =>
    Object.fromEntries(Object.entries(pose).filter(([bone]) => !removed.has(bone))));
  return {
    document: { ...document, rig: keepDepth ? { ...rig, depthProfiles } : rig, animations },
    droppedDepth: depthProfiles !== undefined && !keepDepth,
  };
}

export function applyRigEdit(document: RigLabDocument, edit: RigEdit): RigEditResult {
  const { rig } = document;
  const bone = "bone" in edit ? rig.bones.find((candidate) => candidate.name === edit.bone) : undefined;
  if ("bone" in edit && !bone) return refuse(`The rig has no bone '${edit.bone}'`);
  switch (edit.kind) {
    case "moveJoint":
      return commit({ ...document, rig: mapBones(rig, (b) => (b.name === edit.bone ? { ...b, offset: [...edit.offset] } : b)) },
        `Moved ${edit.bone} to ${edit.offset.map((value) => +value.toFixed(3)).join(", ")}`);
    case "setTip":
      return commit({ ...document, rig: mapBones(rig, (b) => (b.name === edit.bone ? { ...b, tip: edit.tip && [...edit.tip] } : b)) },
        edit.tip ? `Set the tip of ${edit.bone}` : `Removed the tip of ${edit.bone}`);
    case "setSlot":
      if (!isValidName(edit.slot)) return refuse(`'${edit.slot}' is not a valid slot name`);
      return commit({ ...document, rig: mapBones(rig, (b) => (b.name === edit.bone ? { ...b, slot: edit.slot } : b)) }, `Set the slot of ${edit.bone}`);
    case "setLimits":
      return commit({ ...document, rig: mapBones(rig, (b) => (b.name === edit.bone ? { ...b, limits: edit.limits && { ...edit.limits } } : b)) },
        edit.limits ? `Limited ${edit.bone} to ${edit.limits.min}° to ${edit.limits.max}°` : `Removed the limits of ${edit.bone}`);
    case "renameBone": {
      if (edit.name === edit.bone) return refuse("The name is unchanged");
      if (!isValidName(edit.name)) return refuse(`'${edit.name}' is not a valid name: use 1-64 letters, digits, '_' or '-', starting with a letter`);
      if (rig.bones.some((candidate) => candidate.name === edit.name)) return refuse(`A bone named '${edit.name}' already exists`);
      const animations = mapPoses(document.animations, (pose) =>
        Object.fromEntries(Object.entries(pose).map(([name, value]) => [name === edit.bone ? edit.name : name, value])));
      return commit({ ...document, rig: renameIn(rig, edit.bone, edit.name), animations }, `Renamed ${edit.bone} to ${edit.name}`, edit.name);
    }
    case "addChild": {
      const name = uniqueName("bone", rig.bones.map((candidate) => candidate.name));
      const child: RigLabBone = { name, parent: edit.bone, offset: [0, 10], tip: null, slot: name, artHeight: 0, hand: null, limits: null };
      const animations = mapPoses(document.animations, (pose) => ({ ...pose, [name]: { rotation: 0 } }));
      return commit({ ...document, rig: { ...rig, bones: [...rig.bones, child] }, animations }, `Added ${name} under ${edit.bone}`, name);
    }
    case "deleteBone": {
      if (edit.bone === rig.root) return refuse("The root bone cannot be deleted");
      const removed = subtreeOf(rig, edit.bone);
      const result = deleteFrom(document, removed);
      const count = removed.size === 1 ? edit.bone : `${edit.bone} and ${removed.size - 1} bone${removed.size === 2 ? "" : "s"} below it`;
      return commit(result.document, `Deleted ${count}${result.droppedDepth ? "; its depth profiles named a deleted bone and were removed" : ""}`, bone!.parent);
    }
    case "addChain": {
      const children = rig.bones.filter((candidate) => candidate.parent === edit.upper);
      if (children.length !== 1) return refuse(`A chain needs '${edit.upper}' to have exactly one child`);
      const chain: Chain = { name: edit.upper, upper: edit.upper, lower: children[0]!.name, bend: 1 };
      return commit({ ...document, rig: { ...rig, chains: [...rig.chains, chain] } }, `Added chain ${chain.name}`);
    }
    case "removeChain":
      return commit({ ...document, rig: { ...rig, chains: rig.chains.filter((chain) => chain.name !== edit.chain) } }, `Removed chain ${edit.chain}`);
    case "setBend":
      return commit({ ...document, rig: { ...rig, chains: rig.chains.map((chain) => (chain.name === edit.chain ? { ...chain, bend: edit.bend } : chain)) } },
        `Set ${edit.chain} to bend ${edit.bend > 0 ? "+" : "−"}`);
    default:
      return refuse("Unknown edit");
  }
}
