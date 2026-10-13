// Rotation-only posing on top of Hexframe's FK. No solve here can translate a non-root bone, so lengths never change.
import { forwardKinematics } from "../../vendor/hexframe/src/rig";
import type { Placed, Pose, Rig } from "../../vendor/hexframe/src/rig";
import { boneOf, createRigLabRig } from "../format/rig";
import type { RigLabRig } from "../format/rig";
import { angleOf, clampToLimits, DEG, lengthOf, nearest, snapAngle, tidy, toVector } from "./angles";
import type { Vector } from "./angles";

export type SolveStatus = "ok" | "limited" | "unreachable";

export interface Solved {
  readonly pose: Pose;
  readonly status: SolveStatus;
  readonly message: string | null;
}

const resolved = new WeakMap<RigLabRig, Rig>();

/** Hexframe's runtime rig for a RigLab rig, resolved once per rig object. */
export function runtimeRig(rig: RigLabRig): Rig {
  let runtime = resolved.get(rig);
  if (!runtime) {
    runtime = createRigLabRig(rig);
    resolved.set(rig, runtime);
  }
  return runtime;
}

export function place(rig: RigLabRig, pose: Pose): ReadonlyMap<string, Placed> {
  return forwardKinematics(runtimeRig(rig), pose);
}

/** World rotation of a bone's parent, in degrees; 0 for the root. */
export function parentRotation(rig: RigLabRig, placed: ReadonlyMap<string, Placed>, bone: string): number {
  const parent = boneOf(rig, bone).parent;
  return parent === null ? 0 : placed.get(parent)!.rotation * DEG;
}

export function withRotation(pose: Pose, bone: string, degrees: number): Pose {
  return { ...pose, [bone]: { ...pose[bone], rotation: tidy(degrees) } };
}

const ok = (pose: Pose): Solved => ({ pose, status: "ok", message: null });

/** Set a local rotation, snapped to `snap` degrees (0 for none) and then held inside the bone's limits. */
export function setRotation(rig: RigLabRig, pose: Pose, bone: string, degrees: number, snap = 0): Solved {
  const snapped = snapAngle(degrees, snap);
  const clamped = clampToLimits(snapped, boneOf(rig, bone).limits);
  const next = withRotation(pose, bone, clamped);
  return clamped === snapped ? ok(next) : { pose: next, status: "limited", message: `${bone} is held at its ${clamped < snapped ? "maximum" : "minimum"} angle` };
}

/** Rotate `bone` so the point `local` (in the bone's own frame) points from the bone's joint toward `target`. */
export function aimBone(rig: RigLabRig, pose: Pose, bone: string, local: Vector, target: Vector, snap = 0): Solved {
  const placed = place(rig, pose);
  const at = placed.get(bone)!;
  const toTarget = { x: target.x - at.x, y: target.y - at.y };
  if (lengthOf(toTarget) < 1e-9 || lengthOf(local) < 1e-9) return ok(pose);
  const current = pose[bone]?.rotation ?? 0;
  const wanted = angleOf(toTarget) - angleOf(local) - parentRotation(rig, placed, bone);
  return setRotation(rig, pose, bone, nearest(wanted, current), snap);
}

/** Place the root joint at `target`; translation is the root's alone. */
export function moveRoot(rig: RigLabRig, pose: Pose, target: Vector): Solved {
  const [x, y] = boneOf(rig, rig.root).offset;
  return ok({ ...pose, [rig.root]: { ...pose[rig.root], x: tidy(target.x - x), y: tidy(target.y - y) } });
}

/** Drag a joint: the root translates; any other joint swings its parent bone about the parent's joint. */
export function dragJoint(rig: RigLabRig, pose: Pose, bone: string, target: Vector, snap = 0): Solved {
  const { parent, offset } = boneOf(rig, bone);
  if (parent === null) return moveRoot(rig, pose, target);
  return aimBone(rig, pose, parent, toVector(offset), target, snap);
}
